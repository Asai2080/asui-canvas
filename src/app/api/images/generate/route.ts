import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"
import sharp from "sharp"

import type { ImageVersion } from "@/lib/canvas/types"

import { normalizeImageModelName } from "../../../../lib/canvas/api-config"

type GenerateImageRequest = {
  baseUrl?: string
  apiKey?: string
  model?: string
  prompt?: string
  feedback?: string
  feedbackItems?: Array<{
    label?: string
    text?: string
    taskType?: "color edit" | "text replacement" | "object replacement" | "localized edit"
    targetHint?: string
    bounds?: {
      x: number
      y: number
      w: number
      h: number
    }
  }>
  parentVersionId?: string
  sourceImageSrc?: string
  referenceImageSrcs?: string[]
  referenceAssets?: Array<{
    src?: string
    name?: string
    mediaType?: "image" | "video"
    mimeType?: string
  }>
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
  object?: string
}

type ImageProvider = "openai-compatible" | "openrouter"

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "")
const truncate = (value: string, length = 500) => (value.length > length ? `${value.slice(0, length)}…` : value)
const OPENROUTER_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const

function parseBaseUrl(baseUrl: string) {
  try {
    const url = new URL(normalizeBaseUrl(baseUrl))
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url
  } catch {
    return null
  }
}

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
  const url = parseBaseUrl(baseUrl)
  if (!url) {
    return null
  }
  const isOpenRouter = url.hostname === "openrouter.ai" || url.hostname.endsWith(".openrouter.ai")

  if (!isOpenRouter) {
    return {
      provider: "openai-compatible" as ImageProvider,
      targetUrl: `${normalized}/images/generations`,
    }
  }

  const apiBase = url.pathname.startsWith("/api/v1") ? normalized : `${url.origin}/api/v1`

  return {
    provider: "openrouter" as ImageProvider,
    targetUrl: `${apiBase}/images`,
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

function roundUpToMultiple(value: number, multiple: number) {
  return Math.ceil(value / multiple) * multiple
}

function nearestStandardImageSize(width: number, height: number) {
  const target = width / height
  const standardSizes = ["1024x1024", "1536x1024", "1024x1536"] as const

  return standardSizes.reduce((best, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split("x").map(Number)
    const [bestWidth, bestHeight] = best.split("x").map(Number)
    const candidateDistance = Math.abs(Math.log(target / (candidateWidth / candidateHeight)))
    const bestDistance = Math.abs(Math.log(target / (bestWidth / bestHeight)))
    return candidateDistance < bestDistance ? candidate : best
  }, standardSizes[0])
}

function supportsExplicitPixelSize(model: string) {
  return /(?:^|\/)gpt(?:-[\d.]+)?-image-2(?:-|$)/i.test(model)
}

function openAiCompatibleSizeFor(model: string, width: number, height: number) {
  const normalizedModel = model.toLowerCase()

  if (supportsExplicitPixelSize(normalizedModel)) {
    const minimumPixelBudget = 655_360
    const requestedWidth = roundUpToMultiple(width, 16)
    const requestedHeight = roundUpToMultiple(height, 16)
    const budgetScale = Math.sqrt(
      minimumPixelBudget / (requestedWidth * requestedHeight)
    )
    const nextWidth = Math.min(
      roundUpToMultiple(Math.ceil(requestedWidth * Math.max(1, budgetScale)), 16),
      3840
    )
    const nextHeight = Math.min(
      roundUpToMultiple(Math.ceil(requestedHeight * Math.max(1, budgetScale)), 16),
      3840
    )
    return `${nextWidth}x${nextHeight}`
  }

  if (normalizedModel.includes("dall-e-2")) {
    return "1024x1024"
  }

  if (normalizedModel.includes("dall-e-3")) {
    const target = width / height
    if (target > 1.2) return "1792x1024"
    if (target < 0.8) return "1024x1792"
    return "1024x1024"
  }

  return nearestStandardImageSize(width, height)
}

function composeFeedback(feedback?: string, feedbackItems?: GenerateImageRequest["feedbackItems"]) {
  const items = (feedbackItems ?? [])
    .map((item) => ({
      label: item.label?.trim() || "标注区域",
      text: item.text?.trim() ?? "",
      taskType: item.taskType,
      targetHint: item.targetHint?.trim(),
      bounds: item.bounds,
    }))
    .filter((item) => item.text)

  if (items.length === 0) return feedback?.trim() || undefined

  const describeBounds = (bounds?: { x: number; y: number; w: number; h: number }) => {
    if (!bounds) return ""
    const percent = (value: number) => `${Math.round(value * 100)}%`
    return `, normalized region x=${percent(bounds.x)}, y=${percent(bounds.y)}, w=${percent(bounds.w)}, h=${percent(bounds.h)}`
  }

  const classifyTask = (text: string) => {
    if (/颜色|色彩|色调|红色|蓝色|绿色|黄色|黑色|白色|紫色|橙色|改红|变红|换色|上色/.test(text)) {
      return "color edit"
    }
    if (/文字|标题|文案|字体|改字|替换文字|改成.*字|改为.*字/.test(text)) {
      return "text replacement"
    }
    if (/改为|修改为|替换为|换成|变成/.test(text)) {
      return "object replacement"
    }
    return "localized edit"
  }

  return [
    "Apply the following canvas annotations as one unified edit request.",
    `There are ${items.length} required annotation tasks. Read all tasks first, then make one coherent final image that satisfies every task.`,
    "Treat every numbered annotation as a required checklist item. The output is only acceptable if EVERY checklist item is completed in the same image.",
    "Different task types must not override each other. For example, if one task changes an object color and another task changes text, perform both in the same final result.",
    "Handwritten annotation words, circles, arrows, and marks in the reference image are instructions and location hints only. They must NOT be copied, rendered, or treated as design elements in the final image.",
    "For text replacement requests, replace the visible text in that annotated region with the exact requested text. Do not paraphrase, invent a new title, translate, summarize, or change only one text region.",
    "For Chinese poster text edits, behave like an OCR-aware retoucher: identify the exact annotated text block, preserve its visual style, and substitute the requested Chinese characters exactly.",
    "For color edits, recolor the object inside the annotated region while preserving its structure, material detail, lighting, and shadows.",
    "For object replacement edits, replace the visual object inside the annotated region with the requested object. Do not simply add the requested word as text.",
    "Only change the regions requested by these annotations. Preserve unannotated regions as much as possible.",
    "",
    "Structured required checklist:",
    ...items.map(
      (item, index) =>
        `${index + 1}. task_type=${item.taskType ?? classifyTask(item.text)}; target=${item.label}${describeBounds(item.bounds)}; instruction="${item.text}"${
          item.targetHint ? `; target_hint="${item.targetHint}"` : ""
        }`
    ),
    "",
    `Before producing the final image, internally verify that all ${items.length} checklist items are visible in the final result.`,
  ].join("\n")
}

function composeImagePrompt({
  prompt,
  feedback,
  hasSourceImage,
  referenceImageCount,
}: {
  prompt: string
  feedback?: string
  hasSourceImage: boolean
  referenceImageCount: number
}) {
  const feedbackText = feedback?.trim() ?? ""
  const hasFeedback = Boolean(feedbackText)

  if (!hasFeedback && (hasSourceImage || referenceImageCount > 0)) {
    const total = referenceImageCount + (hasSourceImage ? 1 : 0)
    return [
      `There ${total === 1 ? "is" : "are"} ${total} explicitly selected reference image${total > 1 ? "s" : ""} attached to this generation request.`,
      hasSourceImage
        ? "Reference image 1 is the user's actively selected primary canvas image. Treat later images as supporting references only."
        : "Treat the first attached image as the primary reference and later images as supporting references.",
      "Use the category-specific reference protocol inside the text prompt to decide whether each image controls identity, product geometry, UI layout, visual style, composition, palette, or materials.",
      "Generate a new clean image from the user's text prompt. Do not copy UI chrome, upload thumbnails, selection handles, or canvas controls.",
      "If multiple references are provided, synthesize their useful visual traits coherently instead of producing separate images.",
      "Follow the text prompt as the primary instruction when it conflicts with a reference image.",
      "",
      `Text prompt: ${prompt}`,
    ].join("\n")
  }

  if (!hasFeedback) return prompt

  if (!hasSourceImage) {
    return [
      prompt,
      "",
      "请根据以下画布批注修改图片，但尽量保持原始主体、构图、比例、视角、光线和整体风格；只修改批注明确要求的部分，不要随意重画整张图。",
      feedbackText,
    ].join("\n")
  }

  return [
    "Use the attached image as the source image and visual base.",
    "The attached source may include visible canvas annotations such as circles, handwritten notes, arrows, or selection marks. Use those marks only to locate the edit regions, and remove them from the final image.",
    "Do not copy handwritten annotation text into the image. Treat annotation text as instructions only.",
    "Apply ONLY the requested annotation changes. Preserve the original subject, composition, camera angle, layout, aspect ratio, lighting, color palette, typography, and style unless the annotation explicitly asks to change them.",
    "If there are multiple numbered annotations, complete all of them. Do not stop after the first successful edit.",
    "When an annotation asks to modify visible text, keep the surrounding typography style but use the exact requested replacement text.",
    "For Chinese text on posters, do not invent alternate slogans or titles. The replacement text provided in the annotation is mandatory.",
    "Do not redesign or redraw the whole image. Keep all unannotated regions as unchanged as possible.",
    "Remove any annotation artifacts from the final output, including arrows, labels, selection outlines, handles, and UI chrome.",
    "Output only the revised clean image.",
    "",
    `Original image intent: ${prompt}`,
    "",
    `Annotation edit request: ${feedbackText}`,
  ].join("\n")
}

async function sourceImageToModelUrl(sourceImageSrc?: string) {
  if (!sourceImageSrc) return null
  if (sourceImageSrc.startsWith("data:image/")) return sourceImageSrc
  if (/^https?:\/\//.test(sourceImageSrc)) return sourceImageSrc

  const publicAssetDirectory = sourceImageSrc.startsWith("/canvas-assets/")
    ? "canvas-assets"
    : sourceImageSrc.startsWith("/builtin-skill-assets/")
      ? "builtin-skill-assets"
      : null
  if (!publicAssetDirectory) return null

  const fileName = sourceImageSrc.slice(`/${publicAssetDirectory}/`.length)
  if (!fileName || fileName.includes("/") || fileName.includes("..")) return null

  const filePath = join(process.cwd(), "public", publicAssetDirectory, fileName)
  const buffer = await readFile(filePath)
  return `data:${mimeTypeForPath(fileName)};base64,${buffer.toString("base64")}`
}

function detectReferenceMediaType(asset: {
  src?: string
  name?: string
  mediaType?: "image" | "video"
  mimeType?: string
}) {
  if (asset.mediaType === "image" || asset.mediaType === "video") return asset.mediaType
  if (asset.mimeType?.startsWith("video/")) return "video"
  if (asset.mimeType?.startsWith("image/")) return "image"
  if (asset.src?.startsWith("data:video/")) return "video"
  if (asset.src?.startsWith("data:image/")) return "image"

  const nameOrUrl = `${asset.name ?? ""} ${asset.src ?? ""}`.toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/.test(nameOrUrl)) return "video"
  return "image"
}

function normalizeReferenceAssets(body: GenerateImageRequest) {
  const legacyImages = (body.referenceImageSrcs ?? []).map((src) => ({
    src,
    mediaType: "image" as const,
  }))
  const explicitAssets = (body.referenceAssets ?? []).filter((asset) => asset.src)

  return [...legacyImages, ...explicitAssets]
    .slice(0, 20)
    .map((asset) => ({
      ...asset,
      src: asset.src ?? "",
      mediaType: detectReferenceMediaType(asset),
    }))
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

function friendlyUpstreamError(message?: string, fallback?: string) {
  if (!message?.trim()) return fallback ?? "图片生成接口请求失败"

  if (/insufficient credits|add more using|settings\/credits/i.test(message)) {
    return "图片模型账户余额不足，OpenRouter 返回 Insufficient credits。请先充值或切换到有额度的图片模型后再试。"
  }

  const safetyMatch = message.match(/safety_violations=\[([^\]]+)\]/i)
  const requestIdMatch =
    message.match(/\breq_[A-Za-z0-9_-]+\b/) ??
    message.match(/\brequest ID\s+([A-Za-z0-9_-]{8,})/i) ??
    message.match(/\brequest id[:：]?\s*([A-Za-z0-9_-]{8,})/i)

  if (safetyMatch) {
    const reasons = safetyMatch[1]
      .split(",")
      .map((reason) => reason.trim())
      .filter(Boolean)
      .join("、")

    return [
      `模型安全系统拒绝了这次生成${reasons ? `（原因：${reasons}）` : ""}。`,
      "请检查提示词、图片内容或标注文案，删掉容易被误判的词后再试。",
      requestIdMatch ? `请求 ID：${requestIdMatch[0]}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  if (/rejected by the safety system|safety system rejected|safety policy/i.test(message)) {
    return [
      "模型安全系统拒绝了这次生成。",
      "这通常是提示词、参考图内容或标注文案被上游模型误判，不是字体、画布尺寸或前端按钮导致。",
      "可以先删掉容易被误判的词，或换一张更明确的参考图后再试。",
      requestIdMatch ? `请求 ID：${requestIdMatch[1] ?? requestIdMatch[0]}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  return message
}

function debugPromptSummary({
  provider,
  model,
  width,
  height,
  hasSourceImage,
  prompt,
  feedback,
}: {
  provider: ImageProvider
  model: string
  width: number
  height: number
  hasSourceImage: boolean
  prompt: string
  feedback?: string
}) {
  return {
    provider,
    model,
    size: `${width}x${height}`,
    hasSourceImage,
    promptPreview: truncate(prompt.replace(/\s+/g, " "), 180),
    feedbackPreview: feedback ? truncate(feedback.replace(/\s+/g, " "), 260) : "",
  }
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
  referenceImageSrcs,
}: {
  provider: ImageProvider
  model: string
  composedPrompt: string
  width: number
  height: number
  sourceImageSrc?: string | null
  referenceImageSrcs?: string[]
}) {
  const requiresTransparentBackground =
    /真实\s*RGBA\s*透明通道|true\s+alpha|transparent\s+(?:png|background)/i.test(
      composedPrompt
    )
  const inputReferences = [sourceImageSrc, ...(referenceImageSrcs ?? [])]
    .filter((src): src is string => Boolean(src))
    .slice(0, 20)
    .map((src) => ({
      type: "image_url",
      image_url: {
        url: src,
      },
    }))

  if (provider === "openrouter") {
    if (supportsExplicitPixelSize(model)) {
      const size = openAiCompatibleSizeFor(model, width, height)
      const [providerWidth, providerHeight] = size.split("x").map(Number)
      const uiImage = /高保真(?:产品)?界面|单屏\s*UI|UI\s*成片|App\s*首页/i.test(
        composedPrompt
      )
      const sizePrompt = uiImage &&
        (providerWidth !== width || providerHeight !== height)
        ? `\n\n【OpenRouter 像素适配】API 将以最接近且可用的 ${size} 生成，随后等比微裁为严格 ${width} × ${height}；不拉伸、不增加留白。四边保留既定安全区，任何文字、图标、按钮、卡片、图表和导航都不得接触画布边缘。`
        : ""
      return {
        model,
        prompt: `${composedPrompt}${sizePrompt}`,
        size,
        output_format: "png",
        ...(inputReferences.length ? { input_references: inputReferences } : {}),
      }
    }
    const aspectRatio = nearestOpenRouterAspectRatio(width, height)
    const [providerWidth, providerHeight] = aspectRatio.split(":").map(Number)
    const providerRatio = providerWidth / providerHeight
    const targetRatio = width / height
    const uiImage = /高保真(?:产品)?界面|单屏\s*UI|UI\s*成片|App\s*首页/i.test(
      composedPrompt
    )
    const ratioMismatch = Math.abs(Math.log(providerRatio / targetRatio)) > 0.01
    const horizontalSafePercent = Math.max(
      15,
      Math.ceil(((1 - targetRatio / providerRatio) / 2) * 100) + 6
    )
    const framingPrompt = uiImage && ratioMismatch
      ? providerRatio > targetRatio
        ? `\n\n【OpenRouter 画幅适配】API 只能生成 ${aspectRatio}，最终会等比完整缩放到严格 ${width}:${height}，空余区域使用界面背景色延展；不会拉伸变形，也不会裁掉界面内容。左右各保留至少 ${horizontalSafePercent}% 的内部安全边距。`
        : `\n\n【OpenRouter 画幅适配】API 只能生成 ${aspectRatio}，最终会等比完整缩放到严格 ${width}:${height}，空余区域使用界面背景色延展；不会拉伸变形，也不会裁掉界面内容。上下各保留至少 ${Math.ceil(((1 - providerRatio / targetRatio) / 2) * 100) + 6}% 的内部安全边距。`
      : ""
    return {
      model,
      prompt: `${composedPrompt}${framingPrompt}`,
      aspect_ratio: aspectRatio,
      output_format: "png",
      ...(inputReferences.length ? { input_references: inputReferences } : {}),
    }
  }

  return {
    model,
    prompt: composedPrompt,
    n: 1,
    size: openAiCompatibleSizeFor(model, width, height),
    ...(requiresTransparentBackground
      ? { background: "transparent", output_format: "png" }
      : {}),
  }
}

async function normalizeGeneratedImageSize(
  src: string,
  width: number,
  height: number,
  fit: "cover" | "contain" = "cover"
) {
  let input: Buffer
  if (src.startsWith("data:image/")) {
    const encoded = src.slice(src.indexOf(",") + 1)
    input = Buffer.from(encoded, "base64")
  } else {
    // Keep provider-hosted URLs untouched. Downloading and rewriting a remote
    // asset here would add a second network failure point to a successful job.
    return src
  }

  try {
    const metadata = await sharp(input).metadata()
    if (metadata.width === width && metadata.height === height) return src
    let background: { r: number; g: number; b: number; alpha: number } | undefined
    if (fit === "contain") {
      const { data, info } = await sharp(input)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const cornerOffsets = [
        0,
        (info.width - 1) * info.channels,
        (info.height - 1) * info.width * info.channels,
        (info.height * info.width - 1) * info.channels,
      ]
      const averageChannel = (channel: number, fallback: number) =>
        Math.round(
          cornerOffsets.reduce(
            (sum, offset) => sum + (data[offset + channel] ?? fallback),
            0
          ) / cornerOffsets.length
        )
      background = {
        r: averageChannel(0, 247),
        g: averageChannel(1, 248),
        b: averageChannel(2, 244),
        alpha: averageChannel(3, 255) / 255,
      }
    }
    const output = await sharp(input)
      .resize(width, height, {
        fit,
        position: "centre",
        ...(background ? { background } : {}),
      })
      .png()
      .toBuffer()
    return `data:image/png;base64,${output.toString("base64")}`
  } catch {
    // Some compatible providers return opaque test fixtures or URLs that cannot
    // be decoded locally. Keep their response instead of rejecting valid output.
    return src
  }
}

async function requestImageGeneration({
  targetUrl,
  apiKey,
  provider,
  model,
  composedPrompt,
  width,
  height,
  sourceImageSrc,
  referenceImageSrcs,
}: {
  targetUrl: string
  apiKey: string
  provider: ImageProvider
  model: string
  composedPrompt: string
  width: number
  height: number
  sourceImageSrc?: string | null
  referenceImageSrcs?: string[]
}) {
  const upstream = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(
      bodyForProvider({ provider, model, composedPrompt, width, height, sourceImageSrc, referenceImageSrcs })
    ),
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

  return {
    upstream,
    rawText,
    payload,
    contentType,
    diagnostic,
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateImageRequest
  const baseUrl = body.baseUrl?.trim()
  const apiKey = body.apiKey?.trim()
  const model = normalizeImageModelName(body.model ?? "") || "gpt-image-1"
  const prompt = body.prompt?.trim() || "生成一张图片"
  const width = Math.max(1, Math.round(body.width ?? 1024))
  const height = Math.max(1, Math.round(body.height ?? 1024))

  if (!baseUrl || !apiKey) {
    return Response.json({ error: "缺少 Base URL 或 API Key" }, { status: 400 })
  }

  const endpoint = imageEndpointFor(baseUrl)
  if (!endpoint) {
    return Response.json({ error: "Base URL 必须是 http/https 地址，不能填写 API Key" }, { status: 400 })
  }

  const { provider, targetUrl } = endpoint
  const sourceImageSrc = provider === "openrouter" ? await sourceImageToModelUrl(body.sourceImageSrc) : null
  const referenceAssets = normalizeReferenceAssets(body)
  const referenceImageAssets = referenceAssets.filter((asset) => asset.mediaType === "image")
  const referenceVideoAssets = referenceAssets.filter((asset) => asset.mediaType === "video")
  const referenceImageSrcs =
    provider === "openrouter"
      ? (
          await Promise.all(
            referenceImageAssets.map((asset) => sourceImageToModelUrl(asset.src))
          )
        ).filter((src): src is string => Boolean(src))
      : []
  const feedback = composeFeedback(body.feedback, body.feedbackItems)
  const feedbackItemCount = body.feedbackItems?.filter((item) => item.text?.trim()).length ?? 0
  const composedPrompt = composeImagePrompt({
    prompt,
    feedback,
    hasSourceImage: Boolean(sourceImageSrc),
    referenceImageCount: referenceImageSrcs.length,
  })
  console.info("[asui-image-generate] reference assets", {
    imageCount: referenceImageAssets.length,
    videoCount: referenceVideoAssets.length,
  })
  let result: Awaited<ReturnType<typeof requestImageGeneration>>

  try {
    result = await requestImageGeneration({
      targetUrl,
      apiKey,
      provider,
      model,
      composedPrompt,
      width,
      height,
      sourceImageSrc,
      referenceImageSrcs,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : ""
    return Response.json(
      {
        error: `图片生成接口连接中断或超时。请检查 Base URL、网络代理和模型服务是否可访问${detail ? `：${detail}` : ""}`,
      },
      { status: 502 }
    )
  }

  if (!result.upstream.ok) {
    const debug = debugPromptSummary({
      provider,
      model,
      width,
      height,
      hasSourceImage: Boolean(sourceImageSrc || referenceImageSrcs.length),
      prompt,
      feedback,
    })
    console.warn("[asui-image-generate] upstream rejected", {
      ...debug,
      status: result.upstream.status,
      error: result.payload.error?.message,
    })

    return Response.json(
      {
        error: friendlyUpstreamError(result.payload.error?.message, `图片生成接口请求失败：${result.diagnostic}`),
        debug,
      },
      { status: result.upstream.status }
    )
  }

  const image = extractImageResult(result.payload)

  if (!image?.src) {
    const chatCompletionHint =
      result.payload.object === "chat.completion"
        ? "；模型返回了聊天响应而不是图片，请确认模型支持 OpenRouter Image API 的图片输出"
        : ""
    return Response.json(
      {
        error: `图片生成接口没有返回可识别的图片数据${chatCompletionHint}（${result.diagnostic}）`,
      },
      { status: 502 }
    )
  }

  console.info("[asui-image-generate] upstream success", {
    provider,
    model,
    size: `${width}x${height}`,
    hasSourceImage: Boolean(sourceImageSrc || referenceImageSrcs.length),
    feedbackItemCount,
    feedbackPreview: feedback ? truncate(feedback.replace(/\s+/g, " "), 260) : "",
  })

  const uiImage = /高保真(?:产品)?界面|单屏\s*UI|UI\s*成片|App\s*首页/i.test(
    composedPrompt
  )
  const canUseNearExactSize =
    provider === "openrouter" && supportsExplicitPixelSize(model)
  const normalizedImageSrc = await normalizeGeneratedImageSize(
    image.src,
    width,
    height,
    uiImage && !canUseNearExactSize ? "contain" : "cover"
  )

  return Response.json({
    version: createVersion({
      prompt: image.revisedPrompt ?? prompt,
      feedback: body.feedback,
      parentVersionId: body.parentVersionId,
      src: normalizedImageSrc,
      width,
      height,
    }),
  })
}
