import { ZodError } from "zod"

import { createCodexTask } from "../../../lib/codex-tasks/schema"
import type { CodexTask } from "../../../lib/codex-tasks/schema"
import { getCodexTask, updateCodexTask, writeCodexTask } from "../../../lib/codex-tasks/store"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const taskId = url.searchParams.get("taskId")
  if (!taskId) return Response.json({ error: "缺少 taskId" }, { status: 400 })

  const result = await getCodexTask(taskId)
  if (!result) return Response.json({ error: "Codex 任务不存在" }, { status: 404 })

  return Response.json(result)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown
    const task = createCodexTask(body)
    const file = await writeCodexTask(task)

    return Response.json({ task, file })
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Codex 任务参数无效", issues: error.issues }, { status: 400 })
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Codex 任务创建失败",
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    taskId?: string
    status?: "processing" | "done" | "failed"
    result?: CodexTask["result"]
    error?: string
  } | null

  if (!body?.taskId || !body.status) {
    return Response.json({ error: "缺少 taskId 或 status" }, { status: 400 })
  }

  if (!["processing", "done", "failed"].includes(body.status)) {
    return Response.json({ error: "任务状态无效" }, { status: 400 })
  }

  const result = await updateCodexTask(body.taskId, {
    status: body.status,
    result: body.result,
    error: body.error,
  })
  if (!result) return Response.json({ error: "Codex 任务不存在" }, { status: 404 })

  return Response.json(result)
}
