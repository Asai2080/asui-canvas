import { NextResponse } from "next/server"
import { z } from "zod"

import { isCanvasAgentEnabled } from "../../../../../../lib/canvas-agent/feature-flags"
import { runAgentTaskTick } from "../../../../../../lib/canvas-agent/orchestrator"
import { AgentTaskNotFoundError } from "../../../../../../lib/canvas-agent/task-store"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ taskId: string }>
}

const optionalCredential = z.string().max(20_000).optional()
const requestSchema = z.object({
  imageCredentials: z
    .object({
      baseUrl: optionalCredential,
      apiKey: optionalCredential,
      model: optionalCredential,
    })
    .optional(),
  videoCredentials: z
    .object({
      provider: optionalCredential,
      videoBaseUrl: optionalCredential,
      videoApiKey: optionalCredential,
      videoModel: optionalCredential,
    })
    .optional(),
})

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function POST(request: Request, context: RouteContext) {
  if (!isCanvasAgentEnabled()) {
    return unavailable()
  }

  try {
    const { taskId } = await context.params
    const input = requestSchema.parse(await request.json())
    const task = await runAgentTaskTick(taskId, {
      apiOrigin: new URL(request.url).origin,
      imageCredentials: input.imageCredentials,
      videoCredentials: input.videoCredentials,
    })
    return NextResponse.json({ task })
  } catch (error) {
    if (error instanceof AgentTaskNotFoundError) {
      return unavailable()
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid Agent run request" }, { status: 400 })
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run Agent task",
      },
      { status: 500 }
    )
  }
}
