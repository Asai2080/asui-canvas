import { describe, expect, it } from "vitest"

import type { CompiledPrompt } from "../task-schema"
import { createAgentPlan, validateAgentPlan } from "./planner"

function imagePrompt(count: number): CompiledPrompt {
  return {
    originalGoal: `生成 ${count} 张图片`,
    summary: `${count} 张图片`,
    sharedConstraints: [],
    outputs: Array.from({ length: count }, (_, index) => ({
      id: `output-${index + 1}`,
      mediaType: "image" as const,
      operation: "create" as const,
      prompt: `图片版本 ${index + 1}`,
      width: 768,
      height: 1024,
      variantKey: `variant-${index + 1}`,
    })),
  }
}

describe("createAgentPlan", () => {
  it("creates one bounded generation step per image and a canvas writeback", () => {
    const plan = createAgentPlan({
      taskId: "task-images",
      compiledPrompt: imagePrompt(4),
      contextSnapshotId: "context-images",
    })

    expect(plan.version).toBe(1)
    expect(plan.maxGeneratedNodes).toBe(4)
    expect(plan.steps.filter((step) => step.tool === "generate_image")).toHaveLength(
      4
    )
    expect(plan.steps.at(-1)?.tool).toBe("connect_canvas_nodes")
    expect(() => validateAgentPlan(plan)).not.toThrow()
  })

  it("uses edit_image when the compiled output is a regional edit", () => {
    const compiled = imagePrompt(1)
    compiled.outputs[0].operation = "edit"
    compiled.outputs[0].sourceContextSnapshotId = "context-edit"
    compiled.outputs[0].regionalEdits = [
      {
        annotationId: "annotation-1",
        instruction: "标题改为阿水 AI",
        region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
      },
    ]

    const plan = createAgentPlan({
      taskId: "task-edit",
      compiledPrompt: compiled,
      contextSnapshotId: "context-edit",
    })

    expect(plan.steps.some((step) => step.tool === "edit_image")).toBe(true)
    expect(plan.steps.some((step) => step.tool === "generate_image")).toBe(false)
  })

  it("rejects requests above the P0 image and video limits", () => {
    expect(() =>
      createAgentPlan({
        taskId: "task-too-many",
        compiledPrompt: imagePrompt(13),
      })
    ).toThrow("图片数量最多为 12 张")

    const video: CompiledPrompt = {
      originalGoal: "生成 16 秒视频",
      summary: "一条视频",
      sharedConstraints: [],
      outputs: [
        {
          id: "output-video",
          mediaType: "video",
          operation: "animate",
          prompt: "镜头缓慢推进",
          durationSeconds: 16,
          resolution: "1080p",
        },
      ],
    }

    expect(() =>
      createAgentPlan({
        taskId: "task-video-too-long",
        compiledPrompt: video,
      })
    ).toThrow("视频时长最多为 15 秒")
  })

  it("rejects unknown tools, cycles, and unauthorized tool input", () => {
    const base = createAgentPlan({
      taskId: "task-validate",
      compiledPrompt: imagePrompt(1),
    })

    expect(() =>
      validateAgentPlan({
        ...base,
        steps: [
          {
            ...base.steps[0],
            tool: "run_shell",
          },
        ],
      })
    ).toThrow(/未注册工具/)

    expect(() =>
      validateAgentPlan({
        ...base,
        steps: [
          { ...base.steps[0], dependsOn: [base.steps[1].id] },
          { ...base.steps[1], dependsOn: [base.steps[0].id] },
          ...base.steps.slice(2),
        ],
      })
    ).toThrow(/循环依赖/)

    expect(() =>
      validateAgentPlan({
        ...base,
        steps: [
          {
            ...base.steps[0],
            tool: "read_canvas_context",
            input: {
              snapshotId: "context-1",
              path: "/Users/example/secret",
            },
          },
          ...base.steps.slice(1),
        ],
      })
    ).toThrow()
  })
})
