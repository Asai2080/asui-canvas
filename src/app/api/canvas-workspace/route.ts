import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { promisify } from "node:util"

import { z } from "zod"

export const runtime = "nodejs"

const execFileAsync = promisify(execFile)
const configPath = () => join(process.cwd(), ".asui-agent", "workspace.json")

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("choose") }).strict(),
  z.object({
    action: z.literal("write-text"),
    directories: z.array(z.enum(["notes"])).max(1),
    fileName: z.string().trim().min(1).max(120),
    content: z.string().max(10_000_000),
  }).strict(),
  z.object({
    action: z.literal("write-asset"),
    kind: z.enum(["image", "video"]),
    id: z.string().trim().min(1).max(160),
    src: z.string().trim().min(1).max(2_000_000),
  }).strict(),
])

type WorkspaceConfig = { path: string }

function safeFilePart(value: string, fallback: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._\u3400-\u9fff-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || fallback
  )
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(configPath(), "utf8")) as WorkspaceConfig
  } catch {
    return undefined
  }
}

async function saveConfig(path: string) {
  await mkdir(join(process.cwd(), ".asui-agent"), { recursive: true })
  await writeFile(configPath(), `${JSON.stringify({ path }, null, 2)}\n`, "utf8")
}

async function chooseDirectory() {
  if (process.platform !== "darwin") {
    throw new Error("当前本地文件夹选择兜底仅支持 macOS")
  }
  const { stdout } = await execFileAsync("/usr/bin/osascript", [
    "-e",
    'POSIX path of (choose folder with prompt "选择 ASUI 无限画布工作空间")',
  ])
  const path = resolve(stdout.trim())
  if (!path) throw new Error("没有选择工作空间文件夹")
  await mkdir(path, { recursive: true })
  await Promise.all([
    mkdir(join(path, "images"), { recursive: true }),
    mkdir(join(path, "videos"), { recursive: true }),
    mkdir(join(path, "notes"), { recursive: true }),
  ])
  await saveConfig(path)
  return path
}

function parseDataUrl(src: string) {
  const match = /^data:([^,]*),([\s\S]*)$/.exec(src)
  if (!match) return undefined
  const metadata = match[1] || "application/octet-stream"
  const mimeType = metadata.split(";")[0] || "application/octet-stream"
  const base64 = metadata.toLowerCase().includes(";base64")
  return {
    bytes: base64
      ? Buffer.from(match[2], "base64")
      : Buffer.from(decodeURIComponent(match[2])),
    mimeType,
  }
}

async function readAsset(src: string) {
  const data = parseDataUrl(src)
  if (data) return data
  if (src.startsWith("/canvas-assets/")) {
    const fileName = basename(src)
    const path = join(process.cwd(), "public", "canvas-assets", fileName)
    return { bytes: await readFile(path), mimeType: fileName.split(".").at(-1) ?? "bin" }
  }
  if (!/^https?:\/\//i.test(src)) throw new Error("不支持的工作空间资产来源")
  const response = await fetch(src)
  if (!response.ok) throw new Error(`工作空间资产下载失败：${response.status}`)
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
  }
}

function extensionForAsset(kind: "image" | "video", mimeType: string) {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes("jpeg") || normalized === "jpg") return "jpg"
  if (normalized.includes("webp")) return "webp"
  if (normalized.includes("svg")) return "svg"
  if (normalized.includes("webm")) return "webm"
  return kind === "video" ? "mp4" : "png"
}

export async function GET() {
  const config = await readConfig()
  return Response.json({
    supported: process.platform === "darwin",
    configured: Boolean(config?.path),
    name: config?.path ? basename(config.path) : undefined,
  })
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    if (input.action === "choose") {
      const path = await chooseDirectory()
      return Response.json({ supported: true, configured: true, name: basename(path) })
    }

    const config = await readConfig()
    if (!config?.path) {
      return Response.json({ error: "请先选择工作空间文件夹" }, { status: 409 })
    }

    if (input.action === "write-text") {
      const directory = input.directories.reduce(
        (current, part) => join(current, part),
        config.path
      )
      await mkdir(directory, { recursive: true })
      await writeFile(
        join(directory, safeFilePart(input.fileName, "untitled.md")),
        input.content,
        "utf8"
      )
      return Response.json({ saved: true })
    }

    const asset = await readAsset(input.src)
    const directory = join(config.path, input.kind === "image" ? "images" : "videos")
    const extension = extensionForAsset(input.kind, asset.mimeType)
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, `${safeFilePart(input.id, input.kind)}.${extension}`),
      asset.bytes
    )
    return Response.json({ saved: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "工作空间操作失败"
    const cancelled = /User canceled|(-128)/i.test(message)
    return Response.json(
      { error: cancelled ? "已取消选择工作空间" : message },
      { status: cancelled ? 409 : 500 }
    )
  }
}
