import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { AgentImageGenerationInput } from "./adapters/image-generation"
import type { AgentVideoGenerationInput } from "./adapters/video-generation"
import { buildAgentCanvasCommandBatch } from "./canvas-commands/layout"
import { writeAgentPromptToCanvas } from "./canvas-commands/prompt-writeback"
import type {
  AgentCanvasCommandBatch,
  AgentCanvasCommandAcknowledgement,
} from "./canvas-commands/schema"
import type { CanvasContextSnapshot } from "./context/schema"
import { createStoredCanvasContextSnapshot } from "./context/store"
import { runAgentTaskTick, type RunAgentTaskDependencies } from "./orchestrator"
import { createAgentTask } from "./task-machine"
import type { AgentTask } from "./task-schema"
import { createStoredAgentTask } from "./task-store"

const roots: string[] = []
const now = "2026-08-01T01:00:00.000Z"

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-builtin-skills-e2e-"))
  roots.push(root)
  return root
}

function imageContext(id: string): CanvasContextSnapshot {
  return {
    id,
    createdAt: now,
    scope: "selection",
    selectedNodeId: `${id}-source`,
    sourceNode: {
      id: `${id}-source`,
      kind: "image",
      bounds: { x: 100, y: 100, w: 768, h: 1024 },
      referenceIds: [`${id}-reference`],
      media: {
        referenceType: "url",
        mediaType: "image",
        src: `https://example.test/${id}-source.png`,
        width: 768,
        height: 1024,
      },
    },
    annotations: [],
    connectedNodes: [],
    references: [
      {
        id: `${id}-reference`,
        kind: "image",
        bounds: { x: 920, y: 100, w: 768, h: 1024 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: `https://example.test/${id}-reference.png`,
          width: 768,
          height: 1024,
        },
      },
    ],
  }
}

function acknowledgement(batch: AgentCanvasCommandBatch): AgentCanvasCommandAcknowledgement {
  return {
    batchId: batch.id,
    taskId: batch.taskId,
    status: "applied",
    resultNodeIds: [],
    artifactNodeIds: {},
    errors: [],
  }
}

async function runUntilWritingCanvas(
  taskId: string,
  dependencies: RunAgentTaskDependencies
) {
  let task: AgentTask | undefined
  for (let tick = 0; tick < 40; tick += 1) {
    task = await runAgentTaskTick(taskId, dependencies)
    if (task.status === "writing-canvas") return task
    if (["completed", "failed", "cancelled"].includes(task.status)) {
      throw new Error(
        `任务在写回前结束：${task.status} ${task.error?.message ?? ""}`
      )
    }
  }
  throw new Error(`任务未在限定 tick 内进入写回状态：${task?.status}`)
}

function createDependencies(root: string) {
  let artifactIndex = 0
  let videoJobIndex = 0
  const imageInputs: AgentImageGenerationInput[] = []
  const videoInputs: AgentVideoGenerationInput[] = []
  const imageAdapter = {
    generate: vi.fn(async (input: AgentImageGenerationInput) => {
      imageInputs.push(input)
      const index = imageInputs.length
      return [
        {
          kind: "image" as const,
          versionId: `version-${index}`,
          src: `https://example.test/generated-${index}.png`,
          prompt: input.prompt,
          width: input.width,
          height: input.height,
          createdAt: now,
        },
      ]
    }),
  }
  const videoAdapter = {
    create: vi.fn(async (input: AgentVideoGenerationInput) => {
      videoInputs.push(input)
      videoJobIndex += 1
      return { taskId: `video-job-${videoJobIndex}`, status: "queued" }
    }),
    poll: vi.fn(async (taskId: string, input: AgentVideoGenerationInput) => ({
      state: "completed" as const,
      artifact: {
        kind: "video" as const,
        src: `https://example.test/${taskId}.mp4`,
        taskId,
        status: "succeeded",
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
      },
    })),
  }
  const dependencies: RunAgentTaskDependencies = {
    root,
    apiOrigin: "http://localhost:3030",
    now: () => now,
    createId: (prefix) => `${prefix}-${++artifactIndex}`,
    imageAdapter,
    videoAdapter,
  }
  return { dependencies, imageInputs, videoInputs }
}

async function capturePromptBatch(task: AgentTask) {
  let captured: AgentCanvasCommandBatch | undefined
  await writeAgentPromptToCanvas(
    {
      task,
      sourceBounds: { x: 100, y: 100, w: 768, h: 1024 },
      viewportBounds: { x: 0, y: 0, w: 1920, h: 1080 },
    },
    {
      now: () => now,
      publish: async (batch) => {
        captured = batch
        return acknowledgement(batch)
      },
    }
  )
  if (!captured) throw new Error("提示词画布命令未生成")
  return captured
}

