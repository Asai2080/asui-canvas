import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createAgentTask } from "../../../../../../lib/canvas-agent/task-machine"
import { createStoredAgentTask } from "../../../../../../lib/canvas-agent/task-store"
import { POST } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-task-cancel-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

describe("POST /api/agent/tasks/:taskId/cancel", () => {
  it("cancels an unfinished task", async () => {
    const task = createAgentTask(
      { userInstruction: "生成海报" },
      {
        id: "task-cancel",
        eventId: "event-cancel-source",
        now: "2026-07-25T10:00:00.000Z",
      }
    )
    await createStoredAgentTask(task, root)

    const response = await POST(
      new Request("http://localhost/api/agent/tasks/task-cancel/cancel", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-cancel" }) }
    )
    const payload = (await response.json()) as { task: { status: string } }

    expect(response.status).toBe(200)
    expect(payload.task.status).toBe("cancelled")
  })
})
