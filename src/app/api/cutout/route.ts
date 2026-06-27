import type { ImageVersion } from "@/lib/canvas/types"

import { getBirefnetServiceUrl } from "../../../lib/cutout/birefnet-service"

export const runtime = "nodejs"

type CutoutRequest = {
  imageSrc?: string
  width?: number
  height?: number
}

type CutoutServiceResponse = {
  image?: string
  src?: string
  result?: string
  b64_json?: string
  error?: string
}

const asDataUrl = (value?: string | null) => {
  if (!value) return null
  if (/^data:image\//.test(value) || /^https?:\/\//.test(value)) return value
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 80) {
    return `data:image/png;base64,${value}`
  }
  return null
}

function extractCutoutImage(payload: CutoutServiceResponse) {
  return asDataUrl(payload.image) ?? asDataUrl(payload.src) ?? asDataUrl(payload.result) ?? asDataUrl(payload.b64_json)
}

function createVersion({ src, width, height }: { src: string; width: number; height: number }): ImageVersion {
  return {
    versionId: `cutout-${globalThis.crypto.randomUUID()}`,
    prompt: "BiRefNet HR 抠图",
    src,
    width,
    height,
    createdAt: new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as CutoutRequest
  const serviceUrl = getBirefnetServiceUrl()

  if (!body.imageSrc?.trim()) {
    return Response.json({ error: "缺少要抠图的圈选区域图片" }, { status: 400 })
  }

  const width = Math.max(1, Math.round(body.width ?? 512))
  const height = Math.max(1, Math.round(body.height ?? 512))
  let response: Response
  try {
    response = await fetch(`${serviceUrl}/cutout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: body.imageSrc,
        model: "BiRefNet_HR",
        output_format: "png",
      }),
    })
  } catch (error) {
    return Response.json(
      {
        error: `BiRefNet HR 服务未启动或连接失败：${error instanceof Error ? error.message : "未知错误"}`,
      },
      { status: 502 }
    )
  }
  const payload = (await response.json().catch(() => ({}))) as CutoutServiceResponse

  if (!response.ok) {
    return Response.json(
      {
        error: payload.error ?? `BiRefNet HR 抠图失败：HTTP ${response.status}`,
      },
      { status: response.status }
    )
  }

  const image = extractCutoutImage(payload)
  if (!image) {
    return Response.json({ error: "BiRefNet HR 没有返回透明 PNG 图片" }, { status: 502 })
  }

  return Response.json({
    version: createVersion({
      src: image,
      width,
      height,
    }),
  })
}
