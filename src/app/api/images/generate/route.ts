import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"

import type { ImageVersion } from "@/lib/canvas/types"

type GenerateImageRequest = {
  baseUrl?: string
  apiKey?: string
  model?: string
  prompt?: string
  feedback?: string
  parentVersionId?: string
  sourceImageSrc?: string
  width?: number
  height?: number
}

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string
    result?: string
    url?: string
    revised_prompt?: string
    image?: string | { b64_json?: string; base64?: string; url?: string }
    image_url?: string | { url?: string }
  }>
  images?: Array<{
    b64_json?: string
    base64?: string
    url?: string
  }>
  output?: Array<{
    type?: string
    result?: string
    revised_prompt?: string
    content?: Array<{
      type?: string
      b64_json?: string
      result?: string
      image?: string
      image_url?: string | { url?: string }
    }>
  }>
  choices?: Array<{
    message?: {
      content?: string
      images?: Array<{
        type?: string
        image_url?: string | { url?: string }
        url?: string
      }>
    }
  }>
  error?: {
    message?: string
  }
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "")
const truncate = (value: string, length = 500) => (value.length > length ? `${value.slice(0, length)}…` : value)
const OPENROUTER_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const

function mimeTypeForPath(path: string) {
  switch (extname(path).toLowerCase()) {
    case ".svg":
      return "image/svg+xml"
    case ".webp":
      return "image/webp"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    default:
      return "image/png"
  }
}

function imageEndpointFor(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  const url = new URL(normalized)
  const isOpenRouter = url.hostname === "openrouter.ai" || url.hostname.endsWith(".openrouter.ai")

  if (!isOpenRouter) {
    return {
      provider: "openai-compatible" as const,
      targetUrl: `${normalized}/images/generations`,
    }
  }

  const apiBase = url.pathname.startsWith("/api/v1") ? normalized : `${url.origin}/api/v1`

  return {
    provider: "openrouter" as const,
    targetUrl: `${apiBase}/chat/completions`,
  }
}

const asDataUrl = (value?: string | null) => {
  if (!value) return null
  if (/^data:image\//.test(value) || /^https?:\/\//.test(value)) return value
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 80) {
    return `data:image/png;base64,${value}`
  }
  return null
}

const imageFromNestedValue = (
  value?: string | { b64_json?: string; base64?: string; url?: string } | { url?: string } | null
) => {
  if (!value) return null
  if (typeof value === "string") return asDataUrl(value)
  return asDataUrl("b64_json" in value ? value.b64_json : null) ?? asDataUrl("base64" in value ? value.base64 : null) ?? asDataUrl(value.url)
}

function ratioValue(ratio: string) {
  const [width, height] = ratio.split(":").map(Number)
  return width / height
}

function nearestOpenRouterAspectRatio(width: number, height: number) {
  const target = width / height

  return OPENROUTER_ASPECT_RATIOS.reduce((best, candidate) => {
    const bestDistance = Math.abs(Math.log(target / ratioValue(best)))
    const candidateDistance = Math.abs(Math.log(target / ratioValue(candidate)))
    return candidateDistance < bestDistance ? candidate : best
  }, OPENROUTER_ASPECT_RATIOS[0])
}

function composeImagePrompt({
  prompt,
  feedback,
  hasSourceImage,
}: {
  prompt: string
  feedback?: string
  hasSourceImage: boolean
}) {
  if (!feedback?.trim()) return prompt

  if (!hasSourceImage) {
    return [
      prompt,
      "",
      "请根据以下画布批注修改图片，但尽量保持原始主体、构图、比例、视角、光线和整体风格；只修改批注明确要求的部分，不要随意重画整张图。",
      feedback.trim(),
    ].join("\n")
  }

  return [
    "Use the attached image as the source image and visual base.",
    "Apply ONLY the requested annotation change. Preserve the original subject, composition, camera angle, layout, aspect ratio, lighting, color palette, typography, and style unless the annotation explicitly asks to change them.",
    "Do not redesign or redraw the whole image. Keep all unannotated regions as unchanged as possible.",
    "Remove any annotation artifacts from the final output, including arrows, labels, selection outlines, handles, and UI chrome.",
    "Output only the revised clean image.",
    "",
    `Original image intent: ${prompt}`,
    "",
    `Annotation edit request: ${feedback.trim()}`,
  ].join("\n")
}

