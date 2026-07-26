import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import type { StructuredAgentPlan } from "./planner/schema"
import { recoverAgentTasks } from "./recovery"
import { agentTaskSchema, type AgentTask } from "./task-schema"
import { createStoredAgentTask, getStoredAgentTask } from "./task-store"

const roots: string[] = []
const now = "2026-07-26T11:00:00.000Z"

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-agent-recovery-"))
  roots.push(root)
  return root
}

function plan(
  taskId: string,
  tool: "generate_image" | "generate_video"
): StructuredAgentPlan {
  return {
    version: 1,
    taskId,
    summary: "恢复生成任务",
    maxParallelism: 1,
    maxGeneratedNodes: 1,
    steps: [
      {
        id: "generate-1",
        title: "生成结果",
        tool,
        dependsOn: [],
        status: "running",
        attempts: 1,
        input:
          tool === "generate_video"
            ? {
                promptOutputId: "output-1",
                prompt: "镜头缓慢推进",
                durationSeconds: 8,
                resolution: "720p",
              }
            : {
                promptOutputId: "output-1",
                prompt: "绿色海报",
                width: 768,
                height: 1024,
                count: 1,
              },
        outputRefs: [],
      },
    ],
  }
}

function executingTask(
  id: string,
  executionPlan: StructuredAgentPlan,
  providerJobIds?: Record<string, string>
): AgentTask {
  return agentTaskSchema.parse({
    id,
    revision: 0,
    source: "asui-canvas-agent",
    status: "executing",
    userInstruction: "恢复任务",
    executionPlan,
    activeStepId: "generate-1",
    providerJobIds,
    resultNodeIds: [],
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: `event-${id}`,
        status: "executing",
        message: "正在执行生成任务",
        createdAt: now,
      },
    ],
  })
}

describe("recoverAgentTasks", () => {
  it("returns a running step without a provider job to a safe pending state", async () => {
    const root = await createRoot()
    const task = executingTask("task-image-recovery", plan("task-image-recovery", "generate_image"))
    await createStoredAgentTask(task, root)

    const [recovered] = await recoverAgentTasks({ root, now: () => now })

    expect(recovered.revision).toBe(1)
    expect(recovered.activeStepId).toBeUndefined()
    expect(recovered.executionPlan?.steps[0]).toMatchObject({
      status: "pending",
      attempts: 1,
    })
    expect(recovered.history.at(-1)?.message).toContain("安全步骤")
  })

  it("preserves a video provider job so execution resumes by polling", async () => {
    const root = await createRoot()
    const task = executingTask(
      "task-video-recovery",
      plan("task-video-recovery", "generate_video"),
      { "generate-1": "provider-job-existing" }
    )
    await createStoredAgentTask(task, root)

    const [recovered] = await recoverAgentTasks({ root, now: () => now })
    const stored = await getStoredAgentTask(task.id, root)

    expect(recovered.revision).toBe(0)
    expect(recovered.executionPlan?.steps[0].status).toBe("running")
    expect(recovered.providerJobIds?.["generate-1"]).toBe("provider-job-existing")
    expect(stored?.task).toEqual(task)
  })

  it("does not mutate terminal or writeback tasks", async () => {
    const root = await createRoot()
    const writing = agentTaskSchema.parse({
      ...executingTask("task-writing", plan("task-writing", "generate_image")),
      status: "writing-canvas",
    })
    const completed = agentTaskSchema.parse({
      ...executingTask("task-completed", plan("task-completed", "generate_image")),
      status: "completed",
      activeStepId: undefined,
      completedAt: now,
    })
    await createStoredAgentTask(writing, root)
    await createStoredAgentTask(completed, root)

    const recovered = await recoverAgentTasks({ root, now: () => now })

    expect(recovered.find(({ id }) => id === writing.id)?.revision).toBe(0)
    expect(recovered.find(({ id }) => id === completed.id)?.revision).toBe(0)
  })
})
