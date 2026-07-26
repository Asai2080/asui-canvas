import { describe, expect, it, vi } from "vitest"

import type { AgentTask } from "../task-schema"
import { writeAgentTaskToCanvas } from "./writeback"

const task = {
  id: "task-writeback",
  revision: 2,
  source: "asui-canvas-agent",
  status: "writing-canvas",
  userInstruction: "生成一张海报",
  selectedCanvasId: "shape-source",
  resultNodeIds: [],
  artifacts: {
    "generate-image": [
      {
        kind: "image",
        id: "artifact-image",
        versionId: "version-image",
        src: "https://example.test/result.png",
        prompt: "生成一张海报",
        width: 640,
        height: 960,
        createdAt: "2026-07-25T08:00:00.000Z",
      },
    ],
  },
  createdAt: "2026-07-25T08:00:00.000Z",
  updatedAt: "2026-07-25T08:01:00.000Z",
  history: [
    {
      id: "event-writeback",
      status: "writing-canvas",
      message: "等待写回",
      createdAt: "2026-07-25T08:01:00.000Z",
    },
  ],
} satisfies AgentTask

describe("writeAgentTaskToCanvas", () => {
  it("publishes a typed batch and acknowledges it to the task API", async () => {
    const publish = vi.fn(async (batch) => ({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "applied" as const,
      resultNodeIds: ["shape-result"],
      artifactNodeIds: { "artifact-image": "shape-result" },
      errors: [],
    }))
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ task: { ...task, status: "completed" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )

    const result = await writeAgentTaskToCanvas(
      {
        task,
        sourceBounds: { x: 10, y: 20, w: 400, h: 600 },
        viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
      },
      { publish, fetcher }
    )

    expect(publish).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(
      "/api/agent/tasks/task-writeback/writeback",
      expect.objectContaining({ method: "POST" })
    )
    expect(result.status).toBe("completed")
  })

  it("does not publish tasks that are not ready for canvas writeback", async () => {
    const publish = vi.fn()

    await expect(
      writeAgentTaskToCanvas(
        {
          task: { ...task, status: "executing" },
          viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
        },
        { publish, fetcher: vi.fn() }
      )
    ).rejects.toThrow("writing-canvas")
    expect(publish).not.toHaveBeenCalled()
  })
})
