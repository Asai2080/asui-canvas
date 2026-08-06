import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildSliceCandidatePrompt,
  normalizeSliceCandidates,
} from "../../../../lib/canvas-slicing/candidates"
import { detectWithOmniParser, formatOmniParserHints } from "../../../../lib/canvas-slicing/omniparser"

export const runtime = "nodejs"

const requestSchema = z.object({
  sourceImageSrc: z.string().trim().min(1),
  width: z.number().int().min(8).max(8192),
  height: z.number().int().min(8).max(8192),
  textBaseUrl: z.string().trim().min(1),
  textApiKey: z.string().trim().min(1),
  textModel: z.string().trim().min(1),
})

function chatEndpoint(baseUrl: string) {
  const url = new URL(baseUrl)
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("文字模型 Base URL 无效")
  }
  if (!url.pathname.endsWith("/chat/completions")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`
  }
  url.search = ""
  url.hash = ""
  return url.toString()
}

async function resolveImageSource(src: string) {
  if (src.startsWith("data:image/")) return src
  if (/^https?:\/\//i.test(src)) return src
  if (!src.startsWith("/canvas-assets/")) throw new Error("图片来源不受支持")
  const fileName = basename(src)
  if (!fileName || src !== `/canvas-assets/${fileName}`) throw new Error("图片来源不受支持")
  const data = await readFile(join(process.cwd(), "public", "canvas-assets", fileName))
  return `data:image/png;base64,${data.toString("base64")}`
}

function responseText(payload: unknown) {
  const value = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
    output_text?: string
  }
  const content = value.choices?.[0]?.message?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("")
  return value.output_text ?? ""
}

function parseJson(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start < 0 || end <= start) throw new Error("视觉模型未返回切图 JSON")
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
  }
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    const imageUrl = await resolveImageSource(input.sourceImageSrc)
    const detectorResult = await detectWithOmniParser({
      source: imageUrl,
      width: input.width,
      height: input.height,
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45_000)

    try {
      const response = await fetch(chatEndpoint(input.textBaseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.textApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.textModel,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildSliceCandidatePrompt(input.width, input.height, formatOmniParserHints(detectorResult?.hints ?? [])) },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = (payload as { error?: { message?: string } }).error?.message
        throw new Error(message || `视觉模型请求失败（${response.status}）`)
      }

      const parsed = parseJson(responseText(payload))
      const rawAssets = Array.isArray(parsed.assets)
        ? parsed.assets.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        : []
      const candidates = normalizeSliceCandidates(rawAssets, input.width, input.height)

      return NextResponse.json({
        isUiDesign: parsed.isUiDesign !== false,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        detector: detectorResult?.source ?? "vision-model",
        candidates,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "切图候选识别失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
