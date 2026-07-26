import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { agentTaskSchema } from "../../../../../../lib/canvas-agent/task-schema"
import { createStoredAgentTask } from "../../../../../../lib/canvas-agent/task-store"
import { POST } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-writeback-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

function request(body: unknown) {
  return new Request(
    "http://localhost/api/agent/tasks/task-writeback/writeback",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

async function createWritingTask() {
  await createStoredAgentTask(
    agentTaskSchema.parse({
      id: "task-writeback",
      revision: 3,
      source: "asui-canvas-agent",
      status: "writing-canvas",
      userInstruction: "生成一张图片",
      resultNodeIds: [],
      createdAt: "2026-07-25T09:00:00.000Z",
      updatedAt: "2026-07-25T09:01:00.000Z",
      history: [
        {
          id: "event-writeback-source",
          status: "writing-canvas",
          message: "等待写入",
          createdAt: "2026-07-25T09:01:00.000Z",
        },
      ],
    }),
    root
  )
}

describe("POST /api/agent/tasks/:taskId/writeback", () => {
  it("persists an applied canvas acknowledgement", async () => {
    await createWritingTask()

    const response = await POST(
      request({
        batchId: "canvas-write-task-writeback-r3",
        taskId: "task-writeback",
        status: "applied",
        resultNodeIds: ["shape-result"],
        artifactNodeIds: { "artifact-image": "shape-result" },
        errors: [],
      }),
      { params: Promise.resolve({ taskId: "task-writeback" }) }
    )
    const payload = (await response.json()) as {
      task: { status: string; resultNodeIds: string[] }
    }

    expect(response.status).toBe(200)
    expect(payload.task).toMatchObject({
      status: "completed",
      resultNodeIds: ["shape-result"],
    })
  })

  it("returns 404 while the Agent feature flag is disabled", async () => {
    await createWritingTask()
    process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "false"

    const response = await POST(
      request({
        batchId: "canvas-write-task-writeback-r3",
        taskId: "task-writeback",
        status: "applied",
        resultNodeIds: ["shape-result"],
        artifactNodeIds: {},
        errors: [],
      }),
      { params: Promise.resolve({ taskId: "task-writeback" }) }
    )

    expect(response.status).toBe(404)
  })
})
