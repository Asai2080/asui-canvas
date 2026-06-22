import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { ImageVersion } from "@/lib/canvas/types"

export const runtime = "nodejs"

type PersistAssetRequest = {
  version?: ImageVersion
}

const mimeToExtension = (mimeType: string) => {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png"
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "image/svg+xml":
      return "svg"
    default:
      return "bin"
  }
}

const parseDataUrl = (src: string) => {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(src)
  if (!match) return null

  const mimeType = match[1] || "application/octet-stream"
  const isBase64 = Boolean(match[2])
  const encoded = match[3]
  const buffer = isBase64 ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded))

  return { buffer, mimeType }
}

const safeFilePart = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "image"

async function readImageSource(src: string) {
  const dataUrl = parseDataUrl(src)
  if (dataUrl) return dataUrl

  if (!/^https?:\/\//.test(src)) {
    throw new Error("仅支持 data URL 或远程图片 URL")
  }

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`远程图片下载失败：${response.status}`)
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png"
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType,
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as PersistAssetRequest
  const version = body.version

  if (!version?.src) {
    return Response.json({ error: "缺少图片版本数据" }, { status: 400 })
  }

  try {
    const { buffer, mimeType } = await readImageSource(version.src)
    const extension = mimeToExtension(mimeType)
    const fileName = `${safeFilePart(version.versionId)}-${Date.now()}.${extension}`
    const publicDir = join(process.cwd(), "public", "canvas-assets")
    const filePath = join(publicDir, fileName)

    await mkdir(publicDir, { recursive: true })
    await writeFile(filePath, buffer)

    return Response.json({
      version: {
        ...version,
        src: `/canvas-assets/${fileName}`,
      } satisfies ImageVersion,
      asset: {
        fileName,
        path: filePath,
        mimeType,
        size: buffer.length,
      },
    })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "图片资产保存失败",
      },
      { status: 500 }
    )
  }
}
