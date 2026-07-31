import { describe, expect, it } from "vitest"

import type { CanvasContextSnapshot } from "../context/schema"
import type { SkillSnapshot } from "./schema"
import { resolveBuiltinSkillIntake } from "./intake"

function skill(name: string): SkillSnapshot {
  return {
    id: `snapshot-${name}`,
    skillId: `skill-${name}`,
    name,
    description: `${name} description`,
    instructions: `${name} instructions`,
    contentHash: "a".repeat(64),
    createdAt: "2026-07-31T00:00:00.000Z",
  }
}

function imageContext(): CanvasContextSnapshot {
  return {
    id: "context-image",
    createdAt: "2026-07-31T00:00:00.000Z",
    scope: "selection",
    selectedNodeId: "image-one",
    sourceNode: {
      id: "image-one",
      kind: "image",
      bounds: { x: 0, y: 0, w: 640, h: 480 },
      media: {
        referenceType: "url",
        mediaType: "image",
        src: "https://example.test/reference.png",
        width: 640,
        height: 480,
      },
      referenceIds: [],
    },
    annotations: [],
    connectedNodes: [],
    references: [],
  }
}

describe("resolveBuiltinSkillIntake", () => {
  it("asks for both the cover topic and title when the invocation is generic", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "用这个 Skill 帮我生成封面",
      skill: skill("封面 Skill"),
    })

    expect(intake.clarification).toMatchObject({
      intent: "conversation",
      summary: "封面信息待补充",
    })
    expect(intake.clarification?.message).toContain("主题或核心内容")
    expect(intake.clarification?.message).toContain("主标题")
  })

  it("uses recent same-Skill answers to complete the cover intake", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "主题是独立设计师的春季新品",
      skill: skill("封面 Skill"),
      conversationHistory: [
        { role: "user", content: "用这个 Skill 帮我生成封面" },
        { role: "assistant", content: "请告诉我主题和主标题。" },
        { role: "user", content: "主标题：春日新章" },
      ],
    })

    expect(intake.clarification).toBeUndefined()
    expect(intake.resolvedInstruction).toContain("主标题：春日新章")
    expect(intake.resolvedInstruction).toContain("独立设计师的春季新品")
  })

  it("stops the four-view workflow before planning when no usable image is selected", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "使用这个 Skill 生成四视角",
      skill: skill("图片转 3D Skill"),
    })

    expect(intake.clarification).toMatchObject({
      intent: "conversation",
      summary: "四视角输入待选择",
    })
    expect(intake.clarification?.message).toContain("先在画布中选中")
  })

  it("accepts the currently selected URL image as the only four-view source", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "使用这个 Skill 生成四视角",
      skill: skill("图片转 3D Skill"),
      context: imageContext(),
    })

    expect(intake.clarification).toBeUndefined()
  })

  it("asks for a world theme and camera mode before creating expensive outputs", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "用世界 Skill 帮我生成",
      skill: skill("世界 Skill"),
    })

    expect(intake.clarification).toMatchObject({
      intent: "conversation",
      summary: "世界规划信息待补充",
    })
    expect(intake.clarification?.message).toContain("世界主题")
    expect(intake.clarification?.message).toContain("飞行穿梭")
    expect(intake.clarification?.message).toContain("固定视角")
  })

  it("accepts a concrete world theme and camera mode", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "为春季茶饮品牌制作一个花园微缩世界，使用平视漫游运镜，暖绿色和樱花粉配色",
      skill: skill("世界 Skill"),
    })

    expect(intake.clarification).toBeUndefined()
  })
})
