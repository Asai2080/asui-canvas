import { resolveVideoGenerationProvider } from "@/lib/video-generation/providers"
import type { VideoGenerationRequest } from "@/lib/video-generation/types"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VideoGenerationRequest
    const provider = resolveVideoGenerationProvider(body)
    const action = body.action ?? "generate"

    if (action === "create") {
      if (!provider.createTask) {
        throw new Error(`${provider.label} 暂不支持异步视频任务创建`)
      }
      const task = await provider.createTask(body)
      return Response.json({
        task,
        provider: {
          id: provider.id,
          label: provider.label,
          supports: provider.supports,
        },
        raw: task.raw,
      })
    }

    if (action === "poll") {
      if (!body.taskId) {
        throw new Error("缺少视频任务 ID")
      }
      if (!provider.pollTask) {
        throw new Error(`${provider.label} 暂不支持异步视频任务查询`)
      }
      const result = await provider.pollTask({ ...body, taskId: body.taskId })
      return Response.json({
        video: "src" in result ? result : undefined,
        task: "src" in result ? undefined : result,
        provider: {
          id: provider.id,
          label: provider.label,
          supports: provider.supports,
        },
        raw: result.raw,
      })
    }

    const video = await provider.generate(body)
    return Response.json({
      video,
      provider: {
        id: provider.id,
        label: provider.label,
        supports: provider.supports,
      },
      raw: video.raw,
    })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "视频生成失败",
      },
      { status: 500 }
    )
  }
}
