import { NextResponse } from "next/server"

import { agentCanvasCommandAcknowledgementSchema } from "../../../../../../lib/canvas-agent/canvas-commands/schema"
import { isCanvasAgentEnabled } from "../../../../../../lib/canvas-agent/feature-flags"
import {
  acknowledgeAgentCanvasWriteback,
  InvalidAgentCanvasAcknowledgementError,
} from "../../../../../../lib/canvas-agent/task-operations"
import { AgentTaskNotFoundError } from "../../../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ taskId: string }>
}

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function POST(request: Request, context: RouteContext) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const { taskId } = await context.params
    const acknowledgement = agentCanvasCommandAcknowledgementSchema.parse(
      await request.json()
    )
    return NextResponse.json({
      task: await acknowledgeAgentCanvasWriteback(taskId, acknowledgement),
    })
  } catch (error) {
    if (error instanceof AgentTaskNotFoundError) {
      return unavailable()
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to acknowledge Agent canvas writeback",
      },
      {
        status:
          error instanceof InvalidAgentCanvasAcknowledgementError ? 409 : 400,
      }
    )
  }
}
