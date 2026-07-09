import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { join, resolve } from "node:path"

const rootDir = process.cwd()
const baseUrl = process.env.ASUI_CANVAS_URL || "http://localhost:3030"
const receiver = process.env.ASUI_CODEX_RECEIVER || "codex-image-runner"
const pollMs = Number(process.env.ASUI_CODEX_POLL_MS || 2500)
const codexBin = process.env.CODEX_BIN || "codex"
const imagegenProvider = process.env.ASUI_CODEX_IMAGEGEN_PROVIDER || "codex-exec"
const imagegenCli =
  process.env.ASUI_IMAGE_GEN_CLI || join(process.env.CODEX_HOME || join(process.env.HOME || "", ".codex"), "skills/.system/imagegen/scripts/image_gen.py")
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

function imageMimeTypeFromBytes(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

async function readBitmapAsDataUrl(path) {
  const bytes = await readFile(path)
  const mimeType = imageMimeTypeFromBytes(bytes)
  if (!mimeType) {
    throw new Error(`Codex 生成结果不是可回写的位图文件（PNG/JPEG/WebP）：${path}`)
  }

  return `data:${mimeType};base64,${bytes.toString("base64")}`
}

function clampImagegenSize(width, height) {
  const minPixels = 655_360
  const maxPixels = 8_294_400
  const round16 = (value) => Math.max(16, Math.round(value / 16) * 16)
  let w = round16(width)
  let h = round16(height)
  const ratio = Math.max(w, h) / Math.max(1, Math.min(w, h))
  if (ratio > 3) {
    if (w > h) h = round16(w / 3)
    else w = round16(h / 3)
  }
  let pixels = w * h
  if (pixels < minPixels) {
    const scale = Math.sqrt(minPixels / pixels)
    w = round16(w * scale)
    h = round16(h * scale)
    pixels = w * h
  }
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels)
    w = round16(w * scale)
    h = round16(h * scale)
  }
  return `${w}x${h}`
}

