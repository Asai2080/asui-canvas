import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  AgentImageGenerationInput,
  ImageGenerationCredentials,
} from "./adapters/image-generation"
import type {
  AgentVideoGenerationInput,
  VideoGenerationCredentials,
} from "./adapters/video-generation"
import { executeAgentTask } from "./executor"
import type { StructuredAgentPlan } from "./planner/schema"
import { agentTaskSchema, type AgentTask } from "./task-schema"
import {
  createStoredAgentTask,
  getStoredAgentTask,
} from "./task-store"

const roots: string[] = []
const now = "2026-07-25T08:00:00.000Z"

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-agent-executor-"))
  roots.push(root)
  return root
}

function executingTask(id: string, executionPlan: StructuredAgentPlan): AgentTask {
  return agentTaskSchema.parse({
    id,
    revision: 0,
    source: "asui-canvas-agent",
    status: "executing",
    userInstruction: "生成一张海报",
    executionPlan,
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

function imagePlan(taskId: string): StructuredAgentPlan {
  return {
    version: 1,
    taskId,
    summary: "生成一张海报",
    maxParallelism: 1,
    maxGeneratedNodes: 1,
    steps: [
      {
        id: "generate-image-1",
        title: "生成图片",
        tool: "generate_image",
        dependsOn: [],
        status: "pending",
        attempts: 0,
        input: {
          promptOutputId: "output-image-1",
          prompt: "绿色环保海报",
          negativePrompt: "不要水印",
          width: 768,
          height: 1024,
          count: 1,
        },
        outputRefs: [],
      },
    ],
  }
}

function videoPlan(taskId: string): StructuredAgentPlan {
  return {
    version: 1,
    taskId,
    summary: "生成一条视频",
    maxParallelism: 1,
    maxGeneratedNodes: 1,
    steps: [
      {
        id: "generate-video-1",
        title: "生成视频",
        tool: "generate_video",
        dependsOn: [],
        status: "pending",
        attempts: 0,
        input: {
          promptOutputId: "output-video-1",
          prompt: "镜头缓慢推进",
          durationSeconds: 8,
          resolution: "720p",
        },
        outputRefs: [],
      },
    ],
  }
}

describe("executeAgentTask", () => {
  it("persists image artifacts and completes the generation step atomically", async () => {
    const root = await createRoot()
    const task = executingTask("task-image", imagePlan("task-image"))
    await createStoredAgentTask(task, root)
    const generate = vi.fn(
      async (
        _input: AgentImageGenerationInput,
        _credentials?: ImageGenerationCredentials
      ) => [
        {
          kind: "image" as const,
          versionId: "version-1",
          src: "https://example.test/result.png",
          prompt: "绿色环保海报",
          width: 768,
          height: 1024,
          createdAt: now,
        },
      ]
    )

    const result = await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "artifact-image-1",
      imageAdapter: { generate },
      videoAdapter: {
        create: vi.fn(),
        poll: vi.fn(),
      },
      imageCredentials: {
        baseUrl: "https://provider.test/v1",
        apiKey: "top-secret-key",
        model: "image-model",
      },
    })

    expect(generate).toHaveBeenCalledOnce()
    expect(result.status).toBe("writing-canvas")
    expect(result.executionPlan?.steps[0]).toMatchObject({
      status: "completed",
      attempts: 1,
      outputRefs: ["artifact-image-1"],
    })
    expect(result.artifacts?.["generate-image-1"]?.[0]).toMatchObject({
      id: "artifact-image-1",
      src: "https://example.test/result.png",
    })
    expect(JSON.stringify((await getStoredAgentTask(task.id, root))?.task)).not.toContain(
      "top-secret-key"
    )
  })

  it("stores a provider video job id before returning to the poll loop", async () => {
    const root = await createRoot()
    const task = executingTask("task-video", videoPlan("task-video"))
    await createStoredAgentTask(task, root)
    const create = vi.fn(
      async (
        _input: AgentVideoGenerationInput,
        _credentials?: VideoGenerationCredentials
      ) => ({
        taskId: "provider-job-1",
        status: "queued",
      })
    )

    const result = await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "unused-artifact-id",
      imageAdapter: { generate: vi.fn() },
      videoAdapter: {
        create,
        poll: vi.fn(),
      },
      videoCredentials: {
        videoApiKey: "video-secret-key",
      },
    })

    expect(create).toHaveBeenCalledOnce()
    expect(result.status).toBe("executing")
    expect(result.providerJobIds).toEqual({
      "generate-video-1": "provider-job-1",
    })
    expect(result.executionPlan?.steps[0]).toMatchObject({
      status: "running",
      attempts: 1,
    })
    expect(JSON.stringify(result)).not.toContain("video-secret-key")
  })

  it("resumes an existing provider video job without creating a second billed job", async () => {
    const root = await createRoot()
    const plan = videoPlan("task-video-resume")
    plan.steps[0].status = "running"
    plan.steps[0].attempts = 1
    const task = agentTaskSchema.parse({
      ...executingTask("task-video-resume", plan),
      providerJobIds: {
        "generate-video-1": "provider-job-existing",
      },
    })
    await createStoredAgentTask(task, root)
    const create = vi.fn()
    const poll = vi.fn(async () => ({
      state: "completed" as const,
      artifact: {
        kind: "video" as const,
        src: "https://example.test/result.mp4",
        taskId: "provider-job-existing",
        status: "succeeded",
        durationSeconds: 8,
        resolution: "720p",
      },
    }))

    const result = await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "artifact-video-1",
      imageAdapter: { generate: vi.fn() },
      videoAdapter: { create, poll },
    })

    expect(create).not.toHaveBeenCalled()
    expect(poll).toHaveBeenCalledWith(
      "provider-job-existing",
      expect.objectContaining({
        prompt: "镜头缓慢推进",
      }),
      {}
    )
    expect(result.status).toBe("writing-canvas")
    expect(result.executionPlan?.steps[0]).toMatchObject({
      status: "completed",
      attempts: 1,
      outputRefs: ["artifact-video-1"],
    })
    expect(result.artifacts?.["generate-video-1"]?.[0]).toMatchObject({
      id: "artifact-video-1",
      src: "https://example.test/result.mp4",
    })
  })
})
