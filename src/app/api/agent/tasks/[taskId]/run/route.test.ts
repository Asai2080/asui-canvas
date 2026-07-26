import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createAgentTask } from "../../../../../../lib/canvas-agent/task-machine"
import { createStoredAgentTask } from "../../../../../../lib/canvas-agent/task-store"

import { POST } from "./route"

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-run-route-"))
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

function request(body: unknown) {
  return new Request("http://localhost/api/agent/tasks/task-run/run", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ taskId: "task-run" }) }

describe("/api/agent/tasks/[taskId]/run", () => {
  it("advances one tick without persisting temporary credentials", async () => {
    await createStoredAgentTask(
      createAgentTask({ userInstruction: "生成海报" }, { id: "task-run" })
    )
    const response = await POST(
      request({ imageCredentials: { apiKey: "route-secret" } }),
      context
    )
    const payload = (await response.json()) as { task: { status: string } }
    const taskFile = await readFile(
      join(root, ".asui-agent/tasks/task-run.json"),
      "utf8"
    )

    expect(response.status).toBe(200)
    expect(payload.task.status).toBe("understanding")
    expect(taskFile).not.toContain("route-secret")
  })

  it("rejects malformed credentials", async () => {
    const response = await POST(
      request({ imageCredentials: { apiKey: 42 } }),
      context
    )

    expect(response.status).toBe(400)
  })
})
