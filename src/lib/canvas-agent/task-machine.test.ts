import { describe, expect, it } from "vitest"

import {
  InvalidAgentTaskTransitionError,
  createAgentTask,
  transitionAgentTask,
} from "./task-machine"

describe("canvas agent task machine", () => {
  it("creates a queued task with a first history event", () => {
    const task = createAgentTask(
      {
        userInstruction: "生成一个运动鞋广告主视觉",
        selectedCanvasId: "shape:image",
        contextSnapshotId: "context-1",
      },
      {
        id: "agent-task-1",
        eventId: "event-1",
        now: "2026-07-25T01:00:00.000Z",
      }
    )

    expect(task).toMatchObject({
      id: "agent-task-1",
      revision: 0,
      status: "queued",
      selectedCanvasId: "shape:image",
      history: [{ id: "event-1", status: "queued" }],
    })
  })

  it("moves through a legal transition and increments the revision", () => {
    const queued = createAgentTask(
      { userInstruction: "生成图片" },
      {
        id: "agent-task-1",
        eventId: "event-1",
        now: "2026-07-25T01:00:00.000Z",
      }
    )

    const understanding = transitionAgentTask(queued, "understanding", {
      eventId: "event-2",
      message: "正在理解任务",
      now: "2026-07-25T01:00:01.000Z",
    })

    expect(understanding).toMatchObject({
      revision: 1,
      status: "understanding",
      updatedAt: "2026-07-25T01:00:01.000Z",
    })
    expect(understanding.history).toHaveLength(2)
  })

  it("rejects skipping directly from queued to executing", () => {
    const queued = createAgentTask(
      { userInstruction: "生成图片" },
      {
        id: "agent-task-1",
        eventId: "event-1",
        now: "2026-07-25T01:00:00.000Z",
      }
    )

    expect(() =>
      transitionAgentTask(queued, "executing", {
        eventId: "event-2",
        now: "2026-07-25T01:00:01.000Z",
      })
    ).toThrow(InvalidAgentTaskTransitionError)
  })

  it("marks terminal tasks and prevents further transitions", () => {
    const queued = createAgentTask(
      { userInstruction: "生成图片" },
      {
        id: "agent-task-1",
        eventId: "event-1",
        now: "2026-07-25T01:00:00.000Z",
      }
    )
    const cancelled = transitionAgentTask(queued, "cancelled", {
      eventId: "event-2",
      now: "2026-07-25T01:00:01.000Z",
    })

    expect(cancelled.completedAt).toBe("2026-07-25T01:00:01.000Z")
    expect(() =>
      transitionAgentTask(cancelled, "queued", {
        eventId: "event-3",
        now: "2026-07-25T01:00:02.000Z",
      })
    ).toThrow(InvalidAgentTaskTransitionError)
  })
})
