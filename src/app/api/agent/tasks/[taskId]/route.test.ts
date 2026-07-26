import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createAgentTask } from "../../../../../lib/canvas-agent/task-machine"
import { createStoredAgentTask } from "../../../../../lib/canvas-agent/task-store"
import { GET } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-task-detail-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

describe("GET /api/agent/tasks/:taskId", () => {
  it("returns the stored task", async () => {
    const task = createAgentTask(
      { userInstruction: "生成海报" },
      {
        id: "task-detail",
        eventId: "event-detail",
        now: "2026-07-25T10:00:00.000Z",
      }
    )
    await createStoredAgentTask(task, root)

    const response = await GET(
      new Request("http://localhost/api/agent/tasks/task-detail"),
      { params: Promise.resolve({ taskId: "task-detail" }) }
    )
    const payload = (await response.json()) as { task: { id: string } }

    expect(response.status).toBe(200)
    expect(payload.task.id).toBe("task-detail")
  })

  it("returns 404 for missing tasks", async () => {
    const response = await GET(
      new Request("http://localhost/api/agent/tasks/missing"),
      { params: Promise.resolve({ taskId: "missing" }) }
    )

    expect(response.status).toBe(404)
  })
})
