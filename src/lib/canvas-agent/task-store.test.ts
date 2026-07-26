import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { createAgentTask, transitionAgentTask } from "./task-machine"
import {
  AgentTaskRevisionConflictError,
  createStoredAgentTask,
  getStoredAgentTask,
  listStoredAgentTasks,
  saveStoredAgentTask,
} from "./task-store"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-agent-task-"))
  roots.push(root)
  return root
}

function queuedTask(id: string, now: string) {
  return createAgentTask(
    { userInstruction: `任务 ${id}` },
    {
      id,
      eventId: `event-${id}`,
      now,
    }
  )
}

describe("canvas agent task store", () => {
  it("creates and reads a task from the isolated agent namespace", async () => {
    const root = await createRoot()
    const task = queuedTask("agent-task-1", "2026-07-25T01:00:00.000Z")

    const saved = await createStoredAgentTask(task, root)
    const read = await getStoredAgentTask(task.id, root)

    expect(saved.relativePath).toBe(".asui-agent/tasks/agent-task-1.json")
    expect(read?.task).toEqual(task)
  })

  it("lists tasks by most recently updated first", async () => {
    const root = await createRoot()
    await createStoredAgentTask(queuedTask("agent-task-old", "2026-07-25T01:00:00.000Z"), root)
    await createStoredAgentTask(queuedTask("agent-task-new", "2026-07-25T02:00:00.000Z"), root)

    const tasks = await listStoredAgentTasks(root)

    expect(tasks.map((task) => task.id)).toEqual(["agent-task-new", "agent-task-old"])
  })

  it("prevents stale writers from overwriting a newer revision", async () => {
    const root = await createRoot()
    const queued = queuedTask("agent-task-1", "2026-07-25T01:00:00.000Z")
    await createStoredAgentTask(queued, root)
    const understanding = transitionAgentTask(queued, "understanding", {
      eventId: "event-2",
      now: "2026-07-25T01:00:01.000Z",
    })
    await saveStoredAgentTask(understanding, 0, root)

    await expect(saveStoredAgentTask(understanding, 0, root)).rejects.toBeInstanceOf(
      AgentTaskRevisionConflictError
    )
  })

  it("leaves no temporary task files after an atomic save", async () => {
    const root = await createRoot()
    const queued = queuedTask("agent-task-1", "2026-07-25T01:00:00.000Z")
    await createStoredAgentTask(queued, root)

    const files = await readdir(join(root, ".asui-agent", "tasks"))

    expect(files).toEqual(["agent-task-1.json"])
  })
})
