import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"

import { NextResponse } from "next/server"
import sharp from "sharp"
import { z } from "zod"

import { sliceCandidateSchema } from "../../../../lib/canvas-slicing/schema"

export const runtime = "nodejs"

const MAX_SOURCE_BYTES = 28 * 1024 * 1024
const requestSchema = z.object({
  sourceImageSrc: z.string().trim().min(1),
  candidates: z.array(sliceCandidateSchema).min(1).max(64),
})

function decodeDataUrl(src: string) {
  const match = src.match(/^data:image\/[A-Za-z0-9.+-]+;base64,([\s\S]+)$/)
  if (!match) return null
  return Buffer.from(match[1], "base64")
}

async function sourceBuffer(src: string) {
  const inline = decodeDataUrl(src)
  if (inline) return inline

  if (src.startsWith("/canvas-assets/")) {
    const fileName = basename(src)
    if (!fileName || src !== `/canvas-assets/${fileName}`) throw new Error("图片来源不受支持")
    return readFile(join(process.cwd(), "public", "canvas-assets", fileName))
  }

  if (/^https?:\/\//i.test(src)) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(src, { signal: controller.signal })
      if (!response.ok) throw new Error("无法读取源图片")
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error("源图片超过 28MB")
      return buffer
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error("图片来源不受支持")
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    const buffer = await sourceBuffer(input.sourceImageSrc)
    if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error("源图片超过 28MB")
    const metadata = await sharp(buffer).metadata()
    if (!metadata.width || !metadata.height) throw new Error("无法读取源图片尺寸")

    const slices = await Promise.all(input.candidates.map(async (candidate) => {
      const left = Math.min(candidate.x, metadata.width! - 1)
      const top = Math.min(candidate.y, metadata.height! - 1)
      const width = Math.min(candidate.width, metadata.width! - left)
      const height = Math.min(candidate.height, metadata.height! - top)
      const output = await sharp(buffer)
        .extract({ left, top, width, height })
        .png()
        .toBuffer()

      return {
        candidate: { ...candidate, x: left, y: top, width, height },
        src: `data:image/png;base64,${output.toString("base64")}`,
        width,
        height,
      }
    }))

    return NextResponse.json({ slices })
  } catch (error) {
    const message = error instanceof Error ? error.message : "切图失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
