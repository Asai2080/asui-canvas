import { NextResponse } from "next/server"

import { isCanvasAgentEnabled } from "../../../../../../lib/canvas-agent/feature-flags"
import { cancelAgentTask } from "../../../../../../lib/canvas-agent/task-operations"
import { AgentTaskNotFoundError } from "../../../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ taskId: string }>
}

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function POST(_request: Request, context: RouteContext) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const { taskId } = await context.params
    return NextResponse.json({ task: await cancelAgentTask(taskId) })
  } catch (error) {
    if (error instanceof AgentTaskNotFoundError) {
      return unavailable()
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to cancel Agent task",
      },
      { status: 409 }
    )
  }
}
