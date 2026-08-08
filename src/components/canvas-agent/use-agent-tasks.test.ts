import { describe, expect, it } from "vitest"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import {
  canContinueClarification,
  continuationRequestOverrides,
} from "./continuation-request"

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-cover-choice",
    revision: 3,
    source: "asui-canvas-agent",
    status: "completed",
    executionMode: "confirm",
    userInstruction: "生成封面",
    requestedOutputCount: 2,
    skillId: "builtin-cover-design",
    selectedCanvasId: "shape:image-source",
    contextSnapshotId: "context-cover",
    resultNodeIds: [],
    history: [],
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:01.000Z",
    completedAt: "2026-08-02T00:00:01.000Z",
    ...overrides,
  }
}

describe("continuationRequestOverrides", () => {
  it("keeps clarification answers bound to the Skill and settings that asked the question", () => {
    expect(continuationRequestOverrides(task())).toEqual({
      skillId: "builtin-cover-design",
      requestedOutputCount: 2,
      executionMode: "confirm",
      continuationOfTaskId: "task-cover-choice",
    })
  })

  it("does not continue a clarification after the user selects another Skill", () => {
    expect(canContinueClarification(task(), "builtin-image-to-3d")).toBe(false)
    expect(canContinueClarification(task(), "builtin-cover-design")).toBe(true)
    expect(canContinueClarification(task())).toBe(true)
  })
})
