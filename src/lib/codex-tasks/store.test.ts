import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it } from "vitest"

import { createCodexTask } from "./schema"
import { writeCodexTask } from "./store"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("codex task store", () => {
  it("writes queued tasks into a local outbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "asui-codex-task-"))
    roots.push(root)
    const task = createCodexTask({
      type: "code-change",
      instruction: "实现多标注统一生成",
      canvasContext: {
        selectedShapeIds: ["shape:1"],
        annotationIds: ["shape:a", "shape:b"],
      },
    })

    const result = await writeCodexTask(task, root)
    const saved = JSON.parse(await readFile(result.path, "utf8")) as { id: string; instruction: string }

    expect(result.fileName).toBe(`${task.id}.json`)
    expect(result.relativePath).toBe(`.asui-codex/tasks/queued/${task.id}.json`)
    expect(saved.id).toBe(task.id)
    expect(saved.instruction).toBe("实现多标注统一生成")
  })
})
