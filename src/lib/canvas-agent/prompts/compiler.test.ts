import { describe, expect, it } from "vitest"

import type { CanvasContextSnapshot } from "../context/schema"
import type { SkillSnapshot } from "../skills/schema"
import { compileGenerationPrompt } from "./compiler"

const createdAt = "2026-07-25T02:00:00.000Z"

describe("compileGenerationPrompt", () => {
  it("expands an image count and aspect ratio into differentiated outputs", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-tea",
      userInstruction: "生成 4 张国风茶饮海报，比例 3:4",
    })

    expect(compiled.originalGoal).toBe("生成 4 张国风茶饮海报，比例 3:4")
    expect(compiled.outputs).toHaveLength(4)
    expect(compiled.outputs.map((output) => output.variantKey)).toEqual([
      "variant-1",
      "variant-2",
      "variant-3",
      "variant-4",
    ])
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      width: 768,
      height: 1024,
    })
    expect(new Set(compiled.outputs.map((output) => output.prompt)).size).toBe(4)
  })

  it("compiles every owned annotation into a regional image edit", () => {
    const context: CanvasContextSnapshot = {
      id: "context-poster",
      createdAt,
      scope: "selection",
      selectedNodeId: "poster",
      sourceNode: {
        id: "poster",
        kind: "image",
        bounds: { x: 10, y: 20, w: 480, h: 270 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.com/poster.png",
          width: 480,
          height: 270,
        },
      },
      annotations: [
        {
          id: "annotation-title",
          sourceNodeId: "poster",
          text: "标题改为阿水 AI",
          bounds: { x: 24, y: 28, w: 120, h: 54 },
          normalizedBounds: { x: 0.05, y: 0.03, w: 0.25, h: 0.2 },
        },
        {
          id: "annotation-rocket",
          sourceNodeId: "poster",
          text: "火箭改为红色",
          bounds: { x: 180, y: 42, w: 96, h: 180 },
          normalizedBounds: { x: 0.35, y: 0.08, w: 0.2, h: 0.67 },
        },
      ],
      connectedNodes: [],
      references: [],
    }

    const skill: SkillSnapshot = {
      id: "skill-snapshot-poster",
      skillId: "poster-skill",
      name: "海报局部修改",
      description: "保持海报布局的局部编辑规则",
      contentHash: "a".repeat(64),
      instructions: "保持品牌字体层级，不重排其他内容。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-poster",
      userInstruction: "按画布标注修改这张海报",
      context,
      skill,
    })

    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "edit",
      width: 480,
      height: 270,
    })
    expect(compiled.outputs[0].regionalEdits).toHaveLength(2)
    expect(compiled.outputs[0].prompt).toContain("源图片尺寸 480 × 270")
    expect(compiled.outputs[0].prompt).toContain("保持所有未标注区域不变")
    expect(compiled.outputs[0].prompt).toContain("标题改为阿水 AI")
    expect(compiled.outputs[0].prompt).toContain("火箭改为红色")
    expect(compiled.outputs[0].prompt).toContain("保持品牌字体层级")
  })

  it("uses annotations on an empty holder as creation instructions", () => {
    const context: CanvasContextSnapshot = {
      id: "context-empty",
      createdAt,
      scope: "selection",
      selectedNodeId: "holder",
      sourceNode: {
        id: "holder",
        kind: "holder",
        bounds: { x: 0, y: 0, w: 750, h: 1624 },
        referenceIds: [],
      },
      annotations: [
        {
          id: "annotation-create",
          sourceNodeId: "holder",
          text: "生成一张未来城市电影海报",
          bounds: { x: 20, y: 40, w: 300, h: 80 },
          normalizedBounds: { x: 0.03, y: 0.02, w: 0.4, h: 0.05 },
        },
      ],
      connectedNodes: [],
      references: [],
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-empty",
      userInstruction: "按画布里的要求生成",
      context,
    })

    expect(compiled.outputs[0].operation).toBe("create")
    expect(compiled.outputs[0].prompt).toContain("生成一张未来城市电影海报")
    expect(compiled.outputs[0]).toMatchObject({ width: 750, height: 1624 })
  })
})
