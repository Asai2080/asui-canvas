import { readFile } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"

const baseUrl = process.env.ASUI_CANVAS_URL || "http://localhost:3030"
const [taskId, imagePath, ...promptParts] = process.argv.slice(2)
const prompt = promptParts.join(" ").trim() || "Codex generated image"

const mimeByExtension = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
])

function usage() {
  console.error("Usage: node scripts/codex-task-complete.mjs <taskId> <imagePath> [prompt]")
}

async function patchTask(body) {
  const response = await fetch(`${baseUrl}/api/codex-tasks`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return payload
}

async function readImageAsDataUrl(path) {
  const absolutePath = resolve(path)
  const bytes = await readFile(absolutePath)
  const mimeType = mimeByExtension.get(extname(absolutePath).toLowerCase()) || "image/png"

  return {
    src: `data:${mimeType};base64,${bytes.toString("base64")}`,
    name: basename(absolutePath),
  }
}

if (!taskId || !imagePath) {
  usage()
  process.exit(1)
}

try {
  await patchTask({ taskId, status: "processing" })
  const image = await readImageAsDataUrl(imagePath)
  const versionId = `version-codex-${crypto.randomUUID()}`
  const payload = await patchTask({
    taskId,
    status: "done",
    result: {
      message: `Codex 生成完成：${image.name}`,
      versionId,
      version: {
        versionId,
        prompt,
        src: image.src,
        width: Number(process.env.ASUI_CODEX_RESULT_WIDTH || 1024),
        height: Number(process.env.ASUI_CODEX_RESULT_HEIGHT || 1024),
        createdAt: new Date().toISOString(),
      },
    },
  })
  console.log(`[asui-codex-complete] done ${payload.task?.id ?? taskId}`)
} catch (error) {
  try {
    await patchTask({
      taskId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  } catch {
    // Keep the original failure visible.
  }
  console.error(`[asui-codex-complete] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
