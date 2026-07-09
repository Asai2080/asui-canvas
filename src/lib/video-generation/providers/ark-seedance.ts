import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import type { VideoGenerationProvider, VideoGenerationRequest } from "@/lib/video-generation/types"

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "")
const VIDEO_DEBUG_LOG_PATH = join(process.cwd(), ".next", "asui-video-debug.log")

const mimeFromFileName = (fileName: string) => {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg"
  if (/\.webp$/i.test(fileName)) return "image/webp"
  if (/\.gif$/i.test(fileName)) return "image/gif"
  return "image/png"
}

async function sourceToModelImageUrl(src: string) {
  if (src.startsWith("data:")) return src
  if (/^https?:\/\//.test(src)) return src

  if (!src.startsWith("/canvas-assets/")) {
    throw new Error("视频生成仅支持 data URL、远程图片 URL 或画布缓存图片")
  }

  const fileName = src.slice("/canvas-assets/".length)
  const filePath = join(process.cwd(), "public", "canvas-assets", fileName)
  const buffer = await readFile(filePath)
  return `data:${mimeFromFileName(fileName)};base64,${buffer.toString("base64")}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function writeVideoDebug(event: string, details: Record<string, unknown>) {
  try {
    await mkdir(join(process.cwd(), ".next"), { recursive: true })
    await appendFile(
      VIDEO_DEBUG_LOG_PATH,
      `${JSON.stringify({
        at: new Date().toISOString(),
        event,
        ...details,
      })}\n`
    )
  } catch {
    // Debug logging must never break generation.
  }
}

function extractTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null
  const candidates = [record.id, record.task_id, data?.id, data?.task_id]
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0) ?? null
}

function extractStatus(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null
  const value =
    record.status ??
    record.task_status ??
    record.state ??
    data?.status ??
    data?.task_status ??
    data?.state
  return typeof value === "string" ? value.toLowerCase() : ""
}

function extractError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null
  const error = record.error ?? record.message ?? data?.error ?? data?.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>
    return typeof errorRecord.message === "string" ? errorRecord.message : JSON.stringify(errorRecord)
  }
  return null
}

function findVideoUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item)
      if (found) return found
    }
    return null
  }

  const record = value as Record<string, unknown>
  for (const key of ["video_url", "videoUrl", "url", "src"]) {
    const candidate = record[key]
    if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) return candidate
  }
  for (const nested of Object.values(record)) {
    const found = findVideoUrl(nested)
    if (found) return found
  }
  return null
}

function summarizePayloadKeys(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || depth > 2) return ""
  if (Array.isArray(value)) {
    return value
      .slice(0, 2)
      .map((item, index) => `[${index}]${summarizePayloadKeys(item, depth + 1)}`)
      .filter(Boolean)
      .join("; ")
  }

  const record = value as Record<string, unknown>
  return Object.entries(record)
    .slice(0, 12)
    .map(([key, nested]) => {
      const nestedKeys = summarizePayloadKeys(nested, depth + 1)
      return nestedKeys ? `${key}(${nestedKeys})` : key
    })
    .join(", ")
}

async function createVideoTask(request: VideoGenerationRequest) {
  const baseUrl = normalizeBaseUrl(request.videoBaseUrl ?? "")
  const model = request.videoModel?.trim()
  const apiKey = request.videoApiKey?.trim()
  if (!baseUrl || !apiKey || !model) {
    throw new Error("缺少视频生成 API 配置")
  }

  const duration = Math.min(15, Math.max(4, Math.round(Number(request.durationSeconds) || 4)))
  const resolution = request.resolution || "720p"
  const prompt = `${request.prompt?.trim() || "让图片自然动起来"} --resolution ${resolution} --duration ${duration}`
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }]

  if (request.sourceImageSrc) {
    content.push({
      type: "image_url",
      image_url: {
        url: await sourceToModelImageUrl(request.sourceImageSrc),
      },
    })
  }

  for (const asset of request.referenceAssets ?? []) {
    if (asset.mediaType === "image" && asset.src !== request.sourceImageSrc) {
      content.push({
        type: "image_url",
        image_url: {
          url: await sourceToModelImageUrl(asset.src),
        },
      })
    }
  }

  const response = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      content,
      duration,
      resolution,
    }),
  })

  const payload = await readJson(response)
  await writeVideoDebug("create-response", {
    ok: response.ok,
    statusCode: response.status,
    model,
    duration,
    resolution,
    imageCount: content.filter((item) => item.type === "image_url").length,
    taskId: extractTaskId(payload),
    taskStatus: extractStatus(payload),
    keys: summarizePayloadKeys(payload),
    error: extractError(payload),
  })
  if (!response.ok) {
    throw new Error(extractError(payload) ?? `视频任务创建失败：HTTP ${response.status}`)
  }

  const taskId = extractTaskId(payload)
  if (!taskId) {
    throw new Error("视频任务创建成功，但没有返回 task id")
  }

  return { taskId, createPayload: payload, baseUrl, apiKey }
}

async function readVideoTaskOnce({ taskId, baseUrl, apiKey }: { taskId: string; baseUrl: string; apiKey: string }) {
  const response = await fetch(`${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const payload = await readJson(response)
  if (!response.ok) {
    await writeVideoDebug("poll-response", {
      ok: response.ok,
      statusCode: response.status,
      taskId,
      taskStatus: extractStatus(payload),
      hasVideoUrl: false,
      keys: summarizePayloadKeys(payload),
      error: extractError(payload),
    })
    throw new Error(extractError(payload) ?? `视频任务查询失败：HTTP ${response.status}`)
  }

  const status = extractStatus(payload)
  const videoUrl = findVideoUrl(payload)
  await writeVideoDebug("poll-response", {
    ok: response.ok,
    statusCode: response.status,
    taskId,
    taskStatus: status || "unknown",
    hasVideoUrl: Boolean(videoUrl),
    keys: summarizePayloadKeys(payload),
    error: extractError(payload),
  })
  const successStatuses = ["succeeded", "success", "done", "completed"]
  if (videoUrl && ["", ...successStatuses].includes(status)) {
    return { videoUrl, status: status || "succeeded", payload }
  }
  if (successStatuses.includes(status)) {
    throw new Error(`视频任务已完成，但没有找到视频地址。返回字段：${summarizePayloadKeys(payload) || "空返回"}`)
  }
  if (["failed", "error", "cancelled", "canceled"].includes(status)) {
    throw new Error(extractError(payload) ?? `视频任务失败：${status}`)
  }
  return { taskId, status: status || "running", payload }
}

async function pollVideoTask({ taskId, baseUrl, apiKey }: { taskId: string; baseUrl: string; apiKey: string }) {
  let lastPayload: unknown = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(attempt < 3 ? 1200 : 2500)
    const result = await readVideoTaskOnce({ taskId, baseUrl, apiKey })
    lastPayload = result.payload
    if ("videoUrl" in result) {
      return result
    }
  }

  throw new Error(`视频生成超时，任务 ID：${taskId}，最后状态：${extractStatus(lastPayload) || "未知"}`)
}

export const arkSeedanceProvider: VideoGenerationProvider = {
  id: "ark-seedance",
  label: "Volcano Ark Seedance",
  supports: {
    textToVideo: true,
    imageToVideo: true,
    referenceImages: true,
    referenceVideos: false,
    asyncTasks: true,
    duration: true,
    resolution: true,
  },
  canHandle: (request) => {
    const baseUrl = request.videoBaseUrl ?? ""
    const model = request.videoModel ?? ""
    return /ark\.cn|volces\.com|byte/i.test(baseUrl) || /seedance|doubao/i.test(model)
  },
  createTask: async (request) => {
    const task = await createVideoTask(request)
    return {
      taskId: task.taskId,
      status: "created",
      raw: task.createPayload,
    }
  },
  pollTask: async (request) => {
    const baseUrl = normalizeBaseUrl(request.videoBaseUrl ?? "")
    const apiKey = request.videoApiKey?.trim()
    if (!baseUrl || !apiKey) {
      throw new Error("缺少视频生成 API 配置")
    }
    const result = await readVideoTaskOnce({ taskId: request.taskId, baseUrl, apiKey })
    if ("videoUrl" in result) {
      return {
        src: result.videoUrl,
        taskId: request.taskId,
        status: result.status,
        durationSeconds: request.durationSeconds,
        resolution: request.resolution,
        raw: result.payload,
      }
    }
    return {
      taskId: request.taskId,
      status: result.status,
      statusText: `任务状态：${result.status}`,
      raw: result.payload,
    }
  },
  generate: async (request) => {
    const task = await createVideoTask(request)
    const result = await pollVideoTask(task)
    if (!("videoUrl" in result) || !result.videoUrl) {
      throw new Error(`视频生成未完成，任务 ID：${task.taskId}`)
    }
    const videoUrl = result.videoUrl
    return {
      src: videoUrl,
      taskId: task.taskId,
      status: result.status,
      durationSeconds: request.durationSeconds,
      resolution: request.resolution,
      raw: result.payload,
    }
  },
}
