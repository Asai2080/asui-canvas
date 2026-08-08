import { describe, expect, it } from "vitest"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import { agentTaskAdvanceDelay } from "./task-polling"

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-video",
    revision: 3,
    source: "asui-canvas-agent",
    status: "completed",
    executionMode: "auto",
    userInstruction: "生成视频",
    resultNodeIds: [],
    history: [],
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:01.000Z",
    completedAt: "2026-08-02T00:00:01.000Z",
    ...overrides,
  }
}

describe("agentTaskAdvanceDelay", () => {
  it("uses a provider-friendly interval while polling an existing video job", () => {
    const videoTask = task({
      status: "executing",
      activeStepId: "generate-video-1",
      providerJobIds: { "generate-video-1": "provider-job-1" },
      executionPlan: {
        version: 1,
        taskId: "task-video",
        summary: "生成视频",
        maxParallelism: 1,
        maxGeneratedNodes: 1,
        steps: [
          {
            id: "generate-video-1",
            title: "生成视频",
            tool: "generate_video",
            dependsOn: [],
            status: "running",
            attempts: 1,
            input: {},
            outputRefs: [],
          },
        ],
      },
    })

    expect(agentTaskAdvanceDelay(videoTask)).toBe(2_500)
    expect(agentTaskAdvanceDelay(task({ status: "planning" }))).toBe(750)
  })
})
