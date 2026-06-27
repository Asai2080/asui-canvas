import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { join, resolve } from "node:path"

const rootDir = process.cwd()
const baseUrl = process.env.ASUI_CANVAS_URL || "http://localhost:3030"
const receiver = process.env.ASUI_CODEX_RECEIVER || "codex-image-runner"
const pollMs = Number(process.env.ASUI_CODEX_POLL_MS || 2500)
const codexBin = process.env.CODEX_BIN || "codex"
const resultDir = join(rootDir, ".asui-codex", "results")

let stopped = false

process.on("SIGINT", () => {
  stopped = true
})

process.on("SIGTERM", () => {
  stopped = true
})

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
  return payload
}

async function patchTask(taskId, status, payload = {}) {
  const response = await fetch(`${baseUrl}/api/codex-tasks`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, status, ...payload }),
  })
  const responsePayload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(responsePayload.error || `HTTP ${response.status}`)
  return responsePayload
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function dataUrlInfo(value) {
  const match = /^data:([^;,]+)(?:;[^,]*)?,(.*)$/s.exec(value || "")
  if (!match) return null
  const mimeType = match[1]
  const extension =
    mimeType === "image/svg+xml"
      ? "svg"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/jpeg"
          ? "jpg"
          : "png"
  return {
    mimeType,
    extension,
    data: match[2],
    isBase64: /;base64,/i.test(value),
  }
}

async function writeReferenceImage(task) {
  const src = task.canvasContext?.referenceImageSrc || task.canvasContext?.sourceImageSrc
  if (!src) return null
  if (/^https?:\/\//.test(src)) return { path: null, url: src }

  const info = dataUrlInfo(src)
  if (!info) return null

  await mkdir(resultDir, { recursive: true })
  const imagePath = join(resultDir, `${task.id}-reference.${info.extension}`)
  const bytes = info.isBase64 ? Buffer.from(info.data, "base64") : Buffer.from(decodeURIComponent(info.data), "utf8")
  await writeFile(imagePath, bytes)
  return { path: imagePath, url: null }
}

function buildPrompt(task, outputPath, reference) {
  const context = task.canvasContext || {}
  const feedbackItems = Array.isArray(context.feedbackItems) ? context.feedbackItems : []
  const checklist = feedbackItems.length
    ? feedbackItems
        .map((item, index) => {
          const bounds = item.bounds
            ? ` region x=${Math.round(item.bounds.x * 100)}%, y=${Math.round(item.bounds.y * 100)}%, w=${Math.round(item.bounds.w * 100)}%, h=${Math.round(item.bounds.h * 100)}%`
            : ""
          return `${index + 1}. ${item.taskType || "localized edit"} ${item.label || "annotated region"}${bounds}: ${item.text}`
        })
        .join("\n")
    : "No structured annotations. Use the main prompt."

  return [
    "You are executing an ASUI infinite-canvas image task.",
    "Create exactly one self-contained SVG image file as the final visual result.",
    "Do not modify source code, package files, tests, or any files except the requested output SVG.",
    `Output path: ${outputPath}`,
    `Canvas size: ${context.width || 1024} x ${context.height || 1024}`,
    `Main instruction: ${task.instruction}`,
    context.prompt ? `User prompt: ${context.prompt}` : "",
    reference?.url ? `Reference image URL: ${reference.url}` : "",
    reference?.path ? "A reference image is attached. Use it for composition and annotated regions." : "",
    "",
    "Required annotation checklist:",
    checklist,
    "",
    "Visual requirements:",
    "- Make a polished, complete image suitable for inserting back into the canvas.",
    "- If this is an edit task, satisfy every annotation in one final image.",
    "- Do not render annotation handwriting, circles, UI handles, or arrows as final design elements unless explicitly requested.",
    "- Use SVG shapes, gradients, text, masks, and embedded styling as needed.",
    "- The SVG must have the requested width and height viewBox.",
  ]
    .filter(Boolean)
    .join("\n")
}

async function runCodex(task, reference) {
  await mkdir(resultDir, { recursive: true })
  const width = task.canvasContext?.width || 1024
  const height = task.canvasContext?.height || 1024
  const outputPath = resolve(resultDir, `${task.id}.svg`)
  const prompt = buildPrompt(task, outputPath, reference)
  const promptPath = join(resultDir, `${task.id}.prompt.md`)
  await writeFile(promptPath, `${prompt}\n`, "utf8")

  const args = [
    "exec",
    "-C",
    rootDir,
    "--ask-for-approval",
    "never",
    "--sandbox",
    "workspace-write",
  ]
  if (reference?.path) {
    args.push("--image", reference.path)
  }
  args.push(prompt)

  await new Promise((resolvePromise, reject) => {
    const child = spawn(codexBin, args, {
      cwd: rootDir,
      stdio: "inherit",
      env: {
        ...process.env,
        ASUI_CODEX_RESULT_WIDTH: String(width),
        ASUI_CODEX_RESULT_HEIGHT: String(height),
      },
    })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`codex exec exited with code=${code ?? "null"} signal=${signal ?? "null"}`))
    })
  })

  if (!(await exists(outputPath))) {
    throw new Error(`Codex did not create the expected result file: ${outputPath}`)
  }

  const svg = await readFile(outputPath, "utf8")
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const versionId = `version-codex-${crypto.randomUUID()}`
  await patchTask(task.id, "done", {
    result: {
      message: "Codex 本地执行器已生成图片并写回画布",
      versionId,
      version: {
        versionId,
        parentVersionId: task.canvasContext?.versionId,
        prompt: task.canvasContext?.prompt || task.instruction,
        feedback: feedbackSummary(task),
        src,
        width,
        height,
        createdAt: new Date().toISOString(),
      },
    },
  })
}

function feedbackSummary(task) {
  const items = task.canvasContext?.feedbackItems
  if (!Array.isArray(items) || items.length === 0) return undefined
  return items.map((item, index) => `${index + 1}. ${item.text}`).join("\n")
}

async function runOnce() {
  const payload = await request("/api/codex-tasks/receive", { receiver })
  if (!payload.task) return

  const task = payload.task
  console.log(`[asui-codex-runner] received ${task.id}: ${task.instruction}`)
  try {
    await patchTask(task.id, "processing")
    const reference = await writeReferenceImage(task)
    await runCodex(task, reference)
    console.log(`[asui-codex-runner] completed ${task.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await patchTask(task.id, "failed", { error: message }).catch(() => undefined)
    console.error(`[asui-codex-runner] failed ${task.id}: ${message}`)
  }
}

console.log(`[asui-codex-runner] watching ${baseUrl} as ${receiver}`)

while (!stopped) {
  try {
    await runOnce()
  } catch (error) {
    console.error(`[asui-codex-runner] ${error instanceof Error ? error.message : String(error)}`)
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs))
}

console.log("[asui-codex-runner] stopped")
