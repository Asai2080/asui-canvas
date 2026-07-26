import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GET, POST } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-task-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

function request(body: unknown) {
  return new Request("http://localhost/api/agent/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/agent/tasks", () => {
  it("returns 404 without creating data when the feature flag is disabled", async () => {
    const response = await POST(request({ userInstruction: "生成四张海报" }))

    expect(response.status).toBe(404)
    expect(await GET()).toMatchObject({ status: 404 })
  })

  it("creates and lists queued tasks when enabled", async () => {
    process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"

    const createdResponse = await POST(
      request({
        userInstruction: "生成四张国风茶饮海报",
        selectedCanvasId: "shape-image",
        skillId: "skill-poster",
        contextSnapshotId: "context-1",
      })
    )
    const created = (await createdResponse.json()) as {
      task: { id: string; status: string }
    }
    const listResponse = await GET()
    const listed = (await listResponse.json()) as {
      tasks: Array<{ id: string }>
    }

    expect(createdResponse.status).toBe(201)
    expect(created.task.status).toBe("queued")
    expect(listed.tasks.map((task) => task.id)).toEqual([created.task.id])
  })

  it("rejects invalid task input", async () => {
    process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
    const response = await POST(request({ userInstruction: "" }))

    expect(response.status).toBe(400)
  })

  it("stores an inline canvas snapshot with the task", async () => {
    process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
    const response = await POST(
      request({
        userInstruction: "把当前画布做成两张海报",
        selectedCanvasId: "image-1",
        contextSnapshot: {
          id: "context-inline",
          createdAt: "2026-07-26T08:00:00.000Z",
          scope: "selection",
          selectedNodeId: "image-1",
          annotations: [],
          connectedNodes: [],
          references: [],
        },
      })
    )
    const payload = (await response.json()) as {
      task: { contextSnapshotId?: string }
    }

    expect(response.status).toBe(201)
    expect(payload.task.contextSnapshotId).toBe("context-inline")
  })

  it("rejects mismatched context snapshot IDs", async () => {
    process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
    const response = await POST(
      request({
        userInstruction: "生成图片",
        contextSnapshotId: "context-a",
        contextSnapshot: {
          id: "context-b",
          createdAt: "2026-07-26T08:00:00.000Z",
          scope: "selection",
          annotations: [],
          connectedNodes: [],
          references: [],
        },
      })
    )

    expect(response.status).toBe(400)
  })
})
