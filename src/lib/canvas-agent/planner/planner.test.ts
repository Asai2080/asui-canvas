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

  it("plans a dedicated procedural model step for image-to-3D", () => {
    const compiled: CompiledPrompt = {
      originalGoal: "把产品图转成 3D 预览",
      summary: "图片转 3D：程序化可交互模型",
      sharedConstraints: [],
      outputs: [
        {
          id: "output-model",
          mediaType: "model3d",
          operation: "reconstruct",
          prompt: "重建程序化模型",
          variantKey: "procedural-three-model",
          sourceContextSnapshotId: "context-3d",
        },
      ],
    }

    const plan = createAgentPlan({
      taskId: "task-image-to-3d",
      compiledPrompt: compiled,
      contextSnapshotId: "context-3d",
    })
    expect(plan.steps.find((step) => step.id === "generate-1")).toMatchObject({
      tool: "generate_3d_model",
      dependsOn: ["compile-prompt"],
      input: {
        contextSnapshotId: "context-3d",
        prompt: "重建程序化模型",
      },
    })
  })

  it("feeds every world scene image into its matching camera video", () => {
    const compiled: CompiledPrompt = {
      originalGoal: "创建三段连续世界",
      summary: "世界 Skill：3 个连续场景",
      sharedConstraints: [],
      outputs: Array.from({ length: 3 }).flatMap((_, index) => {
        const number = String(index + 1).padStart(2, "0")
        return [
          {
            id: `output-image-${number}`,
            mediaType: "image" as const,
            operation: "create" as const,
            prompt: `场景 ${number}`,
            width: 1024,
            height: 576,
            variantKey: `world-scene-${number}-image`,
          },
          {
            id: `output-video-${number}`,
            mediaType: "video" as const,
            operation: "animate" as const,
            prompt: `运镜 ${number}`,
            durationSeconds: 5,
            resolution: "720p",
            variantKey: `world-scene-${number}-video`,
          },
        ]
      }),
    }

    const plan = createAgentPlan({
      taskId: "task-world",
      compiledPrompt: compiled,
    })

    expect(plan.steps.find((step) => step.id === "generate-2")).toMatchObject({
      dependsOn: ["generate-1"],
      input: { sourceStepId: "generate-1" },
    })
    expect(plan.steps.find((step) => step.id === "generate-4")).toMatchObject({
      dependsOn: ["generate-3"],
      input: { sourceStepId: "generate-3" },
    })
    expect(plan.steps.find((step) => step.id === "generate-6")).toMatchObject({
      dependsOn: ["generate-5"],
      input: { sourceStepId: "generate-5" },
    })
  })

  it("feeds each hand-drawn scene image into its matching reveal video", () => {
    const compiled: CompiledPrompt = {
      originalGoal: "三个手绘故事段落",
      summary: "手绘故事视频：3 个叙事段落",
      sharedConstraints: [],
      outputs: Array.from({ length: 3 }).flatMap((_, index) => {
        const number = String(index + 1).padStart(2, "0")
        return [
          {
            id: `handdrawn-image-${number}`,
            mediaType: "image" as const,
            operation: "create" as const,
            prompt: `手绘画面 ${number}`,
            width: 720,
            height: 960,
            variantKey: `handdrawn-scene-${number}-image`,
          },
          {
            id: `handdrawn-video-${number}`,
            mediaType: "video" as const,
            operation: "animate" as const,
            prompt: `绘制过程 ${number}`,
            durationSeconds: 5,
            resolution: "720p",
            variantKey: `handdrawn-scene-${number}-video`,
          },
        ]
      }),
    }

    const plan = createAgentPlan({ taskId: "task-handdrawn", compiledPrompt: compiled })
    expect(plan.steps.find((step) => step.id === "generate-2")).toMatchObject({
      dependsOn: ["generate-1"],
      input: { sourceStepId: "generate-1" },
    })
    expect(plan.steps.find((step) => step.id === "generate-6")).toMatchObject({
      dependsOn: ["generate-5"],
      input: { sourceStepId: "generate-5" },
    })
  })

  it("feeds each poem scene image into its matching motion segment", () => {
    const compiled: CompiledPrompt = {
      originalGoal: "两段古诗词场景",
      summary: "古诗词丝绸视频：2 个场景",
      sharedConstraints: [],
      outputs: [1, 2].flatMap((scene) => {
        const number = String(scene).padStart(2, "0")
        return [
          {
            id: `poem-image-${number}`,
            mediaType: "image" as const,
            operation: "create" as const,
            prompt: `诗词场景 ${number}`,
            width: 1080,
            height: 1920,
            variantKey: `poem-scene-${number}-image`,
          },
          {
            id: `poem-video-${number}`,
            mediaType: "video" as const,
            operation: "animate" as const,
            prompt: `诗词运镜 ${number}`,
            durationSeconds: 5,
            resolution: "1080p",
            variantKey: `poem-scene-${number}-video`,
          },
        ]
      }),
    }

    const plan = createAgentPlan({ taskId: "task-poem", compiledPrompt: compiled })
    expect(plan.steps.find((step) => step.id === "generate-2")).toMatchObject({
      dependsOn: ["generate-1"],
      input: { sourceStepId: "generate-1" },
    })
    expect(plan.steps.find((step) => step.id === "generate-4")).toMatchObject({
      dependsOn: ["generate-3"],
      input: { sourceStepId: "generate-3" },
    })
    expect(plan.steps.find((step) => step.id === "generate-1")?.input).toMatchObject({
      referencePolicy: "none",
    })
  })

  it("uses only the selected logo reference for brand sticker photos", () => {
    const compiled = imagePrompt(1)
    compiled.outputs[0].variantKey = "brand-sticker-photo"
    compiled.outputs[0].sourceContextSnapshotId = "context-logo"
    const plan = createAgentPlan({
      taskId: "task-brand-sticker",
      compiledPrompt: compiled,
      contextSnapshotId: "context-logo",
    })
    expect(plan.steps.find((step) => step.id === "generate-1")?.input).toMatchObject({
      contextSnapshotId: "context-logo",
      referencePolicy: "source-only",
    })
  })

  it("isolates four-view generation from unrelated selected references", () => {
    const compiled = imagePrompt(1)
    compiled.outputs[0].variantKey = "three-front-three-quarter"
    compiled.outputs[0].sourceContextSnapshotId = "context-source"

    const plan = createAgentPlan({
      taskId: "task-four-view-reference-policy",
      compiledPrompt: compiled,
      contextSnapshotId: "context-source",
    })

    expect(plan.steps.find((step) => step.id === "generate-1")?.input).toMatchObject({
      referencePolicy: "source-only",
    })
  })

  it("isolates Ian article generation and only references the source for edits", () => {
    const article = imagePrompt(1)
    article.outputs[0].variantKey = "ian-xiaohei-article-01"
    article.outputs[0].sourceContextSnapshotId = "context-text"
    const articlePlan = createAgentPlan({
      taskId: "task-ian-article",
      compiledPrompt: article,
      contextSnapshotId: "context-text",
    })
    expect(
      articlePlan.steps.find((step) => step.id === "generate-1")?.input
    ).toMatchObject({ referencePolicy: "none" })

    const edit = imagePrompt(1)
    edit.outputs[0].variantKey = "ian-xiaohei-edit-01"
    edit.outputs[0].sourceContextSnapshotId = "context-image"
    const editPlan = createAgentPlan({
      taskId: "task-ian-edit",
      compiledPrompt: edit,
      contextSnapshotId: "context-image",
    })
    expect(
      editPlan.steps.find((step) => step.id === "generate-1")?.input
    ).toMatchObject({ referencePolicy: "source-only" })
  })
})
