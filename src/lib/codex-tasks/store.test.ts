import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it } from "vitest"

import { createCodexTask } from "./schema"
import { getCodexTask, receiveNextCodexTask, updateCodexTask, writeCodexTask } from "./store"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("codex task store", () => {
  it("writes queued tasks into a local outbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "asui-codex-task-"))
    roots.push(root)
    const task = createCodexTask({
      type: "image-generation",
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

  it("receives the next queued task", async () => {
    const root = await mkdtemp(join(tmpdir(), "asui-codex-task-"))
    roots.push(root)
    const task = createCodexTask({
      type: "image-generation",
      instruction: "根据标注改图",
      canvasContext: {
        selectedShapeIds: ["shape:image"],
        annotationIds: ["shape:annotation"],
      },
    })

    await writeCodexTask(task, root)
    const received = await receiveNextCodexTask("test-receiver", root)
    const status = await getCodexTask(task.id, root)

    expect(received?.task).toMatchObject({ id: task.id, status: "received", receiver: "test-receiver" })
    expect(received?.file.relativePath).toBe(`.asui-codex/tasks/received/${task.id}.json`)
    expect(status?.task.status).toBe("received")
  })

  it("moves a received task through processing and done", async () => {
    const root = await mkdtemp(join(tmpdir(), "asui-codex-task-"))
    roots.push(root)
    const task = createCodexTask({
      type: "image-generation",
      instruction: "生成图片",
      canvasContext: {
        selectedShapeIds: ["shape:image"],
        annotationIds: [],
      },
    })

    await writeCodexTask(task, root)
    await receiveNextCodexTask("test-receiver", root)
    const processing = await updateCodexTask(task.id, { status: "processing" }, root)
    const done = await updateCodexTask(
      task.id,
      {
        status: "done",
        result: { message: "生成结果已插回无限画布" },
      },
      root
    )

    expect(processing?.file.relativePath).toBe(`.asui-codex/tasks/processing/${task.id}.json`)
    expect(done?.task).toMatchObject({
      id: task.id,
      status: "done",
      result: { message: "生成结果已插回无限画布" },
    })
    expect(done?.file.relativePath).toBe(`.asui-codex/tasks/done/${task.id}.json`)
  })

  it("stores a generated image version result", async () => {
    const root = await mkdtemp(join(tmpdir(), "asui-codex-task-"))
    roots.push(root)
    const task = createCodexTask({
      type: "image-generation",
      instruction: "Codex 生成结果写回画布",
      canvasContext: {
        selectedShapeIds: ["shape:image"],
        annotationIds: ["shape:annotation"],
      },
    })

    await writeCodexTask(task, root)
    await receiveNextCodexTask("test-receiver", root)
    const done = await updateCodexTask(
      task.id,
      {
        status: "done",
        result: {
          message: "Codex 生成完成",
          versionId: "version-codex",
          version: {
            versionId: "version-codex",
            prompt: "Codex result",
            src: "data:image/png;base64,AA==",
            width: 512,
            height: 512,
            createdAt: new Date().toISOString(),
          },
        },
      },
      root
    )

    expect(done?.task.result?.version?.versionId).toBe("version-codex")
    expect(done?.task.result?.version?.src).toBe("data:image/png;base64,AA==")
    expect(done?.file.relativePath).toBe(`.asui-codex/tasks/done/${task.id}.json`)
  })
})
