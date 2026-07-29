import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { agentTaskSchema } from "../../../../../../lib/canvas-agent/task-schema"
import { createAgentTask } from "../../../../../../lib/canvas-agent/task-machine"
import { createStoredAgentTask } from "../../../../../../lib/canvas-agent/task-store"
import { POST } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-task-confirm-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

describe("POST /api/agent/tasks/:taskId/confirm", () => {
  it("continues a task that is waiting for prompt confirmation", async () => {
    const task = createAgentTask(
      {
        userInstruction: "生成春天的图片",
        executionMode: "confirm",
      },
      {
        id: "task-confirm",
        eventId: "event-confirm-source",
        now: "2026-07-29T10:00:00.000Z",
      }
    )
    await createStoredAgentTask(
      agentTaskSchema.parse({
        ...task,
        status: "awaiting-confirmation",
      }),
      root
    )

    const response = await POST(
      new Request("http://localhost/api/agent/tasks/task-confirm/confirm", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-confirm" }) }
    )
    const payload = (await response.json()) as {
      task: { status: string; promptConfirmedAt?: string }
    }

    expect(response.status).toBe(200)
    expect(payload.task.status).toBe("planning")
    expect(payload.task.promptConfirmedAt).toBeTruthy()
  })
})
