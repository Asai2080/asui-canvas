import { describe, expect, it } from "vitest"

import {
  buildTemplatePromptGuidance,
  selectVisualPromptMethod,
  selectVisualPromptTemplate,
  templateNegativePrompt,
} from "./template-router"

describe("visual prompt template routing", () => {
  it("routes dashboards to work-oriented UI guidance", () => {
    const template = selectVisualPromptTemplate("生成一个 SaaS 数据分析 dashboard")
    const guidance = buildTemplatePromptGuidance(
      "生成一个 SaaS 数据分析 dashboard",
      1440,
      1024
    ).join("\n")

    expect(template.id).toBe("ui-interface")
    expect(guidance).toContain("主数据表/任务列表")
    expect(guidance).toContain("1440 × 1024")
    expect(guidance).toContain("一种主风格 + 至多一种辅助效果 + 一个点缀色")
  })

  it("keeps landing pages distinct from work tools", () => {
    const guidance = buildTemplatePromptGuidance(
      "生成一个产品官网落地页",
      1440,
      1024
    ).join("\n")

    expect(selectVisualPromptTemplate("生成一个产品官网落地页").id).toBe(
      "ui-interface"
    )
    expect(guidance).toContain("品牌导航")
    expect(guidance).not.toContain("主数据表/任务列表")
  })

  it("routes product, brand, and classical requests to their own profiles", () => {
    expect(selectVisualPromptTemplate("生成一张运动鞋产品广告图").id).toBe(
      "product"
    )
    expect(selectVisualPromptTemplate("生成一套品牌视觉识别方案").id).toBe(
      "brand"
    )
    expect(selectVisualPromptTemplate("生成宋代春日园林的古典画面").id).toBe(
      "classical"
    )
  })

  it("uses general guidance for unknown styles without rewriting the style", () => {
    const instruction = "生成一张赛博巴洛克美学的未来歌剧院概念图"
    const guidance = buildTemplatePromptGuidance(instruction, 1024, 1024).join(
      "\n"
    )

    expect(selectVisualPromptTemplate(instruction).id).toBe("general")
    expect(guidance).toContain("不堆叠无动机特效")
    expect(guidance).not.toContain("毛玻璃")
  })

  it("does not inject preset UI effects unless the user asks for them", () => {
    const plain = buildTemplatePromptGuidance("生成一个记账 App 首页", 750, 1624).join(
      "\n"
    )
    const glass = buildTemplatePromptGuidance(
      "生成一个毛玻璃风格的记账 App 首页",
      750,
      1624
    ).join("\n")
    const spatial = buildTemplatePromptGuidance(
      "生成一个有轻量 3D 空间效果的记账 App 首页",
      750,
      1624
    ).join("\n")

    expect(plain).toContain("不预设毛玻璃、Bento、渐变或 3D")
    expect(plain).toContain("严格使用 750 × 1624 竖版单屏画布")
    expect(plain).toContain("底部导航约占 10%")
    expect(plain).toContain("内容超量时减少条目和装饰")
    expect(plain).not.toContain("辅助效果选择毛玻璃")
    expect(plain).not.toContain("辅助效果选择 Bento Grid")
    expect(glass).toContain("辅助效果选择毛玻璃")
    expect(glass).not.toContain("辅助效果选择 Bento Grid")
    expect(spatial).toContain("选择一种轻量空间效果")
  })

  it("produces category-specific negative constraints", () => {
    expect(templateNegativePrompt("生成一个管理后台 UI")).toContain("设备样机")
    expect(templateNegativePrompt("生成一张人物写真的摄影照片")).toContain(
      "蜡像皮肤"
    )
  })

  it("selects specialized industrial prompt methods inside a category", () => {
    expect(
      selectVisualPromptMethod("生成从人体到细胞的科学尺度缩放信息图")?.id
    ).toBe("scientific-scale-diagram")
    expect(
      selectVisualPromptMethod("生成一张马拉松运动商业 Campaign 海报")?.id
    ).toBe("sports-campaign-poster")
    expect(
      selectVisualPromptMethod("生成一个带分件结构的收藏玩具手办")?.id
    ).toBe("3d-collectible-toy")
    expect(
      selectVisualPromptMethod("生成一个 SaaS 管理后台 UI")?.id
    ).toBe("ui-screenshot-system")
  })

  it("adds method-specific visible decisions instead of surface constraints", () => {
    const scale = buildTemplatePromptGuidance(
      "生成从城市到细胞的科学尺度缩放信息图",
      1440,
      1024
    ).join("\n")
    const toy = buildTemplatePromptGuidance(
      "生成一款原创角色收藏玩具手办",
      1024,
      1024
    ).join("\n")

    expect(scale).toContain("每一级明确对象、单位、倍率和独有结构证据")
    expect(templateNegativePrompt("生成从城市到细胞的科学尺度缩放信息图")).toContain(
      "各层级视觉重复"
    )
    expect(toy).toContain("分件结构")
    expect(toy).toContain("可制造的厚度、接缝和支撑关系")
  })
})