async function sourceImageToModelUrl(sourceImageSrc?: string) {
  if (!sourceImageSrc) return null
  if (sourceImageSrc.startsWith("data:image/")) return sourceImageSrc
  if (/^https?:\/\//.test(sourceImageSrc)) return sourceImageSrc

  if (!sourceImageSrc.startsWith("/canvas-assets/")) return null

  const fileName = sourceImageSrc.slice("/canvas-assets/".length)
  if (!fileName || fileName.includes("/") || fileName.includes("..")) return null

  const filePath = join(process.cwd(), "public", "canvas-assets", fileName)
  const buffer = await readFile(filePath)
  return `data:${mimeTypeForPath(fileName)};base64,${buffer.toString("base64")}`
}

function extractImageResult(payload: OpenAIImageResponse) {
  const image = payload.data?.[0]
  const dataImage =
    asDataUrl(image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null) ??
    asDataUrl(image?.result) ??
    asDataUrl(image?.url) ??
    imageFromNestedValue(image?.image) ??
    imageFromNestedValue(image?.image_url)

  if (dataImage) {
    return {
      src: dataImage,
      revisedPrompt: image?.revised_prompt,
    }
  }

  const listedImage = payload.images?.[0]
  const imagesImage =
    asDataUrl(listedImage?.b64_json ? `data:image/png;base64,${listedImage.b64_json}` : null) ??
    asDataUrl(listedImage?.base64) ??
    asDataUrl(listedImage?.url)

  if (imagesImage) {
    return {
      src: imagesImage,
      revisedPrompt: undefined,
    }
  }

  const outputImage = payload.output?.find((item) => item.type === "image_generation_call" && item.result)
  if (outputImage?.result) {
    return {
      src: asDataUrl(outputImage.result),
      revisedPrompt: outputImage.revised_prompt,
    }
  }

  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      const contentImage =
        asDataUrl(content.b64_json ? `data:image/png;base64,${content.b64_json}` : null) ??
        asDataUrl(content.result) ??
        asDataUrl(content.image) ??
        imageFromNestedValue(content.image_url)

      if (contentImage) {
        return {
          src: contentImage,
          revisedPrompt: output.revised_prompt,
        }
      }
    }
  }

  const choiceImage = payload.choices?.[0]?.message?.images?.[0]
  const openRouterImage = imageFromNestedValue(choiceImage?.image_url) ?? asDataUrl(choiceImage?.url)

  if (openRouterImage) {
    return {
      src: openRouterImage,
      revisedPrompt: payload.choices?.[0]?.message?.content,
    }
  }

  return null
}

function summarizePayloadShape(payload: unknown) {
  if (!payload || typeof payload !== "object") return "非 JSON 对象"
  const root = payload as Record<string, unknown>
  const rootKeys = Object.keys(root).slice(0, 10).join(", ") || "无字段"
  const dataKeys =
    Array.isArray(root.data) && root.data[0] && typeof root.data[0] === "object"
      ? Object.keys(root.data[0] as Record<string, unknown>).slice(0, 10).join(", ")
      : ""
  const outputKeys =
    Array.isArray(root.output) && root.output[0] && typeof root.output[0] === "object"
      ? Object.keys(root.output[0] as Record<string, unknown>).slice(0, 10).join(", ")
      : ""
  const choiceKeys =
    Array.isArray(root.choices) && root.choices[0] && typeof root.choices[0] === "object"
      ? Object.keys(root.choices[0] as Record<string, unknown>).slice(0, 10).join(", ")
      : ""

  return [
    `根字段：${rootKeys}`,
    dataKeys ? `data[0] 字段：${dataKeys}` : "",
    outputKeys ? `output[0] 字段：${outputKeys}` : "",
    choiceKeys ? `choices[0] 字段：${choiceKeys}` : "",
  ]
    .filter(Boolean)
    .join("；")
}