describe("built-in Skill end-to-end contracts", () => {
  it("runs the cover Skill from canvas references to prompt and image writeback", async () => {
    const root = await createRoot()
    const context = imageContext("cover-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction:
          "为独立设计师春季新品制作小红书封面，主标题：春日新章",
        executionMode: "auto",
        skillId: "builtin-cover-design",
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-cover-e2e", eventId: "event-cover", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe("封面设计：春日新章")
    expect(imageInputs).toHaveLength(1)
    expect(imageInputs[0]).toMatchObject({
      sourceImageSrc: "https://example.test/cover-context-source.png",
      referenceImageSrcs: [
        "https://example.test/cover-context-reference.png",
      ],
      width: 768,
      height: 1024,
    })
    expect(imageInputs[0].prompt).toContain("作为图 1")
    expect(imageInputs[0].prompt).toContain("作为图 2 起的辅助素材")
    expect(videoInputs).toHaveLength(0)

    const promptBatch = await capturePromptBatch(writing)
    expect(promptBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "create-prompt-node",
        title: "专业提示词",
      })
    )
    const resultBatch = buildAgentCanvasCommandBatch({
      task: writing,
      sourceBounds: context.sourceNode!.bounds,
      viewportBounds: { x: 0, y: 0, w: 1920, h: 1080 },
    })
    expect(resultBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "connect-nodes",
        sourceNodeId: context.selectedNodeId,
      })
    )
  })

  it("runs four-view generation from only the current selected image", async () => {
    const root = await createRoot()
    const context = imageContext("four-view-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction: "把当前产品图生成可用于后续建模的四视角参考图",
        executionMode: "auto",
        skillId: "builtin-image-to-3d",
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-four-view-e2e", eventId: "event-four-view", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.outputs).toHaveLength(4)
    expect(imageInputs).toHaveLength(4)
    for (const input of imageInputs) {
      expect(input.sourceImageSrc).toBe(
        "https://example.test/four-view-context-source.png"
      )
      expect(input.referenceImageSrcs).toEqual([])
    }
    expect(videoInputs).toHaveLength(0)

    const promptBatch = await capturePromptBatch(writing)
    expect(promptBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "create-prompt-node",
        title: "图片转 3D 规格",
      })
    )
    const resultBatch = buildAgentCanvasCommandBatch({
      task: writing,
      sourceBounds: context.sourceNode!.bounds,
      viewportBounds: { x: 0, y: 0, w: 1920, h: 1080 },
    })
    expect(
      resultBatch.commands.filter(({ type }) => type === "create-image-node")
    ).toHaveLength(4)
    expect(
      resultBatch.commands.some(
        ({ type }) =>
          type === "create-video-node" || type === "create-3d-model-node"
      )
    ).toBe(false)
  })

  it("runs the world Skill with paired scene images, videos and canvas links", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction:
          "为东方茶饮品牌制作青绿与朱砂配色的微缩山水世界，使用平视漫游运镜，16:9",
        executionMode: "auto",
        requestedOutputCount: 3,
        skillId: "builtin-world",
      },
      { id: "task-world-e2e", eventId: "event-world", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.outputs).toHaveLength(6)
    expect(writing.compiledPrompt?.sharedConstraints).toContain(
      "本次执行共调用 3 次图片生成和 3 次视频生成；确认即代表同意消耗对应模型额度"
    )
    expect(imageInputs).toHaveLength(3)
    expect(videoInputs).toHaveLength(3)
    expect(videoInputs.map(({ sourceImageSrc }) => sourceImageSrc)).toEqual([
      "https://example.test/generated-1.png",
      "https://example.test/generated-2.png",
      "https://example.test/generated-3.png",
    ])

    const promptBatch = await capturePromptBatch(writing)
    expect(promptBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "create-prompt-node",
        title: "专业提示词",
      })
    )
    const resultBatch = buildAgentCanvasCommandBatch({
      task: writing,
      viewportBounds: { x: 0, y: 0, w: 1920, h: 1080 },
    })
    const generatedLinks = resultBatch.commands.filter(
      (command) =>
        command.type === "connect-nodes" && Boolean(command.sourceNodeRef)
    )
    expect(generatedLinks).toHaveLength(3)
    expect(generatedLinks).toEqual([
      expect.objectContaining({ sourceNodeRef: expect.stringContaining("artifact-image") }),
      expect.objectContaining({ sourceNodeRef: expect.stringContaining("artifact-image") }),
      expect.objectContaining({ sourceNodeRef: expect.stringContaining("artifact-image") }),
    ])
  })
})
