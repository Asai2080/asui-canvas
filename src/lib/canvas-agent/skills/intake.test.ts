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
    risks: [],
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

function textContext(): CanvasContextSnapshot {
  return {
    id: "context-text",
    createdAt: "2026-07-31T00:00:00.000Z",
    scope: "selection",
    selectedNodeId: "article-one",
    sourceNode: {
      id: "article-one",
      kind: "other",
      bounds: { x: 0, y: 0, w: 440, h: 720 },
      text: "很多团队把自动化当成终点，真正的瓶颈却是输入不清楚和反馈回路太长。",
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
    expect(intake.clarification?.message).toContain("第 1 轮 / 3")
    expect(intake.clarification?.message).not.toContain("10 正面对视风")
    expect(intake.clarification?.choiceGroups).toBeUndefined()
  })

  it("continues the original cover protocol after topic and title are known", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "主题是独立设计师的春季新品",
      skill: skill("封面 Skill"),
      conversationHistory: [
        { role: "user", content: "用这个 Skill 帮我生成封面" },
        { role: "assistant", content: "请告诉我主题和主标题。" },
        { role: "user", content: "主标题：春日新章" },
      ],
    })

    expect(intake.clarification).toMatchObject({
      intent: "conversation",
      summary: "封面风格待选择",
    })
    expect(intake.clarification?.message).toContain("第 1 轮 / 3")
    expect(intake.clarification?.message).toContain("候选标题")
    expect(intake.clarification?.message).toContain("1. 春日新章")
    expect(intake.resolvedInstruction).toContain("主标题：春日新章")
    expect(intake.resolvedInstruction).toContain("独立设计师的春季新品")
    expect(intake.clarification?.choiceGroups?.map((group) => group.id)).toEqual([
      "cover-style",
      "cover-title",
    ])
    expect(
      intake.clarification?.choiceGroups?.find(
        (group) => group.id === "cover-title"
      )?.options
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "春日新章",
          value: "主标题：春日新章",
        }),
      ])
    )
  })

  it("uses a concise cover request as both the topic and main title before asking for style", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "看向窗外",
      skill: skill("封面 Skill"),
      context: imageContext(),
    })

    expect(intake.clarification).toMatchObject({
      summary: "封面风格待选择",
    })
    expect(intake.resolvedInstruction).toContain("主标题：看向窗外")
  })

  it("does not repeat the title question after a concise topic reply", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "主题：看向窗外",
      skill: skill("封面 Skill"),
      context: imageContext(),
      conversationHistory: [
        { role: "user", content: "看向窗外" },
        {
          role: "assistant",
          content: "请再告诉我要放在画面上的主标题。",
        },
      ],
    })

    expect(intake.clarification).toMatchObject({
      summary: "封面风格待选择",
    })
    expect(intake.resolvedInstruction).toContain("主标题：看向窗外")
  })

  it("accepts a labeled cover topic as the title and keeps supplied small copy", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "封面主题：什么是 Skill 小子：大白话讲解，带你实操",
      skill: skill("封面 Skill"),
      context: imageContext(),
    })

    expect(intake.clarification).toMatchObject({
      summary: "封面风格待选择",
    })
    expect(intake.resolvedInstruction).toContain("主标题：什么是 Skill")
    expect(intake.resolvedInstruction).toContain("小子：大白话讲解，带你实操")
  })

  it("accepts Skill as literal cover-title content instead of treating it as an invocation", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "什么是 Skill",
      skill: skill("封面 Skill"),
      context: imageContext(),
      conversationHistory: [
        { role: "user", content: "用封面 Skill 帮我生成封面" },
        { role: "assistant", content: "请告诉我主题和主标题。" },
      ],
    })

    expect(intake.clarification).toMatchObject({
      summary: "封面风格待选择",
    })
    expect(intake.resolvedInstruction).toContain("主标题：什么是 Skill")
  })

  it("runs all three original cover rounds and stops after the visual choices", () => {
    const baseHistory = [
      {
        role: "user" as const,
        content:
          "封面主题：什么是 Skill\n主标题：什么是 Skill\n副标题：大白话讲解带你实操",
      },
      {
        role: "assistant" as const,
        content:
          "【封面 Skill · 第 1 轮 / 3】请选择构图风格和主标题。",
      },
      {
        role: "user" as const,
        content: "10 正面对视风，主标题保持‘什么是 Skill’",
      },
    ]
    const references = resolveBuiltinSkillIntake({
      userInstruction: "使用当前选中的人物图，没有其他参考素材",
      skill: skill("封面 Skill"),
      context: imageContext(),
      conversationHistory: baseHistory,
    })

    expect(references.clarification).toMatchObject({
      summary: "封面视觉细节待选择",
    })
    expect(references.clarification?.message).toContain("第 3 轮 / 3")
    expect(references.clarification?.message).toContain("人物表情")
    expect(references.clarification?.message).toContain("字体")
    expect(references.clarification?.message).toContain("文字效果")

    const complete = resolveBuiltinSkillIntake({
      userInstruction: "6 / 4 / 1 / 4",
      skill: skill("封面 Skill"),
      context: imageContext(),
      conversationHistory: [
        ...baseHistory,
        { role: "assistant" as const, content: references.clarification!.message },
        { role: "user" as const, content: "使用当前选中的人物图，没有其他参考素材" },
      ],
      generationCapabilities: { image: true, video: false },
    })

    expect(complete.clarification).toBeUndefined()
    expect(complete.resolvedInstruction).toContain("构图风格：10 正面对视风")
    expect(complete.resolvedInstruction).toContain("人物表情：6")
    expect(complete.resolvedInstruction).toContain("背景：4")
    expect(complete.resolvedInstruction).toContain("字体：1")
    expect(complete.resolvedInstruction).toContain("文字效果：4")
  })

  it("keeps the cover style when the choice UI joins style and title with a slash", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "无人物，没有其他素材",
      skill: skill("封面 Skill"),
      conversationHistory: [
        {
          role: "user",
          content: "封面主题：什么是 Skill\n主标题：大白话讲解带你实操",
        },
        {
          role: "assistant",
          content: "【封面 Skill · 第 1 轮 / 3】请选择构图风格和主标题。",
        },
        {
          role: "user",
          content: "10 / 主标题：大白话讲解带你实操",
        },
        {
          role: "assistant",
          content: "【封面 Skill · 第 2 轮 / 3】请确认参考素材。",
        },
      ],
      generationCapabilities: { image: true, video: true },
    })

    expect(intake.clarification?.message).toContain("第 3 轮 / 3")
    expect(intake.clarification?.choiceGroups?.map((group) => group.id)).toEqual([
      "cover-expression",
      "cover-background",
      "cover-font",
      "cover-text-effect",
    ])
  })

  it("recovers all cover rounds from persisted user answers when assistant markers are missing", () => {
    const referenceReply = resolveBuiltinSkillIntake({
      userInstruction: "无人物，没有其他素材",
      skill: skill("封面 Skill"),
      conversationHistory: [
        { role: "user", content: "做一个介绍 Skill 的封面" },
        {
          role: "user",
          content: "10 主标题：Skill 从知道到会用",
        },
      ],
    })

    expect(referenceReply.clarification).toMatchObject({
      summary: "封面视觉细节待选择",
    })
    expect(referenceReply.clarification?.message).toContain("第 3 轮 / 3")
    expect(referenceReply.resolvedInstruction).toContain(
      "构图风格：10 正面对视风"
    )

    const visualReply = resolveBuiltinSkillIntake({
      userInstruction: "6 / 4 / 1 / 4",
      skill: skill("封面 Skill"),
      conversationHistory: [
        { role: "user", content: "做一个介绍 Skill 的封面" },
        {
          role: "user",
          content: "10 主标题：Skill 从知道到会用",
        },
        { role: "user", content: "无人物，没有其他素材" },
      ],
      generationCapabilities: { image: true, video: false },
    })

    expect(visualReply.clarification).toBeUndefined()
    expect(visualReply.resolvedInstruction).toContain("人物表情：6")
    expect(visualReply.resolvedInstruction).toContain("背景：4")
    expect(visualReply.resolvedInstruction).toContain("字体：1")
    expect(visualReply.resolvedInstruction).toContain("文字效果：4")
  })

  it("accepts the cover recommendation without inventing another round", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "按推荐",
      skill: skill("封面 Skill"),
      context: imageContext(),
      conversationHistory: [
        {
          role: "user",
          content: "封面主题：什么是 Skill，主标题：什么是 Skill",
        },
        {
          role: "assistant",
          content:
            "【封面 Skill · 第 1 轮 / 3】推荐 10 正面对视风和 6 海报拼贴风。",
        },
      ],
    })

    expect(intake.clarification).toMatchObject({
      summary: "封面参考素材待确认",
    })
    expect(intake.resolvedInstruction).toContain("构图风格：10 正面对视风")
  })

  it("uses the newest explicit cover title when the user revises it in round one", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "10 正面对视风，主标题：把 Skill 用起来",
      skill: skill("封面 Skill"),
      conversationHistory: [
        {
          role: "user",
          content: "主题：什么是 Skill，主标题：旧标题",
        },
        {
          role: "assistant",
          content: "【封面 Skill · 第 1 轮 / 3】请选择风格与标题。",
        },
      ],
    })

    expect(intake.resolvedInstruction).toContain("主标题：把 Skill 用起来")
    expect(intake.clarification).toMatchObject({
      summary: "封面参考素材待确认",
    })
  })

  it("does not repeat cover questions when all three rounds are answered upfront", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "封面主题：春季新品，主标题：春日新章。10 正面对视风，不使用人物，没有其他素材。人物表情：6 托腮思考，背景：4 冷色，字体：1 超粗黑体，文字效果：4 描边效果。",
      skill: skill("封面 Skill"),
      generationCapabilities: { image: true, video: false },
    })

    expect(intake.clarification).toBeUndefined()
    expect(intake.resolvedInstruction).toContain("人物表情：6 托腮思考")
    expect(intake.resolvedInstruction).toContain("文字效果：4 描边效果")
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

  it("requires a real selected image before starting the 3D sticker workflow", () => {
    const missing = resolveBuiltinSkillIntake({
      userInstruction: "把这个转换成 3D 贴纸",
      skill: skill("canvas-3d-sticker-stylizer"),
      generationCapabilities: { image: true, video: false },
    })
    expect(missing.clarification).toMatchObject({
      intent: "conversation",
      summary: "3D 贴纸输入待选择",
    })
    expect(missing.clarification?.message).toContain("选中")
    expect(missing.clarification?.message).toContain("透明 PNG")

    const ready = resolveBuiltinSkillIntake({
      userInstruction: "把这个转换成 3D 贴纸，保留完整主体",
      skill: skill("canvas-3d-sticker-stylizer"),
      context: imageContext(),
      generationCapabilities: { image: true, video: false },
    })
    expect(ready.clarification).toBeUndefined()
  })

  it("checks only image generation capability for the 3D sticker workflow", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "把这个转换成 3D 贴纸",
      skill: skill("canvas-3d-sticker-stylizer"),
      context: imageContext(),
      generationCapabilities: { image: false, video: true },
    })
    expect(intake.clarification).toMatchObject({
      summary: "图片生成能力待配置",
    })
    expect(intake.clarification?.message).not.toContain("视频模型")
  })

  it("requires real content before starting Ian Xiaohei article illustrations", () => {
    const missing = resolveBuiltinSkillIntake({
      userInstruction: "用这个 Skill 帮我生成配图",
      skill: skill("ian-xiaohei-illustrations"),
      generationCapabilities: { image: true, video: true },
      conversationHistory: [
        { role: "user", content: "之前用分镜 Skill 做四个镜头" },
      ],
    })
    expect(missing.clarification).toMatchObject({
      summary: "小蓝滴配图内容待补充",
    })
    expect(missing.resolvedInstruction).not.toContain("分镜")

    const ready = resolveBuiltinSkillIntake({
      userInstruction: "用这个 Skill 生成 3 张配图",
      skill: skill("Ian 小蓝滴配图"),
      context: textContext(),
      generationCapabilities: { image: true, video: false },
    })
    expect(ready.clarification).toBeUndefined()
    expect(ready.resolvedInstruction).toContain("反馈回路太长")
  })

  it("requires a selected image only for explicit Xiaohei image revisions", () => {
    const missing = resolveBuiltinSkillIntake({
      userInstruction: "把这张配图左上角标题去掉，其他内容不变",
      skill: skill("ian-xiaohei-illustrations"),
      generationCapabilities: { image: true, video: false },
    })
    expect(missing.clarification).toMatchObject({
      summary: "小蓝滴修改图片待选择",
    })

    const ready = resolveBuiltinSkillIntake({
      userInstruction: "把这张配图左上角标题去掉，其他内容不变",
      skill: skill("ian-xiaohei-illustrations"),
      context: imageContext(),
      generationCapabilities: { image: true, video: false },
    })
    expect(ready.clarification).toBeUndefined()
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
    expect(intake.clarification?.choiceGroups?.[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "飞行穿梭" }),
        expect.objectContaining({ value: "平视漫游" }),
        expect.objectContaining({ value: "固定视角" }),
        expect.objectContaining({ value: "运镜交给你" }),
      ])
    )
  })

  it("accepts a concrete world theme and camera mode", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "为春季茶饮品牌制作一个花园微缩世界，使用平视漫游运镜，暖绿色和樱花粉配色",
      skill: skill("世界 Skill"),
    })

    expect(intake.clarification).toBeUndefined()
  })

  it("advances the world protocol after a camera button answer without asking it again", () => {
    const cameraReply = resolveBuiltinSkillIntake({
      userInstruction: "平视漫游",
      skill: skill("世界 Skill"),
      conversationHistory: [
        { role: "user", content: "用世界 Skill 帮我生成" },
        {
          role: "assistant",
          content: "请告诉我世界主题并选择运镜。",
        },
      ],
    })

    expect(cameraReply.clarification).toMatchObject({
      summary: "世界规划信息待补充",
    })
    expect(cameraReply.clarification?.message).toContain("运镜方式我记下了")
    expect(cameraReply.clarification?.choiceGroups).toBeUndefined()

    const complete = resolveBuiltinSkillIntake({
      userInstruction: "春日茶饮品牌的微缩花园世界",
      skill: skill("世界 Skill"),
      conversationHistory: [
        { role: "user", content: "用世界 Skill 帮我生成" },
        { role: "assistant", content: "请选择运镜。" },
        { role: "user", content: "平视漫游" },
        { role: "assistant", content: cameraReply.clarification!.message },
      ],
      generationCapabilities: { image: true, video: true },
    })

    expect(complete.clarification).toBeUndefined()
    expect(complete.resolvedInstruction).toContain("平视漫游")
    expect(complete.resolvedInstruction).toContain("微缩花园世界")
  })

  it("stops before confirmation when a built-in Skill lacks its generator", () => {
    const cover = resolveBuiltinSkillIntake({
      userInstruction: "6 / 4 / 1 / 4",
      skill: skill("封面 Skill"),
      context: imageContext(),
      conversationHistory: [
        {
          role: "user",
          content:
            "做一张独立设计师春季新品封面，主标题：春日新章",
        },
        {
          role: "assistant",
          content: "【封面 Skill · 第 1 轮 / 3】请选择风格和标题。",
        },
        { role: "user", content: "10 正面对视风，标题保持不变" },
        {
          role: "assistant",
          content: "【封面 Skill · 第 2 轮 / 3】请确认参考素材。",
        },
        { role: "user", content: "使用当前选中图片，没有其他素材" },
        {
          role: "assistant",
          content: "【封面 Skill · 第 3 轮 / 3】请选择视觉细节。",
        },
      ],
      generationCapabilities: { image: false, video: false },
    })
    expect(cover.clarification).toMatchObject({
      summary: "图片生成能力待配置",
    })
    expect(cover.clarification?.message).toContain("Base URL")

    const world = resolveBuiltinSkillIntake({
      userInstruction: "做一个春日园林世界，采用平视漫游运镜",
      skill: skill("世界 Skill"),
      generationCapabilities: { image: true, video: false },
    })
    expect(world.clarification).toMatchObject({
      summary: "世界生成能力待配置",
    })
    expect(world.clarification?.message).toContain("视频模型")
    expect(world.clarification?.message).toContain("不会先生成一半")
  })

  it("collects only the missing platform and content for social cards", () => {
    const incomplete = resolveBuiltinSkillIntake({
      userInstruction: "用这个 Skill 做一套社交卡片",
      skill: skill("guizang-social-card-skill"),
    })
    expect(incomplete.clarification).toMatchObject({
      summary: "社交卡信息待补充",
    })
    expect(incomplete.clarification?.message).toContain("小红书")
    expect(incomplete.clarification?.message).toContain("文章、观点或核心内容")
    expect(incomplete.clarification?.message).not.toContain("Editorial")
    expect(incomplete.clarification?.choiceGroups?.[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "小红书" }),
        expect.objectContaining({ value: "微信公众号" }),
      ])
    )

    const assets = resolveBuiltinSkillIntake({
      userInstruction:
        "为小红书制作 4 张关于独立开发者效率系统的卡片",
      skill: skill("guizang-social-card-skill"),
      generationCapabilities: { image: true, video: false },
    })

    expect(assets.clarification).toMatchObject({
      summary: "社交卡素材方式待选择",
    })
    expect(assets.clarification?.message).toContain("只问这一次")
    expect(assets.clarification?.choiceGroups?.[0]?.options).toHaveLength(3)

    const complete = resolveBuiltinSkillIntake({
      userInstruction: "没有现成素材，使用图片模型生成配图",
      skill: skill("guizang-social-card-skill"),
      conversationHistory: [
        {
          role: "user",
          content: "为小红书制作 4 张关于独立开发者效率系统的卡片",
        },
        {
          role: "assistant",
          content: assets.clarification!.message,
        },
      ],
      generationCapabilities: { image: true, video: false },
    })
    expect(complete.clarification).toBeUndefined()
  })

  it("keeps the social-card asset buttons visible until the user actually chooses", () => {
    const repeated = resolveBuiltinSkillIntake({
      userInstruction: "再帮我看看",
      skill: skill("guizang-social-card-skill"),
      conversationHistory: [
        {
          role: "user",
          content: "为小红书制作 4 张关于独立开发者效率系统的卡片",
        },
        {
          role: "assistant",
          content: "【社交卡 Skill · 素材方式】请选择素材方式。",
        },
      ],
      generationCapabilities: { image: true, video: false },
    })

    expect(repeated.clarification).toMatchObject({
      summary: "社交卡素材方式待选择",
    })
    expect(repeated.clarification?.choiceGroups?.[0]?.options).toHaveLength(3)
  })

  it("advances social cards through platform, content and asset button answers", () => {
    const contentReply = resolveBuiltinSkillIntake({
      userInstruction: "小红书",
      skill: skill("guizang-social-card-skill"),
      conversationHistory: [
        { role: "user", content: "用这个 Skill 做一组社交卡" },
        { role: "assistant", content: "请选择平台并提供内容。" },
      ],
    })
    expect(contentReply.clarification).toMatchObject({
      summary: "社交卡信息待补充",
    })
    expect(contentReply.clarification?.message).toContain("文章、观点或核心内容")
    expect(contentReply.clarification?.choiceGroups).toBeUndefined()

    const assets = resolveBuiltinSkillIntake({
      userInstruction: "内容是独立开发者如何缩短反馈回路",
      skill: skill("guizang-social-card-skill"),
      conversationHistory: [
        { role: "user", content: "用这个 Skill 做一组社交卡" },
        { role: "assistant", content: "请选择平台。" },
        { role: "user", content: "小红书" },
        { role: "assistant", content: contentReply.clarification!.message },
      ],
    })
    expect(assets.clarification).toMatchObject({
      summary: "社交卡素材方式待选择",
    })

    const complete = resolveBuiltinSkillIntake({
      userInstruction: "B 使用工具当前配置的图片模型生成原创配图",
      skill: skill("guizang-social-card-skill"),
      conversationHistory: [
        { role: "user", content: "用这个 Skill 做一组社交卡" },
        { role: "user", content: "小红书" },
        {
          role: "user",
          content: "内容是独立开发者如何缩短反馈回路",
        },
        { role: "assistant", content: assets.clarification!.message },
      ],
      generationCapabilities: { image: true, video: false },
    })
    expect(complete.clarification).toBeUndefined()
    expect(complete.resolvedInstruction).toContain("小红书")
    expect(complete.resolvedInstruction).toContain("缩短反馈回路")
    expect(complete.resolvedInstruction).toContain("原创配图")
  })

  it("does not ask a social-card asset question when a canvas image is selected", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "为小红书制作 4 张关于独立开发者效率系统的卡片",
      skill: skill("guizang-social-card-skill"),
      context: imageContext(),
      generationCapabilities: { image: true, video: false },
    })

    expect(intake.clarification).toBeUndefined()
  })

  it("collects portrait direction while allowing an authorized selected reference", () => {
    const incomplete = resolveBuiltinSkillIntake({
      userInstruction: "使用人物写真 Skill",
      skill: skill("人物写真 Skill"),
    })
    expect(incomplete.clarification).toMatchObject({
      summary: "写真方向待补充",
    })
    expect(incomplete.clarification?.message).toContain("成年")

    const complete = resolveBuiltinSkillIntake({
      userInstruction:
        "为成年女性生成一组海边自然光杂志写真，松弛、清透，服装和镜头由你决定",
      skill: skill("人物写真 Skill"),
      context: imageContext(),
      generationCapabilities: { image: true, video: false },
    })
    expect(complete.clarification).toBeUndefined()
  })

  it("only asks for the remaining adult confirmation in a portrait follow-up", () => {
    const firstReply = resolveBuiltinSkillIntake({
      userInstruction: "裙子、丸子头、证件照",
      skill: skill("人物写真 Skill"),
      context: imageContext(),
    })

    expect(firstReply.clarification).toMatchObject({
      summary: "写真年龄待确认",
    })
    expect(firstReply.clarification?.message).toContain("只差年龄确认")
    expect(firstReply.clarification?.message).not.toContain("拍摄场景或用途")
    expect(firstReply.clarification?.choiceGroups?.[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "成年女性" }),
        expect.objectContaining({ value: "成年男性" }),
        expect.objectContaining({ value: "已满 18 岁" }),
      ])
    )

    const secondReply = resolveBuiltinSkillIntake({
      userInstruction: "裙子、丸子头、微笑、镜头远景证件照",
      skill: skill("人物写真 Skill"),
      context: imageContext(),
      conversationHistory: [
        { role: "user", content: "裙子、丸子头、证件照" },
        {
          role: "assistant",
          content:
            firstReply.clarification?.message ?? "请确认人物为成年人物",
        },
      ],
    })

    expect(secondReply.clarification).toMatchObject({
      summary: "写真年龄待确认",
    })
    expect(secondReply.clarification?.message).toContain("仍只差年龄确认")
    expect(secondReply.clarification?.message).not.toContain("拍摄场景或用途")

    const complete = resolveBuiltinSkillIntake({
      userInstruction: "成年女性",
      skill: skill("人物写真 Skill"),
      context: imageContext(),
      conversationHistory: [
        { role: "user", content: "裙子、丸子头、证件照" },
        {
          role: "assistant",
          content:
            firstReply.clarification?.message ?? "请确认人物为成年人物",
        },
        {
          role: "user",
          content: "裙子、丸子头、微笑、镜头远景证件照",
        },
        {
          role: "assistant",
          content:
            secondReply.clarification?.message ?? "请确认人物为成年人物",
        },
      ],
      generationCapabilities: { image: true, video: false },
    })

    expect(complete.clarification).toBeUndefined()
    expect(complete.resolvedInstruction).toContain("成年女性")
    expect(complete.resolvedInstruction).toContain("镜头远景证件照")
  })

  it("does not repeat portrait questions when the prompt already identifies an adult-coded subject", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "帮我生成一个女生，女生穿着西装，镜头是靠近一点特写",
      skill: skill("人物写真 Skill"),
      generationCapabilities: { image: true, video: false },
    })

    expect(intake.clarification).toBeUndefined()
    expect(intake.resolvedInstruction).toContain("女生穿着西装")
    expect(intake.resolvedInstruction).toContain("靠近一点特写")
  })

  it("still asks for age when a portrait prompt explicitly describes a minor", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction: "帮我生成一个小女孩穿西装的近距离特写",
      skill: skill("人物写真 Skill"),
      generationCapabilities: { image: true, video: false },
    })

    expect(intake.clarification).toMatchObject({
      summary: "写真年龄待确认",
    })
    expect(intake.clarification?.message).toContain("年龄确认")
  })

  it("accepts an explicit adult correction after an initially minor-coded portrait request", () => {
    const first = resolveBuiltinSkillIntake({
      userInstruction: "帮我生成一个小女孩穿西装的近距离特写",
      skill: skill("人物写真 Skill"),
      generationCapabilities: { image: true, video: false },
    })

    expect(first.clarification).toMatchObject({
      summary: "写真年龄待确认",
    })

    const corrected = resolveBuiltinSkillIntake({
      userInstruction: "成年女性",
      skill: skill("人物写真 Skill"),
      conversationHistory: [
        { role: "user", content: "帮我生成一个小女孩穿西装的近距离特写" },
        { role: "assistant", content: first.clarification!.message },
      ],
      generationCapabilities: { image: true, video: false },
    })

    expect(corrected.clarification).toBeUndefined()
    expect(corrected.resolvedInstruction).toContain("成年女性")
  })

  it("requires story content and both configured generators for hand-drawn video", () => {
    const incomplete = resolveBuiltinSkillIntake({
      userInstruction: "使用这个 Skill 生成视频",
      skill: skill("story-to-handdrawn-video"),
    })
    expect(incomplete.clarification).toMatchObject({
      summary: "手绘故事信息待补充",
    })
    expect(incomplete.clarification?.message).toContain("故事")
    expect(incomplete.clarification?.message).not.toContain("几段")

    const missingVideo = resolveBuiltinSkillIntake({
      userInstruction:
        "把一个女孩第一次独自搬家、整理房间并给家人报平安的故事做成 4 段手绘视频",
      skill: skill("story-to-handdrawn-video"),
      generationCapabilities: { image: true, video: false },
    })
    expect(missingVideo.clarification).toMatchObject({
      summary: "手绘视频能力待配置",
    })
    expect(missingVideo.clarification?.message).toContain("视频模型")
  })

  it("starts hand-drawn video without asking extra questions when story content is ready", () => {
    const intake = resolveBuiltinSkillIntake({
      userInstruction:
        "把一个女孩第一次独自搬家、整理房间并给家人报平安的故事做成手绘视频",
      skill: skill("story-to-handdrawn-video"),
      generationCapabilities: { image: true, video: true },
    })

    expect(intake.clarification).toBeUndefined()
  })
})
