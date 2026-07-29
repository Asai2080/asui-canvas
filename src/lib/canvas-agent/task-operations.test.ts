import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { StructuredAgentPlan } from "./planner/schema"
import { agentTaskSchema, type AgentTask } from "./task-schema"
import {
  acknowledgeAgentCanvasWriteback,
  cancelAgentTask,
  confirmAgentTask,
  retryAgentTask,
} from "./task-operations"
import {
  createStoredAgentTask,
  getStoredAgentTask,
} from "./task-store"

const roots: string[] = []
const now = "2026-07-25T09:00:00.000Z"

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-agent-operations-"))
  roots.push(root)
  return root
}

function plan(): StructuredAgentPlan {
  return {
    version: 1,
    taskId: "task-source",
    summary: "生成两张图片",
    maxParallelism: 1,
    maxGeneratedNodes: 2,
    steps: [
      {
        id: "generate-image-1",
        title: "生成第一张图片",
        tool: "generate_image",
        dependsOn: [],
        status: "completed",
        attempts: 1,
        input: {
          promptOutputId: "output-1",
          prompt: "第一张",
          width: 768,
          height: 1024,
          count: 1,
        },
        outputRefs: ["artifact-image-1"],
      },
      {
        id: "generate-image-2",
        title: "生成第二张图片",
        tool: "generate_image",
        dependsOn: [],
        status: "running",
        attempts: 1,
        input: {
          promptOutputId: "output-2",
          prompt: "第二张",
          width: 768,
          height: 1024,
          count: 1,
        },
        outputRefs: [],
      },
    ],
  }
}

function sourceTask(overrides: Partial<AgentTask> = {}) {
  return agentTaskSchema.parse({
    id: "task-source",
    revision: 0,
    source: "asui-canvas-agent",
    status: "executing",
    userInstruction: "生成两张图片",
    requestedOutputCount: 6,
    selectedCanvasId: "shape-image",
    skillId: "skill-poster",
    contextSnapshotId: "context-1",
    executionPlan: plan(),
    providerJobIds: {
      "generate-image-2": "provider-job-2",
    },
    artifacts: {
      "generate-image-1": [
        {
          kind: "image",
          id: "artifact-image-1",
          versionId: "version-1",
          src: "https://example.test/first.png",
          prompt: "第一张",
          width: 768,
          height: 1024,
          createdAt: now,
        },
      ],
    },
    resultNodeIds: [],
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: "event-source",
        status: "executing",
        message: "正在执行",
        createdAt: now,
      },
    ],
    ...overrides,
  })
}

describe("cancelAgentTask", () => {
  it("keeps completed artifacts and cancels only unfinished steps", async () => {
    const root = await createRoot()
    await createStoredAgentTask(sourceTask(), root)
    const cancelProviderJob = vi.fn(async () => undefined)

    const result = await cancelAgentTask("task-source", {
      root,
      now: () => now,
      createId: () => "event-cancel",
      cancelProviderJob,
    })

    expect(cancelProviderJob).toHaveBeenCalledWith("provider-job-2")
    expect(result.status).toBe("partially-completed")
    expect(result.artifacts?.["generate-image-1"]).toHaveLength(1)
    expect(result.executionPlan?.steps).toEqual([
      expect.objectContaining({ id: "generate-image-1", status: "completed" }),
      expect.objectContaining({ id: "generate-image-2", status: "cancelled" }),
    ])
    expect((await getStoredAgentTask(result.id, root))?.task).toEqual(result)
  })

  it("uses cancelled when no output has completed", async () => {
    const root = await createRoot()
    const emptyPlan = plan()
    emptyPlan.steps[0].status = "pending"
    emptyPlan.steps[0].outputRefs = []
    await createStoredAgentTask(
      sourceTask({
        artifacts: undefined,
        executionPlan: emptyPlan,
      }),
      root
    )

    const result = await cancelAgentTask("task-source", {
      root,
      now: () => now,
      createId: () => "event-cancel",
    })

    expect(result.status).toBe("cancelled")
    expect(result.executionPlan?.steps.every((step) => step.status === "cancelled")).toBe(
      true
    )
  })
})

