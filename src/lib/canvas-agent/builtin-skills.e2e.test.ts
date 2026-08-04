import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  AgentImageArtifact,
  AgentImageGenerationInput,
} from "./adapters/image-generation"
import type { AgentVideoGenerationInput } from "./adapters/video-generation"
import { buildAgentCanvasCommandBatch } from "./canvas-commands/layout"
import { writeAgentPromptToCanvas } from "./canvas-commands/prompt-writeback"
import { writeAgentTaskToCanvas } from "./canvas-commands/writeback"
import type {
  AgentCanvasCommandBatch,
  AgentCanvasCommandAcknowledgement,
} from "./canvas-commands/schema"
import type { CanvasContextSnapshot } from "./context/schema"
import { createStoredCanvasContextSnapshot } from "./context/store"
import { runAgentTaskTick, type RunAgentTaskDependencies } from "./orchestrator"
import { registerLocalSkill } from "./skills/registry"
import { createAgentTask } from "./task-machine"
import type { AgentTask } from "./task-schema"
import { acknowledgeAgentCanvasWriteback } from "./task-operations"
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

function textContext(id: string): CanvasContextSnapshot {
  return {
    id,
    createdAt: now,
    scope: "selection",
    selectedNodeId: `${id}-text`,
    sourceNode: {
      id: `${id}-text`,
      kind: "other",
      bounds: { x: 100, y: 100, w: 440, h: 720 },
      text: "团队把自动化当成终点，但模糊输入不断进入流水线，错误会在每一步被放大。真正有效的做法是先缩短反馈回路，让每一步都能被验证。",
      referenceIds: [],
    },
    annotations: [],
    connectedNodes: [],
    references: [],
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
  const transparentImageArtifacts: AgentImageArtifact[] = []
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
    transparentImageProcessor: vi.fn(async (artifact) => {
      transparentImageArtifacts.push(artifact)
      return {
        ...artifact,
        versionId: `transparent-${artifact.versionId}`,
        parentVersionId: artifact.versionId,
        src: artifact.src.replace(/\.png$/, "-transparent.png"),
      }
    }),
  }
  return {
    dependencies,
    imageInputs,
    videoInputs,
    transparentImageArtifacts,
  }
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

async function applyResultBatch(task: AgentTask, root: string) {
  let captured: AgentCanvasCommandBatch | undefined
  const completed = await writeAgentTaskToCanvas(
    {
      task,
      sourceBounds: { x: 100, y: 100, w: 768, h: 1024 },
      viewportBounds: { x: 0, y: 0, w: 1920, h: 1080 },
    },
    {
      publish: async (batch) => {
        captured = batch
        const created = batch.commands.filter(
          (
            command
          ): command is Extract<
            (typeof batch.commands)[number],
            { nodeRef: string }
          > =>
            [
              "create-image-node",
              "create-video-node",
              "create-3d-preview-node",
              "create-3d-model-node",
            ].includes(command.type)
        )
        return {
          batchId: batch.id,
          taskId: batch.taskId,
          status: "applied",
          resultNodeIds: created.map(
            (command) => `shape-${command.nodeRef}`
          ),
          artifactNodeIds: Object.fromEntries(
            created.flatMap((command) =>
              "artifact" in command
                ? [[command.artifact.id, `shape-${command.nodeRef}`]]
                : []
            )
          ),
          errors: [],
        }
      },
      fetcher: async (_input, init) => {
        const acknowledgement = JSON.parse(
          String(init?.body ?? "{}")
        ) as AgentCanvasCommandAcknowledgement
        const updated = await acknowledgeAgentCanvasWriteback(
          task.id,
          acknowledgement,
          {
            root,
            now: () => now,
            createId: () => `event-writeback-${task.id}`,
          }
        )
        return new Response(JSON.stringify({ task: updated }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      },
    }
  )
  if (!captured) throw new Error("结果画布命令未生成")
  return { batch: captured, completed }
}

describe("built-in Skill end-to-end contracts", () => {
  it("runs the cover Skill from canvas references to prompt and image writeback", async () => {
    const root = await createRoot()
    const context = imageContext("cover-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction:
          "为独立设计师春季新品制作小红书封面，主标题：春日新章。使用 10 正面对视风，当前选中的人物图作为图 1，连接的图片作为额外参考素材。人物表情 6，背景 4，字体 1，文字效果 4。",
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

  it("runs a registered local storyboard Skill from the selected image to four canvas results", async () => {
    const root = await createRoot()
    const skillDirectory = join(root, "local-skills", "nb-fj")
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      [
        "---",
        "name: nb-fj",
        "description: 电影级连续分镜生成 Skill。",
        "---",
        "# 分镜 Skill",
        "只读取当前选中的参考图，保持人物、场景、服装、道具、时间和光向连续。",
        "每个镜头生成独立 16:9 图片，不生成拼图、网格、标签或解释文字。",
      ].join("\n"),
      "utf8"
    )
    const registered = await registerLocalSkill(skillDirectory, root)
    const context = imageContext("storyboard-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction:
          "把当前参考图扩展成四个连续电影分镜，人物在厨房完成备菜、切配、下锅和装盘",
        executionMode: "auto",
        requestedOutputCount: 4,
        skillId: registered.id,
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-storyboard-e2e", eventId: "event-storyboard", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe("4 张连续电影分镜")
    expect(writing.compiledPrompt?.outputs).toHaveLength(4)
    expect(imageInputs).toHaveLength(4)
    expect(videoInputs).toHaveLength(0)
    expect(
      imageInputs.every(
        ({ sourceImageSrc, width, height }) =>
          sourceImageSrc ===
            "https://example.test/storyboard-context-source.png" &&
          width === 1024 &&
          height === 576
      )
    ).toBe(true)

    const promptBatch = await capturePromptBatch(writing)
    expect(
      promptBatch.commands.filter(({ type }) => type === "create-prompt-node")
    ).toHaveLength(4)
    const { batch, completed } = await applyResultBatch(writing, root)
    expect(
      batch.commands.filter(({ type }) => type === "create-image-node")
    ).toHaveLength(4)
    expect(batch.commands).toContainEqual(
      expect.objectContaining({
        type: "connect-nodes",
        sourceNodeId: context.selectedNodeId,
      })
    )
    expect(completed.status).toBe("completed")
    expect(completed.resultNodeIds).toHaveLength(4)
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

  it("runs social-card generation as independent platform-native canvases", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction:
          "为小红书制作 4 张关于独立开发者效率系统的卡片，使用 Swiss 视觉系统，素材使用当前图片模型生成原创配图",
        executionMode: "auto",
        requestedOutputCount: 4,
        skillId: "builtin-social-card",
      },
      { id: "task-social-card-e2e", eventId: "event-social-card", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe("小红书社交卡：4 张")
    expect(imageInputs).toHaveLength(4)
    expect(imageInputs.every(({ width, height }) => width === 1080 && height === 1440)).toBe(true)
    expect(imageInputs[0].prompt).toContain("Swiss")
    expect(videoInputs).toHaveLength(0)

    const promptBatch = await capturePromptBatch(writing)
    expect(promptBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "create-prompt-node",
        title: "社交卡编排方案",
      })
    )
    const { batch, completed } = await applyResultBatch(writing, root)
    expect(batch.commands.filter(({ type }) => type === "create-image-node")).toHaveLength(4)
    expect(completed.status).toBe("completed")
    expect(completed.resultNodeIds).toHaveLength(4)
  })

  it("runs portrait direction with the selected authorized reference", async () => {
    const root = await createRoot()
    const context = imageContext("portrait-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction:
          "为成年女性生成一组海边自然光杂志写真，松弛、清透，3 个版本",
        executionMode: "auto",
        requestedOutputCount: 3,
        skillId: "builtin-portrait",
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-portrait-e2e", eventId: "event-portrait", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe("人物写真：3 个导演版本")
    expect(imageInputs).toHaveLength(3)
    const sourceMedia = context.sourceNode?.media
    const sourceSrc =
      sourceMedia?.referenceType === "url" ? sourceMedia.src : undefined
    expect(
      imageInputs.every(({ sourceImageSrc }) => sourceImageSrc === sourceSrc)
    ).toBe(true)
    expect(imageInputs[0].prompt).toContain("人物调度")
    expect(videoInputs).toHaveLength(0)

    const promptBatch = await capturePromptBatch(writing)
    expect(promptBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "create-prompt-node",
        title: "人物写真导演方案",
      })
    )
    const { batch, completed } = await applyResultBatch(writing, root)
    expect(
      batch.commands.filter(({ type }) => type === "create-image-node")
    ).toHaveLength(3)
    expect(completed.status).toBe("completed")
    expect(completed.resultNodeIds).toHaveLength(3)
  })

  it("runs the 3D sticker Skill with the source image and bundled style references", async () => {
    const root = await createRoot()
    const context = imageContext("canvas-3d-sticker-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction:
          "把当前人物和手持道具转换为透明底 3D 卡通游戏贴纸",
        executionMode: "auto",
        requestedOutputCount: 4,
        skillId: "builtin-canvas-3d-sticker",
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-canvas-3d-sticker-e2e", eventId: "event-sticker", now }
    )
    await createStoredAgentTask(task, root)
    const {
      dependencies,
      imageInputs,
      videoInputs,
      transparentImageArtifacts,
    } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe(
      "画布 3D 贴纸风格转换：单体资产"
    )
    expect(writing.compiledPrompt?.outputs).toHaveLength(1)
    expect(imageInputs).toHaveLength(1)
    expect(imageInputs[0]).toMatchObject({
      sourceImageSrc:
        "https://example.test/canvas-3d-sticker-context-source.png",
      width: 2048,
      height: 2048,
      referenceImageSrcs: [
        "/builtin-skill-assets/canvas-3d-sticker-characters-chibi.png",
        "/builtin-skill-assets/canvas-3d-sticker-isometric-city.png",
        "/builtin-skill-assets/canvas-3d-sticker-characters-heroic.png",
      ],
    })
    expect(imageInputs[0].prompt).toContain("真实 RGBA 透明通道")
    expect(transparentImageArtifacts).toHaveLength(1)
    expect(videoInputs).toHaveLength(0)

    const promptBatch = await capturePromptBatch(writing)
    expect(promptBatch.commands).toContainEqual(
      expect.objectContaining({
        type: "create-prompt-node",
        title: "3D 贴纸转换规格",
      })
    )
    const { batch, completed } = await applyResultBatch(writing, root)
    expect(
      batch.commands.filter(({ type }) => type === "create-image-node")
    ).toHaveLength(1)
    expect(
      batch.commands.filter(({ type }) => type === "create-video-node")
    ).toHaveLength(0)
    expect(batch.commands).toContainEqual(
      expect.objectContaining({
        type: "connect-nodes",
        sourceNodeId: context.selectedNodeId,
      })
    )
    expect(completed.status).toBe("completed")
    expect(completed.resultNodeIds).toHaveLength(1)
  })

  it("runs Ian Xiaohei article illustrations without leaking selected image references", async () => {
    const root = await createRoot()
    const context = textContext("ian-text-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction: "为选中的文章生成 4 张独立配图",
        executionMode: "auto",
        requestedOutputCount: 4,
        skillId: "builtin-ian-xiaohei",
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-ian-xiaohei-e2e", eventId: "event-ian", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe(
      "Ian 小蓝滴配图：4 张正文插图"
    )
    expect(imageInputs).toHaveLength(4)
    expect(videoInputs).toHaveLength(0)
    expect(
      imageInputs.every(
        ({ sourceImageSrc, referenceImageSrcs, width, height }) =>
          sourceImageSrc === undefined &&
          (referenceImageSrcs?.length ?? 0) === 0 &&
          width === 1024 &&
          height === 576
      )
    ).toBe(true)
    expect(imageInputs[0].prompt).toContain("不要复述原句")
    expect(imageInputs[0].prompt).toContain("小蓝滴必须亲自执行")

    const promptBatch = await capturePromptBatch(writing)
    expect(
      promptBatch.commands.filter(({ type }) => type === "create-prompt-node")
    ).toHaveLength(4)
    expect(promptBatch.commands[0]).toMatchObject({
      title: "小蓝滴配图方案 1",
    })
    const { batch, completed } = await applyResultBatch(writing, root)
    expect(
      batch.commands.filter(({ type }) => type === "create-image-node")
    ).toHaveLength(4)
    expect(completed.status).toBe("completed")
    expect(completed.resultNodeIds).toHaveLength(4)
  })

  it("uses only the selected image for an explicit Ian Xiaohei revision", async () => {
    const root = await createRoot()
    const context = imageContext("ian-edit-context")
    await createStoredCanvasContextSnapshot(context, root)
    const task = createAgentTask(
      {
        userInstruction: "把这张配图左上角标题去掉，其他内容保持不变",
        executionMode: "auto",
        requestedOutputCount: 6,
        skillId: "builtin-ian-xiaohei",
        contextSnapshotId: context.id,
        selectedCanvasId: context.selectedNodeId,
      },
      { id: "task-ian-edit-e2e", eventId: "event-ian-edit", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe("Ian 小蓝滴配图：定向修改")
    expect(imageInputs).toHaveLength(1)
    expect(imageInputs[0]).toMatchObject({
      sourceImageSrc: "https://example.test/ian-edit-context-source.png",
      referenceImageSrcs: [],
      width: 1024,
      height: 576,
    })
    expect(videoInputs).toHaveLength(0)
  })

  it("runs hand-drawn story images through their matching configured video inputs", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction:
          "把一个女孩第一次独自搬家、整理房间并给家人报平安的故事做成 3 段手绘视频",
        executionMode: "auto",
        requestedOutputCount: 3,
        skillId: "builtin-handdrawn-video",
      },
      { id: "task-handdrawn-e2e", eventId: "event-handdrawn", now }
    )
    await createStoredAgentTask(task, root)
    const { dependencies, imageInputs, videoInputs } = createDependencies(root)

    const writing = await runUntilWritingCanvas(task.id, dependencies)

    expect(writing.compiledPrompt?.summary).toBe("手绘故事视频：3 个叙事段落")
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
        title: "手绘故事分镜",
      })
    )
    const { batch, completed } = await applyResultBatch(writing, root)
    expect(
      batch.commands.filter(
        (command) =>
          command.type === "connect-nodes" && Boolean(command.sourceNodeRef)
      )
    ).toHaveLength(3)
    expect(
      batch.commands.filter(({ type }) => type === "create-image-node")
    ).toHaveLength(3)
    expect(
      batch.commands.filter(({ type }) => type === "create-video-node")
    ).toHaveLength(3)
    expect(completed.status).toBe("completed")
    expect(completed.resultNodeIds).toHaveLength(6)
  })
})
