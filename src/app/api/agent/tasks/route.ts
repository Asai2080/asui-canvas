import { NextResponse } from "next/server"
import { z } from "zod"

import { canvasContextSnapshotSchema } from "../../../../lib/canvas-agent/context/schema"
import { createStoredCanvasContextSnapshot } from "../../../../lib/canvas-agent/context/store"
import { isCanvasAgentEnabled } from "../../../../lib/canvas-agent/feature-flags"
import { recoverAgentTasks } from "../../../../lib/canvas-agent/recovery"
import { createAgentTask } from "../../../../lib/canvas-agent/task-machine"
import {
  createStoredAgentTask,
} from "../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

const requestSchema = z
  .object({
    userInstruction: z.string().trim().min(1).max(20_000),
    selectedCanvasId: z.string().trim().min(1).optional(),
    skillId: z.string().trim().min(1).optional(),
    contextSnapshotId: z.string().trim().min(1).optional(),
    contextSnapshot: canvasContextSnapshotSchema.optional(),
  })
  .refine(
    (input) =>
      !input.contextSnapshot ||
      !input.contextSnapshotId ||
      input.contextSnapshot.id === input.contextSnapshotId,
    { message: "Context snapshot IDs must match" }
  )

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function GET() {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    return NextResponse.json({ tasks: await recoverAgentTasks() })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list Agent tasks",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const input = requestSchema.parse(await request.json())
    const { contextSnapshot, ...taskInput } = input
    if (contextSnapshot) {
      await createStoredCanvasContextSnapshot(contextSnapshot)
    }
    const stored = await createStoredAgentTask(
      createAgentTask({
        ...taskInput,
        contextSnapshotId: contextSnapshot?.id ?? taskInput.contextSnapshotId,
      })
    )
    return NextResponse.json(stored, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid Agent task" }, { status: 400 })
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create Agent task",
      },
      { status: 500 }
    )
  }
}
