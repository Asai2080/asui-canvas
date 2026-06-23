import { ZodError } from "zod"

import { createCodexTask } from "../../../lib/codex-tasks/schema"
import { writeCodexTask } from "../../../lib/codex-tasks/store"

export const runtime = "nodejs"

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
