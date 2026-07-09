import { ZodError } from "zod"

import { sendCodexTaskToAppServer } from "../../../lib/codex-bridge/app-server"
import { createCodexTask } from "../../../lib/codex-tasks/schema"
import { writeCodexTask } from "../../../lib/codex-tasks/store"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown
    const task = createCodexTask(body)
    const file = await writeCodexTask(task)
    try {
      const codex = await sendCodexTaskToAppServer(task)

      return Response.json({ task, file, codex })
    } catch (error) {
      const bridgeError = error instanceof Error ? error.message : "Codex Bridge 发送失败"
      return Response.json({
        task,
        file,
        codex: {
          mode: "queue",
          visible: false,
          bridgeError,
        },
        message: "任务已加入 Codex 本地队列，但当前 Codex 会话尚未接收。",
      })
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Codex 任务参数无效", issues: error.issues }, { status: 400 })
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Codex Bridge 发送失败",
      },
      { status: 502 }
    )
  }
}
