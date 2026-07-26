import { describe, expect, it, vi } from "vitest"

import type { AgentCanvasCommandBatch } from "./schema"
import { createCanvasCommandBridge } from "./bridge"

const batch: AgentCanvasCommandBatch = {
  id: "canvas-write-task-1-r1",
  taskId: "task-1",
  createdAt: "2026-07-25T08:00:00.000Z",
  commands: [
    {
      type: "focus-results",
      nodeRefs: ["result-image-1"],
    },
  ],
}

describe("createCanvasCommandBridge", () => {
  it("validates and acknowledges created node ids", async () => {
    const handler = vi.fn(async () => ({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "applied" as const,
      resultNodeIds: ["shape-result"],
      artifactNodeIds: { "image-1": "shape-result" },
      errors: [],
    }))
    const bridge = createCanvasCommandBridge()
    const unsubscribe = bridge.subscribe(handler)

    await expect(bridge.publish(batch)).resolves.toMatchObject({
      status: "applied",
      resultNodeIds: ["shape-result"],
    })
    expect(handler).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("returns a partial acknowledgement without dropping successful nodes", async () => {
    const bridge = createCanvasCommandBridge()
    bridge.subscribe(async () => ({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "partial",
      resultNodeIds: ["shape-result"],
      artifactNodeIds: { "image-1": "shape-result" },
      errors: [{ commandIndex: 1, message: "video failed" }],
    }))

    await expect(bridge.publish(batch)).resolves.toEqual({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "partial",
      resultNodeIds: ["shape-result"],
      artifactNodeIds: { "image-1": "shape-result" },
      errors: [{ commandIndex: 1, message: "video failed" }],
    })
  })

  it("applies a repeated batch only once, including concurrent retries", async () => {
    const handler = vi.fn(async () => ({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "applied" as const,
      resultNodeIds: ["shape-result"],
      artifactNodeIds: {},
      errors: [],
    }))
    const bridge = createCanvasCommandBridge()
    bridge.subscribe(handler)

    const [first, second] = await Promise.all([
      bridge.publish(batch),
      bridge.publish(batch),
    ])
    const third = await bridge.publish(batch)

    expect(first).toEqual(second)
    expect(second).toEqual(third)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("rejects a batch when no canvas is subscribed", async () => {
    const bridge = createCanvasCommandBridge()

    await expect(bridge.publish(batch)).resolves.toMatchObject({
      status: "rejected",
      resultNodeIds: [],
      errors: [{ message: "当前没有可写入的画布" }],
    })
  })
})
