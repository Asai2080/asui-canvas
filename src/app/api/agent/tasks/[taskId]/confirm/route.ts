import { NextResponse } from "next/server"

import { isCanvasAgentEnabled } from "../../../../../../lib/canvas-agent/feature-flags"
import {
  confirmAgentTask,
  InvalidAgentTaskConfirmationError,
} from "../../../../../../lib/canvas-agent/task-operations"
import { AgentTaskNotFoundError } from "../../../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const { taskId } = await context.params
    return NextResponse.json({ task: await confirmAgentTask(taskId) })
  } catch (error) {
    if (error instanceof AgentTaskNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof InvalidAgentTaskConfirmationError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to confirm Agent task",
      },
      { status: 500 }
    )
  }
}