function parseJsonBody(text: string) {
  if (!text.trim()) return {}

  try {
    return JSON.parse(text) as OpenAIImageResponse
  } catch {
    return {}
  }
}

function diagnosticMessage({
  targetUrl,
  status,
  contentType,
  rawText,
  payload,
}: {
  targetUrl: string
  status: number
  contentType: string
  rawText: string
  payload: unknown
}) {
  const bodyHint = rawText.trim() ? `返回片段：${truncate(rawText.trim())}` : "返回体为空"
  return `已请求模型接口 ${targetUrl}，HTTP ${status}，content-type: ${contentType || "未知"}；${bodyHint}；${summarizePayloadShape(payload)}`
}

const createVersion = ({
  prompt,
  feedback,
  parentVersionId,
  src,
  width,
  height,
}: {
  prompt: string
  feedback?: string
  parentVersionId?: string
  src: string
  width: number
  height: number
}): ImageVersion => ({
  versionId: `version-${globalThis.crypto.randomUUID()}`,
  parentVersionId,
  prompt,
  feedback,
  src,
  width,
  height,
  createdAt: new Date().toISOString(),
})

function bodyForProvider({
  provider,
  model,
  composedPrompt,
  width,
  height,
  sourceImageSrc,
}: {
  provider: ReturnType<typeof imageEndpointFor>["provider"]
  model: string
  composedPrompt: string
  width: number
  height: number
  sourceImageSrc?: string | null
}) {
  if (provider === "openrouter") {
    return {
      model,
      messages: [
        {
          role: "user",
          content: sourceImageSrc
            ? [
                {
                  type: "text",
                  text: composedPrompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: sourceImageSrc,
                  },
                },
              ]
            : composedPrompt,
        },
      ],
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: nearestOpenRouterAspectRatio(width, height),
      },
    }
  }

  return {
    model,
    prompt: composedPrompt,
    n: 1,
    size: "auto",
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateImageRequest
  const baseUrl = body.baseUrl?.trim()
  const apiKey = body.apiKey?.trim()
  const model = body.model?.trim() || "gpt-image-1"
  const prompt = body.prompt?.trim() || "生成一张图片"
  const width = Math.max(1, Math.round(body.width ?? 1024))
  const height = Math.max(1, Math.round(body.height ?? 1024))

  if (!baseUrl || !apiKey) {
    return Response.json({ error: "缺少 Base URL 或 API Key" }, { status: 400 })
  }

  const { provider, targetUrl } = imageEndpointFor(baseUrl)
  const sourceImageSrc = provider === "openrouter" ? await sourceImageToModelUrl(body.sourceImageSrc) : null
  const composedPrompt = composeImagePrompt({
    prompt,
    feedback: body.feedback,
    hasSourceImage: Boolean(sourceImageSrc),
  })
  const upstream = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyForProvider({ provider, model, composedPrompt, width, height, sourceImageSrc })),
  })

  const rawText = await upstream.text()
  const payload = parseJsonBody(rawText)
  const contentType = upstream.headers.get("content-type") ?? ""
  const diagnostic = diagnosticMessage({
    targetUrl,
    status: upstream.status,
    contentType,
    rawText,
    payload,
  })

  if (!upstream.ok) {
    return Response.json(
      {
        error: payload.error?.message ?? `图片生成接口请求失败：${diagnostic}`,
      },
      { status: upstream.status }
    )
  }

  const image = extractImageResult(payload)

  if (!image?.src) {
    return Response.json(
      {
        error: `图片生成接口没有返回可识别的图片数据（${diagnostic}）`,
      },
      { status: 502 }
    )
  }

  return Response.json({
    version: createVersion({
      prompt: image.revisedPrompt ?? prompt,
      feedback: body.feedback,
      parentVersionId: body.parentVersionId,
      src: image.src,
      width,
      height,
    }),
  })
}
