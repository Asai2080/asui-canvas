import { NextResponse } from "next/server"
import { z } from "zod"

import { isCanvasAgentEnabled } from "../../../../../../lib/canvas-agent/feature-flags"
import {
  confirmAgentTask,
  InvalidAgentTaskDimensionsError,
  InvalidAgentTaskConfirmationError,
} from "../../../../../../lib/canvas-agent/task-operations"
import { AgentTaskNotFoundError } from "../../../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

const requestSchema = z
  .object({
    width: z.number().int().min(64).max(8192).optional(),
    height: z.number().int().min(64).max(8192).optional(),
  })
  .refine(
    (input) =>
      (input.width === undefined && input.height === undefined) ||
      (input.width !== undefined && input.height !== undefined),
    { message: "Width and height must be provided together" }
  )

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const { taskId } = await context.params
    const input = requestSchema.parse(
      await request.json().catch(() => ({}))
    )
    return NextResponse.json({
      task: await confirmAgentTask(taskId, input),
    })
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      error instanceof InvalidAgentTaskDimensionsError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
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
