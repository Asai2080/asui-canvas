import type {
  VideoGenerationResult,
  VideoGenerationTask,
  VideoReferenceAsset,
} from "@/lib/video-generation/types"

export type VideoGenerationCredentials = {
  provider?: string
  videoBaseUrl?: string
  videoApiKey?: string
  videoModel?: string
}

export type AgentVideoGenerationInput = {
  prompt: string
  negativePrompt?: string
  sourceImageSrc?: string
  referenceAssets?: VideoReferenceAsset[]
  durationSeconds: number
  resolution: string
}

export type AgentVideoArtifact = {
  kind: "video"
  src: string
  taskId?: string
  status?: string
  durationSeconds?: number
  resolution?: string
}

export type AgentVideoPollResult =
  | { state: "pending"; task: VideoGenerationTask }
  | { state: "completed"; artifact: AgentVideoArtifact }

type AdapterOptions = {
  apiOrigin: string
  fetchImpl?: typeof fetch
}

function composePrompt(prompt: string, negativePrompt?: string) {
  return negativePrompt
    ? `${prompt}\n\n必须避免：${negativePrompt}`
    : prompt
}

function toArtifact(video: VideoGenerationResult): AgentVideoArtifact {
  return {
    kind: "video",
    src: video.src,
    taskId: video.taskId,
    status: video.status,
    durationSeconds: video.durationSeconds,
    resolution: video.resolution,
  }
}

export function createVideoGenerationAdapter({
  apiOrigin,
  fetchImpl = fetch,
}: AdapterOptions) {
  const endpoint = new URL("/api/videos/generate", apiOrigin).toString()

  async function request(
    body: Record<string, unknown>
  ): Promise<{
    task?: VideoGenerationTask
    video?: VideoGenerationResult
    error?: string
  }> {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as {
      task?: VideoGenerationTask
      video?: VideoGenerationResult
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || `视频生成失败（HTTP ${response.status}）`)
    }
    return payload
  }

  return {
    async create(
      input: AgentVideoGenerationInput,
      credentials: VideoGenerationCredentials = {}
    ): Promise<VideoGenerationTask> {
      const payload = await request({
        action: "create",
        ...credentials,
        ...input,
        prompt: composePrompt(input.prompt, input.negativePrompt),
      })
      if (!payload.task?.taskId) {
        throw new Error("视频生成接口没有返回任务 ID")
      }
      return {
        taskId: payload.task.taskId,
        status: payload.task.status,
        statusText: payload.task.statusText,
      }
    },

    async poll(
      taskId: string,
      input: AgentVideoGenerationInput,
      credentials: VideoGenerationCredentials = {}
    ): Promise<AgentVideoPollResult> {
      const payload = await request({
        action: "poll",
        taskId,
        ...credentials,
        ...input,
        prompt: composePrompt(input.prompt, input.negativePrompt),
      })
      if (payload.video?.src) {
        return { state: "completed", artifact: toArtifact(payload.video) }
      }
      if (payload.task?.taskId) {
        return {
          state: "pending",
          task: {
            taskId: payload.task.taskId,
            status: payload.task.status,
            statusText: payload.task.statusText,
          },
        }
      }
      throw new Error("视频生成接口没有返回任务状态或视频")
    },
  }
}
