import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { VideoGenerationResult } from "./types"

type PersistVideoResultOptions = {
  root?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

function safeFilePart(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "result"
  )
}

function videoExtension(contentType: string | null, src: string) {
  const normalized = contentType?.split(";")[0].trim().toLowerCase()
  if (normalized === "video/webm") return "webm"
  if (normalized === "video/quicktime") return "mov"
  if (/\.webm(?:[?#]|$)/i.test(src)) return "webm"
  if (/\.mov(?:[?#]|$)/i.test(src)) return "mov"
  return "mp4"
}

export async function persistVideoGenerationResult(
  result: VideoGenerationResult,
  options: PersistVideoResultOptions = {}
): Promise<VideoGenerationResult> {
  if (result.src.startsWith("/canvas-assets/")) return result
  if (!/^https?:\/\//.test(result.src)) {
    throw new Error("视频生成完成，但返回了无法保存的视频地址")
  }

  const response = await (options.fetchImpl ?? fetch)(result.src)
  if (!response.ok) {
    throw new Error(`视频已生成，但下载到画布失败：HTTP ${response.status}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) {
    throw new Error("视频已生成，但供应商返回了空文件")
  }

  const extension = videoExtension(
    response.headers.get("content-type"),
    result.src
  )
  const taskPart = safeFilePart(result.taskId ?? crypto.randomUUID())
  const fileName = `video-${taskPart}-${(options.now ?? Date.now)()}.${extension}`
  const publicDir = join(
    options.root ?? process.cwd(),
    "public",
    "canvas-assets"
  )
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, fileName), bytes)

  return {
    ...result,
    src: `/canvas-assets/${fileName}`,
  }
}
