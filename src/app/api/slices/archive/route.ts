import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"

import { strToU8, zipSync } from "fflate"
import { z } from "zod"

export const runtime = "nodejs"

const fileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  src: z.string().trim().min(1),
})

const requestSchema = z.object({
  archiveName: z.string().trim().min(1).max(120).default("ui-design-assets"),
  original: fileSchema,
  slices: z.array(fileSchema).min(1).max(64),
  manifest: z.record(z.string(), z.unknown()),
})

function safeFileName(value: string, fallback: string) {
  const name = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^\.+/, "")
    .trim()
  return name || fallback
}

async function sourceBytes(src: string) {
  const data = src.match(/^data:image\/[A-Za-z0-9.+-]+;base64,([\s\S]+)$/)
  if (data) return Uint8Array.from(Buffer.from(data[1], "base64"))
  if (src.startsWith("/canvas-assets/")) {
    const fileName = basename(src)
    if (!fileName || src !== `/canvas-assets/${fileName}`) throw new Error("打包文件来源不受支持")
    return new Uint8Array(await readFile(join(process.cwd(), "public", "canvas-assets", fileName)))
  }
  if (!/^https?:\/\//i.test(src)) throw new Error("打包文件来源不受支持")
  const response = await fetch(src)
  if (!response.ok) throw new Error("无法读取打包图片")
  return new Uint8Array(await response.arrayBuffer())
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    const original = await sourceBytes(input.original.src)
    const slices = await Promise.all(input.slices.map(async (file, index) => ({
      name: safeFileName(file.name, `slice-${index + 1}.png`),
      bytes: await sourceBytes(file.src),
    })))
    const files: Record<string, Uint8Array> = {
      [`original/${safeFileName(input.original.name, "original.png")}`]: original,
      "manifest.json": strToU8(JSON.stringify(input.manifest, null, 2)),
    }
    for (const file of slices) files[`slices/${file.name}`] = file.bytes
    const archive = zipSync(files, { level: 6 })
    const archiveName = `${safeFileName(input.archiveName, "ui-design-assets")}.zip`

    return new Response(Buffer.from(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "打包下载失败"
    return Response.json({ error: message }, { status: 400 })
  }
}
