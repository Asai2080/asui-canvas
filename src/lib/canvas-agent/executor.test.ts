import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { executeAgentTask } from "./executor"
import type { StructuredAgentPlan } from "./planner/schema"
import { agentTaskSchema, type AgentTask } from "./task-schema"
import {
  createStoredAgentTask,
  getStoredAgentTask,
} from "./task-store"
import { createStoredCanvasContextSnapshot } from "./context/store"

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

function model3dPlan(taskId: string): StructuredAgentPlan {
  return {
    version: 1,
    taskId,
    summary: "图片转 3D",
    maxParallelism: 1,
    maxGeneratedNodes: 1,
    steps: [
      {
        id: "generate-model-1",
        title: "构建程序化 3D 模型",
        tool: "generate_3d_model",
        dependsOn: [],
        status: "pending",
        attempts: 0,
        input: {
          promptOutputId: "output-model-1",
          contextSnapshotId: "context-model-3d",
          prompt: "重建真实 3D 几何",
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
      async () => [
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
      async () => ({
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

  it("passes the selected source image and references into create-image steps", async () => {
    const root = await createRoot()
    await createStoredCanvasContextSnapshot({
      id: "context-image-to-3d",
      createdAt: now,
      scope: "selection",
      selectedNodeId: "source-image",
      sourceNode: {
        id: "source-image",
        kind: "image",
        bounds: { x: 0, y: 0, w: 1024, h: 768 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.test/source.png",
          width: 1024,
          height: 768,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [
        {
          id: "reference-side",
          kind: "image",
          bounds: { x: 1200, y: 0, w: 1024, h: 768 },
          referenceIds: [],
          media: {
            referenceType: "url",
            mediaType: "image",
            src: "https://example.test/side.png",
            width: 1024,
            height: 768,
          },
        },
      ],
    }, root)
    const plan = imagePlan("task-image-reference")
    plan.steps[0].input.contextSnapshotId = "context-image-to-3d"
    const task = executingTask("task-image-reference", plan)
    await createStoredAgentTask(task, root)
    const generate = vi.fn(async () => [{
      kind: "image" as const,
      versionId: "version-reference",
      src: "https://example.test/result.png",
      prompt: "绿色环保海报",
      width: 768,
      height: 1024,
      createdAt: now,
    }])

    await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "artifact-image-reference",
      imageAdapter: { generate },
      videoAdapter: { create: vi.fn(), poll: vi.fn() },
    })

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      sourceImageSrc: "https://example.test/source.png",
      referenceImageSrcs: ["https://example.test/side.png"],
    }), {})
  })

  it("uses only the current source image for four-view generation", async () => {
    const root = await createRoot()
    await createStoredCanvasContextSnapshot({
      id: "context-four-view-source-only",
      createdAt: now,
      scope: "selection",
      selectedNodeId: "source-image",
      sourceNode: {
        id: "source-image",
        kind: "image",
        bounds: { x: 0, y: 0, w: 1024, h: 768 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.test/source.png",
          width: 1024,
          height: 768,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [{
        id: "unrelated-old-storyboard",
        kind: "image",
        bounds: { x: 1200, y: 0, w: 1024, h: 768 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.test/old-storyboard.png",
          width: 1024,
          height: 768,
        },
      }],
    }, root)
    const plan = imagePlan("task-four-view-source-only")
    plan.steps[0].input.contextSnapshotId = "context-four-view-source-only"
    plan.steps[0].input.referencePolicy = "source-only"
    const task = executingTask("task-four-view-source-only", plan)
    await createStoredAgentTask(task, root)
    const generate = vi.fn(async () => [{
      kind: "image" as const,
      versionId: "version-four-view",
      src: "https://example.test/result.png",
      prompt: "四视角",
      width: 1024,
      height: 1024,
      createdAt: now,
    }])

    await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "artifact-four-view",
      imageAdapter: { generate },
      videoAdapter: { create: vi.fn(), poll: vi.fn() },
    })

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      sourceImageSrc: "https://example.test/source.png",
      referenceImageSrcs: [],
    }), {})
  })

  it("creates a model3d artifact without calling image or video generation", async () => {
    const root = await createRoot()
    await createStoredCanvasContextSnapshot({
      id: "context-model-3d",
      createdAt: now,
      scope: "selection",
      selectedNodeId: "source-model-image",
      sourceNode: {
        id: "source-model-image",
        kind: "image",
        bounds: { x: 0, y: 0, w: 640, h: 640 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.test/object.png",
          width: 640,
          height: 640,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [],
    }, root)
    const task = executingTask("task-model-3d", model3dPlan("task-model-3d"))
    await createStoredAgentTask(task, root)
    const generateImage = vi.fn()
    const createVideo = vi.fn()
    const generateModel = vi.fn(async () => ({
      version: 1 as const,
      mode: "procedural-three" as const,
      title: "程序化物体",
      sourceSummary: "由主体和圆柱附件构成。",
      qualityContract: "保持主体轮廓、附件比例与连接关系。",
      suitability: "pass" as const,
      components: [{
        id: "body",
        name: "主体",
        primitive: "box" as const,
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [2, 1, 1] as [number, number, number],
        color: "#404044",
        roughness: 0.6,
        metalness: 0.1,
      }],
      camera: {
        position: [4, 3, 6] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fov: 40,
      },
      lighting: {
        ambientIntensity: 1,
        keyIntensity: 2,
        keyPosition: [4, 5, 6] as [number, number, number],
      },
      assumptions: [],
    }))

    const result = await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "artifact-model-1",
      imageAdapter: { generate: generateImage },
      videoAdapter: { create: createVideo, poll: vi.fn() },
      model3dAdapter: { generate: generateModel },
      textCredentials: { apiKey: "secret", model: "vision" },
    })

    expect(generateModel).toHaveBeenCalledWith({
      prompt: "重建真实 3D 几何",
      sourceImageSrc: "https://example.test/object.png",
      contextSnapshotId: "context-model-3d",
    }, { apiKey: "secret", model: "vision" })
    expect(generateImage).not.toHaveBeenCalled()
    expect(createVideo).not.toHaveBeenCalled()
    expect(result.status).toBe("writing-canvas")
    expect(result.artifacts?.["generate-model-1"]?.[0]).toMatchObject({
      kind: "model3d",
      id: "artifact-model-1",
    })
  })

  it("uses an earlier generated image artifact as the video source", async () => {
    const root = await createRoot()
    const plan = videoPlan("task-turntable")
    plan.steps[0].input.sourceStepId = "generate-image-hero"
    const task = agentTaskSchema.parse({
      ...executingTask("task-turntable", plan),
      artifacts: {
        "generate-image-hero": [{
          kind: "image",
          id: "artifact-hero",
          versionId: "version-hero",
          src: "https://example.test/hero.png",
          prompt: "前侧三分之四视图",
          width: 1024,
          height: 1024,
          createdAt: now,
        }],
      },
    })
    await createStoredAgentTask(task, root)
    const create = vi.fn(async () => ({ taskId: "provider-turntable" }))

    await executeAgentTask(task.id, {
      root,
      now: () => now,
      createId: () => "unused",
      imageAdapter: { generate: vi.fn() },
      videoAdapter: { create, poll: vi.fn() },
    })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceImageSrc: "https://example.test/hero.png",
    }), {})
  })
})
