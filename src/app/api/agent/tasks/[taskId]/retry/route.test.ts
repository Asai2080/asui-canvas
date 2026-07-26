import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createAgentTask,
  transitionAgentTask,
} from "../../../../../../lib/canvas-agent/task-machine"
import { createStoredAgentTask } from "../../../../../../lib/canvas-agent/task-store"
import { POST } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-task-retry-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

describe("POST /api/agent/tasks/:taskId/retry", () => {
  it("creates a new queued task linked to the source", async () => {
    const source = createAgentTask(
      { userInstruction: "生成海报" },
      {
        id: "task-retry-source",
        eventId: "event-retry-source",
        now: "2026-07-25T10:00:00.000Z",
      }
    )
    const failed = transitionAgentTask(source, "failed", {
      eventId: "event-failed",
      now: "2026-07-25T10:01:00.000Z",
    })
    await createStoredAgentTask(failed, root)

    const response = await POST(
      new Request("http://localhost/api/agent/tasks/task-retry-source/retry", {
        method: "POST",
      }),
      { params: Promise.resolve({ taskId: "task-retry-source" }) }
    )
    const payload = (await response.json()) as {
      task: { id: string; status: string; retryOfTaskId: string }
    }

    expect(response.status).toBe(201)
    expect(payload.task).toMatchObject({
      status: "queued",
      retryOfTaskId: "task-retry-source",
    })
    expect(payload.task.id).not.toBe("task-retry-source")
  })
})
