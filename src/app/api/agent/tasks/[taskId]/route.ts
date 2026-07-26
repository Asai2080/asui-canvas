import { NextResponse } from "next/server"

import { isCanvasAgentEnabled } from "../../../../../lib/canvas-agent/feature-flags"
import { getStoredAgentTask } from "../../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ taskId: string }>
}

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function GET(_request: Request, context: RouteContext) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const { taskId } = await context.params
    const stored = await getStoredAgentTask(taskId)
    return stored ? NextResponse.json(stored) : unavailable()
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to read Agent task",
      },
      { status: 400 }
    )
  }
}