describe("retryAgentTask", () => {
  it("creates a new queued task without rewriting the source history", async () => {
    const root = await createRoot()
    const failed = sourceTask({
      status: "partially-completed",
      completedAt: now,
    })
    await createStoredAgentTask(failed, root)

    const retried = await retryAgentTask("task-source", {
      root,
      now: () => "2026-07-25T09:01:00.000Z",
      createTaskId: () => "task-retry",
      createEventId: () => "event-retry",
    })

    expect(retried).toMatchObject({
      id: "task-retry",
      status: "queued",
      retryOfTaskId: "task-source",
      userInstruction: "生成两张图片",
      requestedOutputCount: 6,
      selectedCanvasId: "shape-image",
      skillId: "skill-poster",
      contextSnapshotId: "context-1",
    })
    expect((await getStoredAgentTask("task-source", root))?.task).toEqual(failed)
    expect((await getStoredAgentTask("task-retry", root))?.task).toEqual(retried)
  })
})

describe("confirmAgentTask", () => {
  it("moves a waiting task into planning and records the confirmation", async () => {
    const root = await createRoot()
    await createStoredAgentTask(
      sourceTask({
        status: "awaiting-confirmation",
        executionMode: "confirm",
        executionPlan: undefined,
      }),
      root
    )

    const confirmed = await confirmAgentTask("task-source", {
      root,
      now: () => "2026-07-25T09:03:00.000Z",
      createId: () => "event-confirm",
    })

    expect(confirmed).toMatchObject({
      status: "planning",
      executionMode: "confirm",
      promptConfirmedAt: "2026-07-25T09:03:00.000Z",
    })
    expect(confirmed.history.at(-1)).toMatchObject({
      id: "event-confirm",
      status: "planning",
    })
  })
})

describe("acknowledgeAgentCanvasWriteback", () => {
  it("completes a task and persists the created canvas node ids", async () => {
    const root = await createRoot()
    await createStoredAgentTask(
      sourceTask({ status: "writing-canvas" }),
      root
    )

    const result = await acknowledgeAgentCanvasWriteback(
      "task-source",
      {
        batchId: "canvas-write-task-source-r0",
        taskId: "task-source",
        status: "applied",
        resultNodeIds: ["shape-result-1", "shape-result-2"],
        artifactNodeIds: {
          "artifact-image-1": "shape-result-1",
        },
        errors: [],
      },
      {
        root,
        now: () => "2026-07-25T09:02:00.000Z",
        createId: () => "event-writeback",
      }
    )

    expect(result).toMatchObject({
      status: "completed",
      resultNodeIds: ["shape-result-1", "shape-result-2"],
      completedAt: "2026-07-25T09:02:00.000Z",
    })
    expect((await getStoredAgentTask(result.id, root))?.task).toEqual(result)
  })

  it("keeps successful nodes when only part of the writeback applies", async () => {
    const root = await createRoot()
    await createStoredAgentTask(
      sourceTask({ status: "writing-canvas" }),
      root
    )

    const result = await acknowledgeAgentCanvasWriteback(
      "task-source",
      {
        batchId: "canvas-write-task-source-r0",
        taskId: "task-source",
        status: "partial",
        resultNodeIds: ["shape-result-1"],
        artifactNodeIds: {
          "artifact-image-1": "shape-result-1",
        },
        errors: [{ commandIndex: 2, message: "视频节点写入失败" }],
      },
      { root, now: () => now, createId: () => "event-partial" }
    )

    expect(result).toMatchObject({
      status: "partially-completed",
      resultNodeIds: ["shape-result-1"],
    })
  })

  it("is idempotent after the same acknowledgement completed the task", async () => {
    const root = await createRoot()
    await createStoredAgentTask(
      sourceTask({
        status: "completed",
        completedAt: now,
        resultNodeIds: ["shape-result-1"],
      }),
      root
    )

    const result = await acknowledgeAgentCanvasWriteback(
      "task-source",
      {
        batchId: "canvas-write-task-source-r0",
        taskId: "task-source",
        status: "applied",
        resultNodeIds: ["shape-result-1"],
        artifactNodeIds: {
          "artifact-image-1": "shape-result-1",
        },
        errors: [],
      },
      { root }
    )

    expect(result.revision).toBe(0)
    expect(result.status).toBe("completed")
  })

  it("rejects an acknowledgement for another task", async () => {
    const root = await createRoot()
    await createStoredAgentTask(
      sourceTask({ status: "writing-canvas" }),
      root
    )

    await expect(
      acknowledgeAgentCanvasWriteback(
        "task-source",
        {
          batchId: "canvas-write-other-task-r0",
          taskId: "other-task",
          status: "applied",
          resultNodeIds: ["shape-result-1"],
          artifactNodeIds: {},
          errors: [],
        },
        { root }
      )
    ).rejects.toThrow("does not match")
  })
})