async function writeReferenceAsset(task, key, src) {
  if (!src) return null
  if (/^https?:\/\//.test(src)) return { key, path: null, url: src }

  const info = dataUrlInfo(src)
  if (!info) return null

  await mkdir(resultDir, { recursive: true })
  const imagePath = join(resultDir, `${task.id}-${key}.${info.extension}`)
  const bytes = info.isBase64 ? Buffer.from(info.data, "base64") : Buffer.from(decodeURIComponent(info.data), "utf8")
  await writeFile(imagePath, bytes)
  return { key, path: imagePath, url: null }
}

async function writeReferenceImages(task) {
  const assets = await Promise.all([
    writeReferenceAsset(task, "clean-source", task.canvasContext?.sourceImageSrc),
    writeReferenceAsset(task, "annotated-source", task.canvasContext?.referenceImageSrc),
  ])

  return assets.filter(Boolean)
}

function buildPrompt(task, outputPath, references) {
  const context = task.canvasContext || {}
  const feedbackItems = Array.isArray(context.feedbackItems) ? context.feedbackItems : []
  const checklist = annotationChecklist(task)
  const hasReference = references.length > 0
  const isEditTask = hasReference && feedbackItems.length > 0
  const width = context.width || 1024
  const height = context.height || 1024
  const orientation = width >= height ? "horizontal / landscape" : "vertical / portrait"

  return [
    "You are executing an ASUI infinite-canvas image task.",
    "Create exactly one real raster bitmap image file as the final visual result.",
    "The result must be PNG, JPEG, or WebP. Do not create SVG, HTML, CSS, vector mockups, placeholder diagrams, or screenshots of a layout.",
    "Use Codex's native image generation capability when available. If native image generation is unavailable, do not fake the result with SVG or procedural drawing.",
    "Do not modify source code, package files, tests, or any files except the requested output bitmap.",
    `Output path: ${outputPath}`,
    `Canvas size: ${width} x ${height}`,
    `Required final orientation: ${orientation}.`,
    "Hard size rule: preserve this exact canvas aspect ratio and source-image layout. Do not rotate, crop, reframe, add side margins, or convert the image into a different poster/card format.",
    `Main instruction: ${task.instruction}`,
    context.prompt ? `User prompt: ${context.prompt}` : "",
    referenceSummary(references),
    "",
    "Mandatory annotation checklist:",
    checklist,
    "",
    isEditTask
      ? [
          "Edit-task rules:",
          "- CRITICAL: Do not redraw or reinterpret the full image.",
	          "- Use the clean-source image as the actual visual base. Use annotated-source only to understand the user's markups.",
	          "- Preserve the clean-source composition and edit the pixels semantically, like a real image edit.",
	          "- Keep the final output aligned to the clean-source canvas dimensions and visual coordinates; each annotation is a localized edit instruction, not a new full-image design prompt.",
	          "- Preserve the original aspect ratio, orientation, full-bleed framing, subject scale, colors, and overall layout.",
          "- Do not redesign the image into a poster, card, phone screenshot, vertical layout, centered thumbnail, or white-margin composition.",
          "- The final bitmap must fill the requested canvas. No large empty margins. No inner artboard.",
          "- Apply changes only inside or immediately around each annotated region; keep every unannotated region visually unchanged.",
          "- Every annotation in the checklist must be visibly satisfied in the final image.",
          "- Do not replace the whole picture unless the annotation explicitly asks for a full-image redesign.",
          "- If annotation text says to change copy/text but does not specify exact replacement words, replace only that circled/marked text with a concise suitable alternative in the same position and style.",
          "- If exact raster editing is not possible, create the closest faithful visual reconstruction while keeping the annotated intent obvious.",
          "- Do not render annotation handwriting, black circles, red/green boxes, UI handles, arrows, or selection outlines.",
        ].join("\n")
      : "",
    "",
    "Visual requirements:",
    "- Make a polished, complete image suitable for inserting back into the canvas.",
    "- If this is an edit task, satisfy every annotation in one final image.",
    `- Target output dimensions: ${width} x ${height}.`,
    "- The image content must use the full width and full height of the bitmap.",
    "- Do not render annotation handwriting, circles, UI handles, or arrows as final design elements unless explicitly requested.",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildBitmapPrompt(task, references) {
  const context = task.canvasContext || {}
  const feedbackItems = Array.isArray(context.feedbackItems) ? context.feedbackItems : []
  const isEditTask = references.length > 0 && feedbackItems.length > 0
  const width = context.width || 1024
  const height = context.height || 1024
  return [
    task.instruction,
    context.prompt ? `用户提示词：${context.prompt}` : "",
    `目标画布尺寸：${width} x ${height}。必须保持这个画布比例和横竖方向。`,
    referenceSummary(references),
    "",
    "标注清单：",
    annotationChecklist(task),
    "",
    isEditTask
	      ? [
	          "请基于 clean-source 做真实图片编辑，annotated-source 只用于理解圈选、箭头和文字标注。",
	          "硬性要求：最终图片必须沿用 clean-source 的画布比例、横竖方向、构图坐标和主体位置；不要转成竖版海报、卡片、缩略图、白边排版或重新设计整张图。",
	          "只修改标注指向的区域，未标注区域保持原图构图、主体、色彩、文字位置和画面比例。",
          "最终输出必须是干净图片，不要保留标注笔迹、圈线、箭头、选择框、UI 控件或说明文字。",
          "多个标注必须合并到同一张最终图里完成，不要只做其中一个。",
        ].join("\n")
      : "请生成一张真实位图图片，不要输出 SVG、海报代码或矢量占位图。",
  ]
    .filter(Boolean)
    .join("\n")
}

function spawnProcess(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: options.stdio || ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        ...options.env,
      },
    })
    if (options.stdin) {
      child.stdin.write(options.stdin)
      child.stdin.end()
    }
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited with code=${code ?? "null"} signal=${signal ?? "null"}`))
    })
  })
}

async function generateWithImagegenCli(task, references, outputPath) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("真实 imagegen CLI 需要 OPENAI_API_KEY；当前未配置。")
  }

  const promptPath = join(resultDir, `${task.id}.imagegen-prompt.md`)
  await writeFile(promptPath, `${buildBitmapPrompt(task, references)}\n`, "utf8")
  const width = task.canvasContext?.width || 1024
  const height = task.canvasContext?.height || 1024
  const sourceReferences = references.filter((reference) => reference.path)
  const isEditTask =
    sourceReferences.length > 0 &&
    Array.isArray(task.canvasContext?.feedbackItems) &&
    task.canvasContext.feedbackItems.length > 0
  const args = [
    isEditTask ? "edit" : "generate",
    "--prompt-file",
    promptPath,
    "--size",
    clampImagegenSize(width, height),
    "--quality",
    process.env.ASUI_CODEX_IMAGEGEN_QUALITY || "medium",
    "--output-format",
    "png",
    "--out",
    outputPath,
    "--force",
  ]

  if (isEditTask) {
    for (const reference of sourceReferences) {
      args.push("--image", reference.path)
    }
  }

  await spawnProcess("python3", [imagegenCli, ...args])
}

function referenceSummary(references) {
  if (!references.length) return ""

  return [
    "Attached references:",
    ...references.map((reference, index) => {
      const name =
        reference.key === "clean-source"
          ? "clean-source: original image without user markup"
          : reference.key === "annotated-source"
            ? "annotated-source: same image with user markup showing target regions"
            : reference.key
      const location = reference.url ? `URL ${reference.url}` : `file ${reference.path}`
      return `${index + 1}. ${name} (${location})`
    }),
  ].join("\n")
}

function annotationChecklist(task) {
  const feedbackItems = Array.isArray(task.canvasContext?.feedbackItems) ? task.canvasContext.feedbackItems : []
  if (!feedbackItems.length) return "No structured annotations. Use the main prompt."

  return feedbackItems
    .map((item, index) => {
      const bounds = item.bounds
        ? ` region x=${Math.round(item.bounds.x * 100)}%, y=${Math.round(item.bounds.y * 100)}%, w=${Math.round(item.bounds.w * 100)}%, h=${Math.round(item.bounds.h * 100)}%`
        : ""
      const type = item.taskType || "localized edit"
      const hint = item.targetHint ? ` target=${item.targetHint}` : ""
      return `${index + 1}. ${type} ${item.label || "annotated region"}${bounds}${hint}: ${item.text}`
    })
    .join("\n")
}

async function runCodex(task, references) {
  await mkdir(resultDir, { recursive: true })
  const width = task.canvasContext?.width || 1024
  const height = task.canvasContext?.height || 1024
  const outputPath = resolve(resultDir, `${task.id}.png`)
  const prompt = buildPrompt(task, outputPath, references)
  const promptPath = join(resultDir, `${task.id}.prompt.md`)
  await writeFile(promptPath, `${prompt}\n`, "utf8")

  if (imagegenProvider === "openai-cli") {
    await generateWithImagegenCli(task, references, outputPath)
  } else {
  const args = [
    "exec",
    "-C",
    rootDir,
    "--sandbox",
    "workspace-write",
  ]
  for (const reference of references) {
    if (reference.path) {
      args.push("--image", reference.path)
    }
  }
  args.push("-")

    await spawnProcess(codexBin, args, {
      stdio: ["pipe", "inherit", "inherit"],
      stdin: prompt,
      env: {
        ASUI_CODEX_RESULT_WIDTH: String(width),
        ASUI_CODEX_RESULT_HEIGHT: String(height),
      },
    })
  }

  if (!(await exists(outputPath))) {
    throw new Error(
      `Codex 没有生成真实 PNG 文件：${outputPath}。当前后台 runner 不能访问桌面内置 image_gen 时会出现这个现象；请改用 ASUI_CODEX_IMAGEGEN_PROVIDER=openai-cli 并配置 OPENAI_API_KEY，或后续接入原生 Codex widget 消息桥。`
    )
  }

  const src = await readBitmapAsDataUrl(outputPath)
  const versionId = `version-codex-${crypto.randomUUID()}`
  await patchTask(task.id, "done", {
    result: {
      message: "Codex 本地执行器已生成真实位图并写回画布",
      versionId,
      version: {
        versionId,
        parentVersionId: task.canvasContext?.versionId,
        prompt: buildVersionPrompt(task),
        feedback: feedbackSummary(task),
        src,
        width,
        height,
        createdAt: new Date().toISOString(),
      },
    },
  })
}

function buildVersionPrompt(task) {
  const prompt = task.canvasContext?.prompt?.trim()
  const checklist = annotationChecklist(task)
  if (prompt && checklist !== "No structured annotations. Use the main prompt.") {
    return `${prompt}\n\n标注要求：\n${checklist}`
  }
  if (checklist !== "No structured annotations. Use the main prompt.") {
    return `${task.instruction}\n\n标注要求：\n${checklist}`
  }
  return prompt || task.instruction
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
    const references = await writeReferenceImages(task)
    await runCodex(task, references)
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
