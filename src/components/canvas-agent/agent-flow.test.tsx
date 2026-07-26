import { describe, expect, it } from "vitest"

import { buildCanvasContextSnapshot } from "../../lib/canvas-agent/context/build-context"
import { createAgentPlan } from "../../lib/canvas-agent/planner/planner"
import { compileGenerationPrompt } from "../../lib/canvas-agent/prompts/compiler"
import { createAgentTask } from "../../lib/canvas-agent/task-machine"

import { selectForegroundTask } from "./agent-view-model"

describe("Canvas Agent product flows", () => {
  it("plans text-to-image without a selected canvas node", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-text-image",
      userInstruction: "生成一张极简运动鞋广告",
    })
    const plan = createAgentPlan({
      taskId: "task-text-image",
      compiledPrompt: compiled,
    })

    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
    })
    expect(plan.steps.some(({ tool }) => tool === "generate_image")).toBe(true)
  })

  it("plans selected-image edits from multiple canvas annotations", () => {
    const context = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: "source-image",
        nodes: [
          {
            id: "source-image",
            kind: "image",
            bounds: { x: 100, y: 100, w: 600, h: 800 },
            media: {
              mediaType: "image",
              src: "https://example.test/source.png",
              width: 600,
              height: 800,
            },
            referenceIds: [],
          },
          {
            id: "annotation-title",
            kind: "annotation",
            sourceNodeId: "source-image",
            text: "标题换成绿色",
            bounds: { x: 140, y: 140, w: 220, h: 80 },
            referenceIds: [],
          },
          {
            id: "annotation-product",
            kind: "annotation",
            sourceNodeId: "source-image",
            text: "产品放大 10%",
            bounds: { x: 260, y: 360, w: 260, h: 300 },
            referenceIds: [],
          },
        ],
      },
      {
        snapshotId: "context-edit-flow",
        createdAt: "2026-07-26T11:00:00.000Z",
      }
    )
    const compiled = compileGenerationPrompt({
      taskId: "task-edit-flow",
      userInstruction: "按画布标注修改",
      context,
    })

    expect(compiled.outputs[0]).toMatchObject({
      operation: "edit",
      width: 600,
      height: 800,
      regionalEdits: [{ annotationId: "annotation-title" }, { annotationId: "annotation-product" }],
    })
  })

  it("caps and plans multi-image output as separate generation steps", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-four-images",
      userInstruction: "生成 4 张国风茶饮海报，3:4",
    })
    const plan = createAgentPlan({
      taskId: "task-four-images",
      compiledPrompt: compiled,
    })

    expect(compiled.outputs).toHaveLength(4)
    expect(plan.steps.filter(({ tool }) => tool === "generate_image")).toHaveLength(4)
    expect(plan.maxGeneratedNodes).toBe(4)
  })

  it("plans image-to-video from the selected source image", () => {
    const context = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: "source-image",
        nodes: [
          {
            id: "source-image",
            kind: "image",
            bounds: { x: 0, y: 0, w: 1280, h: 720 },
            media: {
              mediaType: "image",
              src: "https://example.test/source.png",
              width: 1280,
              height: 720,
            },
            referenceIds: [],
          },
        ],
      },
      {
        snapshotId: "context-video-flow",
        createdAt: "2026-07-26T11:00:00.000Z",
      }
    )
    const compiled = compileGenerationPrompt({
      taskId: "task-video-flow",
      userInstruction: "让画面动起来，生成 8 秒视频",
      context,
    })
    const plan = createAgentPlan({
      taskId: "task-video-flow",
      compiledPrompt: compiled,
      contextSnapshotId: context.id,
    })

    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "video",
      operation: "animate",
      durationSeconds: 8,
      sourceContextSnapshotId: context.id,
    })
    expect(plan.steps.some(({ tool }) => tool === "generate_video")).toBe(true)
  })

  it("restores the oldest unfinished task as the foreground task", () => {
    const older = createAgentTask(
      { userInstruction: "先执行" },
      { id: "task-older", now: "2026-07-26T10:00:00.000Z" }
    )
    const newer = createAgentTask(
      { userInstruction: "后执行" },
      { id: "task-newer", now: "2026-07-26T10:01:00.000Z" }
    )

    expect(selectForegroundTask([newer, older])?.id).toBe("task-older")
  })
})
