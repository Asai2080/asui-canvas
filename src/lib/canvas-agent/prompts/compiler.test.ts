import { describe, expect, it } from "vitest"

import type { CanvasContextSnapshot } from "../context/schema"
import type { SkillSnapshot } from "../skills/schema"
import {
  buildProfessionalCreativeBrief,
  compileGenerationPrompt,
} from "./compiler"

const createdAt = "2026-07-25T02:00:00.000Z"

function skillSnapshot(skillId: string, name: string): SkillSnapshot {
  return {
    id: `snapshot-${skillId}`,
    skillId,
    name,
    description: `${name} description`,
    contentHash: "9".repeat(64),
    instructions: `${name} instructions`,
    risks: [],
    createdAt,
  }
}

function imageContextForCompiler(): CanvasContextSnapshot {
  return {
    id: "context-compiler-image",
    createdAt,
    scope: "selection",
    selectedNodeId: "portrait-reference",
    sourceNode: {
      id: "portrait-reference",
      kind: "image",
      bounds: { x: 0, y: 0, w: 768, h: 1024 },
      referenceIds: [],
      media: {
        referenceType: "url",
        mediaType: "image",
        src: "https://example.test/portrait-reference.png",
        width: 768,
        height: 1024,
      },
    },
    annotations: [],
    connectedNodes: [],
    references: [],
  }
}

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
    expect(compiled.outputs[0].prompt).toContain("【主体与场景】")
    expect(compiled.outputs[0].prompt).toContain("【构图与镜头】")
    expect(compiled.outputs[0].prompt).toContain("当代东方视觉语言")
    expect(new Set(compiled.outputs.map((output) => output.prompt)).size).toBe(4)
  })

  it("builds a production-ready 3D animation prompt instead of generic filler", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-animation",
      userInstruction: "帮我生成一个皮克斯风格的图片",
    })

    expect(compiled.outputs[0].prompt).toContain("电影级 3D 动画长片")
    expect(compiled.outputs[0].prompt).toContain("原创动画角色")
    expect(compiled.outputs[0].prompt).toContain("35mm 标准广角")
    expect(compiled.outputs[0].prompt).toContain("次表面散射")
    expect(compiled.outputs[0].prompt).toContain("【质量控制】")
    expect(compiled.outputs[0].negativePrompt).toContain("现有动画角色")
    expect(compiled.outputs[0].prompt).not.toContain(
      "主体明确，视觉层级清楚，画面焦点集中"
    )
  })

  it("expands a short scene into concrete subject, action, relationship, and environment details", () => {
    const sourceInstruction =
      "帮我生成一个皮格斯风格的图片，场景是一个小男孩在草坪上踢足球，旁边有条小狗"
    const professionalBrief = buildProfessionalCreativeBrief(sourceInstruction)
    const compiled = compileGenerationPrompt({
      taskId: "task-football-scene",
      userInstruction: professionalBrief,
      sourceInstruction,
    })
    const prompt = compiled.outputs[0].prompt

    expect(professionalBrief).toContain("【画面内容扩写】")
    expect(prompt).toContain("支撑脚稳稳踩入草地")
    expect(prompt).toContain("脚内侧刚触球")
    expect(prompt).toContain("眼睛追随球路")
    expect(prompt).toContain("小狗位于人物侧后方")
    expect(prompt).toContain("前爪短暂离地")
    expect(prompt).toContain("被鞋底压弯的方向")
    expect(prompt).toContain("电影级 3D 动画长片")
    expect(prompt).not.toContain("将其发展为可直接交付的高完成度视觉成片")
  })

  it("preserves unclassified visual styles as first-class constraints", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-unknown-style",
      userInstruction: "生成一张赛博巴洛克美学的未来歌剧院概念图",
    })

    expect(compiled.outputs[0].prompt).toContain("赛博巴洛克美学")
    expect(compiled.outputs[0].prompt).toContain(
      "任何未被预设识别的风格词都视为最高优先级视觉约束"
    )
    expect(compiled.outputs[0].prompt).toContain("【风格与媒介】")
    expect(compiled.outputs[0].prompt).toContain("【质量控制】")
  })

  it("routes generic UI prompts through the adaptive UI prompt system", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-ui-adaptive",
      userInstruction: "生成一个移动端记账 App 首页，尺寸 750x1624",
    })
    const output = compiled.outputs[0]

    expect(output.prompt).toContain("【产品与页面任务】")
    expect(output.prompt).toContain("个人记账与预算管理 App")
    expect(output.prompt).toContain("750 × 1624")
    expect(output.prompt).toContain("唯一主操作按钮写“记一笔”")
    expect(output.prompt).toContain("已支出 ¥3,286.40")
    expect(output.prompt).toContain("安全区 x=48–702px，y=65–1527px")
    expect(output.prompt).toContain("触控目标至少 88×88px")
    expect(output.prompt).toContain("不绘制设备外壳、操作系统状态栏")
    expect(output.prompt).not.toContain("35mm")
    expect(output.prompt).not.toContain("机位与焦段")
    expect(output.prompt).not.toContain("文字模型创作简报")
    expect(output.prompt.length).toBeLessThan(3_000)
    expect(output.negativePrompt).toContain("设备样机")
    expect(output.negativePrompt).toContain("模块越界")
  })

  it("defaults mobile UI generation to the product mobile canvas", () => {
    const originalGoal = "生成一个移动端课程学习首页，用户要查看今日课程并继续学习"
    const brief = buildProfessionalCreativeBrief(originalGoal)
    const output = compileGenerationPrompt({
      taskId: "task-ui-default-nine-sixteen",
      userInstruction: brief,
      sourceInstruction: originalGoal,
    }).outputs[0]

    expect(brief).toContain("750 × 1624 移动端 App")
    expect(output).toMatchObject({ width: 750, height: 1624 })
    expect(output.prompt).toContain("750 × 1624")
  })

  it("routes mobile homepage wording through UI compilation without camera leakage", () => {
    const prompts = [
      "生成一个面向自由职业者的移动端项目收支首页，尺寸 750x1624，安静专业",
      "生成一个手机端健康记录首页，尺寸 750x1624",
      "生成 Web 端运营工作台，尺寸 1440x1024",
    ]

    for (const userInstruction of prompts) {
      const output = compileGenerationPrompt({
        taskId: `task-ui-natural-${prompts.indexOf(userInstruction)}`,
        userInstruction,
      }).outputs[0]

      expect(output.prompt).toContain("【产品与页面任务】")
      expect(output.prompt).not.toContain("35mm")
      expect(output.prompt).not.toContain("摄影棚主光")
      expect(output.prompt).not.toContain("景深变化")
    }
  })

  it("does not let generated negative wording reroute an App page as a landing page", () => {
    const originalGoal = "我想生成一个每天记录排便的 APP 首页，尺寸 750x1624"
    const compiled = compileGenerationPrompt({
      taskId: "task-health-app-routing",
      sourceInstruction: originalGoal,
      userInstruction: `${originalGoal}\n成熟健康工具，避免营销落地页式空洞构图。`,
      target: { mediaType: "image", width: 750, height: 1624 },
    })
    const output = compiled.outputs[0]

    expect(output.prompt).toContain("日常排便与肠道状态记录 App")
    expect(output.prompt).toContain("最多三条近期记录")
    expect(output.prompt).toContain("不用粪便 emoji")
    expect(output.prompt).not.toContain("真实产品官网")
    expect(output.prompt).not.toContain("品牌导航")
    expect(output.prompt).toContain("750 × 1624")
    expect(output.prompt).toContain("唯一主操作按钮写“记录一次”")
    expect(output.negativePrompt).toContain("模块越界")
  })

  it("keeps adaptive routing category-specific for product and photography", () => {
    const product = compileGenerationPrompt({
      taskId: "task-product-adaptive",
      userInstruction: "生成一张运动鞋产品广告图",
    }).outputs[0]
    const photography = compileGenerationPrompt({
      taskId: "task-photo-adaptive",
      userInstruction: "生成一张自然光人物写真照片",
    }).outputs[0]

    expect(product.prompt).toContain("商品与商业视觉")
    expect(product.prompt).toContain("主商品保持唯一视觉中心")
    expect(product.prompt).not.toContain("【空间系统】")
    expect(photography.prompt).toContain("写实摄影")
    expect(photography.prompt).toContain("决定性瞬间")
    expect(photography.prompt).not.toContain("【空间系统】")
    expect(photography.prompt).not.toContain("采用真实产品官网结构")
  })

  it("does not let a mismatched model brief contaminate the user's image category", () => {
    const product = compileGenerationPrompt({
      taskId: "task-category-isolation",
      sourceInstruction: "生成一张运动鞋产品广告图",
      userInstruction:
        "【UI 产品定义】运动 App 首页。【当前状态】已跑 3km。【可见内容与顺序】顶部导航。【准确短文案】“开始跑步”。【设计系统】蓝色卡片。【画布与可用性】750x1624。【禁止】无。",
    }).outputs[0]

    expect(product.prompt).toContain("商品与商业视觉")
    expect(product.prompt).toContain("主商品保持唯一视觉中心")
    expect(product.prompt).not.toContain("运动 App 首页")
    expect(product.prompt).not.toContain("开始跑步")
    expect(product.prompt).not.toContain("触控目标")
  })

  it("binds selected reference images to ordinary generation with category-specific semantics", () => {
    const context = imageContextForCompiler()
    const ui = compileGenerationPrompt({
      taskId: "task-ui-reference",
      userInstruction: "参考这张图生成一个移动端记账 App 首页，750x1624",
      context,
      target: { mediaType: "image", width: 750, height: 1624 },
    }).outputs[0]

    expect(ui.operation).toBe("create")
    expect(ui.sourceContextSnapshotId).toBe(context.id)
    expect(ui.prompt).toContain("【参考图使用协议】")
    expect(ui.prompt).toContain("提取信息架构、模块顺序、栅格、间距节奏")
    expect(ui.prompt).toContain("不要照抄参考图中的品牌名")
    expect(ui.prompt).not.toContain("35mm")
  })

  it("preserves the requested login-page task when a UI reference is selected", () => {
    const output = compileGenerationPrompt({
      taskId: "task-auth-reference",
      sourceInstruction:
        "参考这张图片的设计风格，生成记录排便 App 登录页，严格参考这张图，750x1624",
      userInstruction: [
        "【参考图分析】薄荷绿渐变上半区、粗黑标题、双角色插画、黑色主按钮、浅灰胶囊次级按钮和底部协议文字。",
        "【UI 产品定义】日常排便记录 App，目标用户是希望轻松记录健康状态的成年人；本屏只负责选择登录方式并进入账户。",
        "【当前状态】首次打开，尚未登录。",
        "【可见内容与顺序】欢迎语；插画；登录按钮组；协议与隐私入口。",
        "【准确短文案】“轻松记录”“手机号登录”“其他登录方式”“隐私政策”。",
        "【设计系统】迁移参考图的薄荷绿、粗黑圆润标题、角色插画和胶囊按钮节奏。",
        "【画布与可用性】严格 750x1624。",
        "【禁止】首页、趋势图、近期记录、底部导航。",
      ].join("\n"),
      context: imageContextForCompiler(),
      target: { mediaType: "image", width: 750, height: 1624 },
    }).outputs[0]

    expect(output.prompt).toContain("【参考图视觉拆解与迁移】")
    expect(output.prompt).toContain("登录方式并进入账户")
    expect(output.prompt).toContain("薄荷绿渐变")
    expect(output.prompt).not.toContain("今日尚未记录")
    expect(output.prompt).not.toContain("最多三条近期记录")
    expect(output.prompt).not.toContain("底部导航包含首页")
  })

  it("compiles a director-level video timeline and camera plan", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-video-ad",
      userInstruction:
        "生成一个 8 秒运动鞋广告视频，镜头环绕产品，未来运动美学，16:9，1080p",
      target: {
        mediaType: "video",
        durationSeconds: 8,
        resolution: "1080p",
      },
    })

    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "video",
      operation: "create",
      durationSeconds: 8,
      resolution: "1080p",
    })
    expect(compiled.outputs[0].prompt).toContain("【导演创作简报】")
    expect(compiled.outputs[0].prompt).toContain("【时间轴与动作调度】")
    expect(compiled.outputs[0].prompt).toContain("0.0–1.6 秒")
    expect(compiled.outputs[0].prompt).toContain("沿稳定圆弧轨道环绕主体")
    expect(compiled.outputs[0].prompt).toContain("保持 180 度轴线")
    expect(compiled.outputs[0].prompt).toContain("【结尾帧】")
    expect(compiled.outputs[0].prompt).toContain("画幅比例 16:9")
    expect(compiled.outputs[0].negativePrompt).toContain("镜头瞬移")
    expect(compiled.outputs[0].negativePrompt).toContain("材质闪烁")
  })

  it("locks source identity and first-frame continuity for image-to-video", () => {
    const context: CanvasContextSnapshot = {
      id: "context-video-source",
      createdAt,
      scope: "selection",
      selectedNodeId: "image-source",
      sourceNode: {
        id: "image-source",
        kind: "image",
        bounds: { x: 0, y: 0, w: 1024, h: 576 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.com/source.png",
          width: 1024,
          height: 576,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [],
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-image-video",
      userInstruction: "让画面中的角色缓慢转头看向镜头，镜头轻轻推进，6 秒",
      context,
      target: { mediaType: "video", durationSeconds: 6 },
    })

    expect(compiled.outputs[0].operation).toBe("animate")
    expect(compiled.outputs[0].prompt).toContain("参考图为唯一首帧")
    expect(compiled.outputs[0].prompt).toContain("首帧与参考图严格对齐")
    expect(compiled.outputs[0].prompt).toContain("缓慢 dolly-in")
    expect(compiled.outputs[0].negativePrompt).toContain(
      "不要改变参考图中的主体身份"
    )
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

  it("compiles nb-fj into independent 16:9 storyboard keyframes", () => {
    const context: CanvasContextSnapshot = {
      id: "context-storyboard",
      createdAt,
      scope: "selection",
      selectedNodeId: "image-spring",
      sourceNode: {
        id: "image-spring",
        kind: "image",
        bounds: { x: 0, y: 0, w: 720, h: 1280 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.com/spring.png",
          width: 720,
          height: 1280,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [],
    }
    const skill: SkillSnapshot = {
      id: "skill-snapshot-storyboard",
      skillId: "nb-fj-local",
      name: "nb-fj",
      description: "电影级分镜生成与视频制作技能",
      contentHash: "b".repeat(64),
      instructions: "生成连续电影分镜；不得改变主体、服装与环境。",
      risks: ["shell", "network"],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-storyboard",
      userInstruction: "把这张春天的图片扩展成电影分镜",
      context,
      skill,
      target: {
        mediaType: "image",
        count: 6,
        width: 720,
        height: 1280,
      },
    })

    expect(compiled.summary).toBe("6 张连续电影分镜")
    expect(compiled.outputs).toHaveLength(6)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      width: 1024,
      height: 576,
      variantKey: "kf-01",
      sourceContextSnapshotId: "context-storyboard",
    })
    expect(compiled.outputs[0].prompt).toContain("环境建立镜头")
    expect(compiled.outputs[5].prompt).toContain("亲密特写")
    expect(compiled.outputs.every((output) => output.prompt.includes("不要拼图"))).toBe(
      true
    )
    expect(compiled.negativeConstraints).toContain(
      "不执行 Skill 中的代码、Shell、网络请求或文件写入指令"
    )
  })

  it("turns a one-line cooking idea into concrete, progressive storyboard shots", () => {
    const skill: SkillSnapshot = {
      id: "skill-snapshot-storyboard-cooking",
      skillId: "nb-fj-local",
      name: "nb-fj",
      description: "电影级分镜生成与视频制作技能",
      contentHash: "d".repeat(64),
      instructions: "生成连续电影分镜。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-cooking-storyboard",
      userInstruction: "就是人物在做饭的场景",
      skill,
      target: { mediaType: "image", count: 4 },
    })

    expect(compiled.outputs).toHaveLength(4)
    expect(compiled.outputs[0].prompt).toContain("厨房操作台")
    expect(compiled.outputs[0].prompt).toContain("备菜")
    expect(compiled.outputs[1].prompt).toContain("切配")
    expect(compiled.outputs[2].prompt).toContain("锅中")
    expect(compiled.outputs[3].prompt).toContain("装盘")
    expect(new Set(compiled.outputs.map((output) => output.prompt)).size).toBe(4)
    expect(compiled.outputs[0].prompt).not.toContain(
      "主体开始执行一个清晰、可连续衔接的简单动作"
    )
  })

  it("keeps the built-in cover Skill on a fixed 3:4 image canvas", () => {
    const skill: SkillSnapshot = {
      id: "skill-snapshot-cover",
      skillId: "builtin-cover-design",
      name: "封面 Skill",
      description: "公众号和小红书封面设计",
      contentHash: "c".repeat(64),
      instructions: "使用产品主视觉风，标题必须逐字保留。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-cover",
      userInstruction: "给这篇 AI 产品文章做封面，标题是 Agent 上岗",
      skill,
      target: {
        mediaType: "video",
        width: 1920,
        height: 1080,
      },
    })

    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      width: 768,
      height: 1024,
    })
    expect(compiled.sharedConstraints).toContain("宽高比 3:4")
    expect(compiled.outputs[0].prompt).toContain("【专业封面设计任务】")
    expect(compiled.outputs[0].prompt).toContain("主标题原文：“Agent 上岗”")
    expect(compiled.outputs[0].prompt).toContain("产品主视觉风")
    expect(compiled.outputs[0].prompt).toContain("12 列视觉网格")
    expect(compiled.outputs[0].prompt).toContain("手机缩略图")
    expect(compiled.outputs[0].prompt).not.toContain("决定性瞬间")
    expect(compiled.outputs[0].prompt).not.toContain(
      "围绕“给这篇 AI 产品文章做封面"
    )
  })

  it("honors the cover choices collected by the three-round intake", () => {
    const skill: SkillSnapshot = {
      id: "skill-snapshot-cover-rounds",
      skillId: "builtin-cover-design",
      name: "封面 Skill",
      description: "封面设计",
      contentHash: "c".repeat(64),
      instructions: "严格使用用户在三轮问询中确认的选项。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-cover-rounds",
      userInstruction: [
        "封面主题：什么是 Skill",
        "主标题：什么是 Skill",
        "构图风格：10 正面对视风",
        "参考素材确认：使用当前选中人物图，没有其他素材",
        "人物表情：6",
        "背景：4",
        "字体：1",
        "文字效果：4",
      ].join("\n"),
      skill,
      target: { mediaType: "image" },
    })

    expect(compiled.outputs[0].prompt).toContain("构图风格：正面对视风")
    expect(compiled.outputs[0].prompt).not.toContain("产品主视觉风")
    expect(compiled.outputs[0].prompt).toContain("托腮思考")
    expect(compiled.outputs[0].prompt).toContain("冷色调")
    expect(compiled.outputs[0].prompt).toContain("超粗黑体")
    expect(compiled.outputs[0].prompt).toContain("描边效果")
  })

  it("preserves the selected cover background and layers the title behind the person", () => {
    const skill: SkillSnapshot = {
      id: "skill-snapshot-cover-preserve-background",
      skillId: "builtin-cover-design",
      name: "封面 Skill",
      description: "封面设计",
      contentHash: "c".repeat(64),
      instructions: "严格保留参考图背景，只添加封面内容。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-cover-preserve-background",
      userInstruction: [
        "封面主题：春日新品",
        "主标题：春日新章",
        "构图风格：10 正面对视风",
        "使用当前选中的人物图作为图 1，没有其他素材",
        "人物表情：6",
        "背景：7 保留原背景",
        "字体：1",
        "文字效果：4",
      ].join("\n"),
      context: imageContextForCompiler(),
      skill,
      target: { mediaType: "image" },
    })
    const prompt = compiled.outputs[0].prompt

    expect(prompt).toContain("背景模式：保留原背景")
    expect(prompt).toContain("不改变图 1 的原背景")
    expect(prompt).toContain("原背景 < 主标题文字 < 人物主体")
    expect(prompt).toContain("人物轮廓自然遮挡主标题的一部分")
    expect(prompt).toContain("仍能完整辨认")
    expect(prompt).not.toContain("建立一个主色、一个辅助色")
    expect(prompt).not.toContain("柔和主光塑造主体体积")
    expect(prompt).toContain("沿用图 1 现有的人物表情、动作、视线和身体重心")
    expect(prompt).not.toContain("人物表情与状态：托腮思考")
    expect(prompt).toContain("保持图 1 原有取景、主体位置、画面比例与空间关系")
    expect(prompt).not.toContain("面部位于画面中上部")
    expect(compiled.outputs[0].preserveConstraints).toContain(
      "不改变图 1 的原背景内容、色调、光线、构图、景深与已有物体。"
    )
  })

  it("preserves explicitly supplied cover small copy", () => {
    const skill: SkillSnapshot = {
      id: "skill-snapshot-cover-copy",
      skillId: "builtin-cover-design",
      name: "封面 Skill",
      description: "封面设计",
      contentHash: "c".repeat(64),
      instructions: "逐字保留已确认的封面文字。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-cover-copy",
      userInstruction:
        "封面主题：什么是 Skill 小子：大白话讲解，带你实操\n主标题：什么是 Skill",
      skill,
      target: { mediaType: "image" },
    })

    expect(compiled.outputs[0].prompt).toContain(
      "主标题原文：“什么是 Skill”"
    )
    expect(compiled.outputs[0].prompt).toContain(
      "副标题原文：“大白话讲解，带你实操”"
    )
    expect(compiled.outputs[0].prompt).not.toContain("禁止生成副标题")
  })

  it("maps selected cover references to explicit visual roles", () => {
    const context: CanvasContextSnapshot = {
      id: "context-cover-assets",
      createdAt,
      scope: "selection",
      selectedNodeId: "cover-person",
      sourceNode: {
        id: "cover-person",
        kind: "image",
        bounds: { x: 0, y: 0, w: 800, h: 1000 },
        referenceIds: ["cover-product"],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.com/person.png",
          width: 800,
          height: 1000,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [{
        id: "cover-product",
        kind: "image",
        bounds: { x: 900, y: 0, w: 800, h: 1000 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.com/product.png",
          width: 800,
          height: 1000,
        },
      }],
    }
    const skill: SkillSnapshot = {
      id: "skill-snapshot-cover-assets",
      skillId: "builtin-cover-design",
      name: "封面 Skill",
      description: "公众号和小红书封面设计",
      contentHash: "1".repeat(64),
      instructions: "先确认素材角色。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-cover-assets",
      userInstruction: "为新品发布做封面，主标题：轻装上新",
      context,
      skill,
    })

    expect(compiled.outputs[0].prompt).toContain("作为图 1")
    expect(compiled.outputs[0].prompt).toContain("其余 1 张选中图片")
    expect(compiled.outputs[0].prompt).toContain("不得取代图 1 的主体身份")
  })

  it("compiles image-to-3D into four independent reference views", () => {
    const context: CanvasContextSnapshot = {
      id: "context-product-3d",
      createdAt,
      scope: "selection",
      selectedNodeId: "image-product",
      sourceNode: {
        id: "image-product",
        kind: "image",
        bounds: { x: 0, y: 0, w: 1200, h: 900 },
        referenceIds: [],
        media: {
          referenceType: "url",
          mediaType: "image",
          src: "https://example.com/product.png",
          width: 1200,
          height: 900,
        },
      },
      annotations: [],
      connectedNodes: [],
      references: [],
    }
    const skill: SkillSnapshot = {
      id: "skill-snapshot-image-to-3d",
      skillId: "builtin-image-to-3d",
      name: "图片转 3D Skill",
      description: "将参考图扩展为多视角 3D 概念预览",
      contentHash: "e".repeat(64),
      instructions: "保持参考主体身份、结构、材质和比例一致。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-product-3d",
      userInstruction: [
        "【专业创作目标】",
        "选择事件正在发生的决定性瞬间。",
        "用电影主光塑造主体体积。",
      ].join("\n"),
      sourceInstruction:
        "把这个复古相机转成可用于 3D 建模的参考图，并生成 360 度环绕视频",
      context,
      skill,
      target: { mediaType: "image", count: 1 },
    })

    expect(compiled.summary).toBe("图片转 3D：四视角建模参考")
    expect(compiled.outputs).toHaveLength(4)
    expect(compiled.outputs.map((output) => output.variantKey)).toEqual([
      "three-front-three-quarter",
      "three-side-profile",
      "three-rear-three-quarter",
      "three-top-detail",
    ])
    for (const output of compiled.outputs) {
      expect(output).toMatchObject({
        mediaType: "image",
        operation: "create",
        sourceContextSnapshotId: "context-product-3d",
        width: 1024,
        height: 1024,
      })
      expect(output.prompt).toContain("本次任务唯一的视觉身份依据")
      expect(output.prompt).toContain("只生成一张 1024 × 1024")
      expect(output.prompt).not.toContain("决定性瞬间")
      expect(output.prompt).not.toContain("文字模型创作简报")
    }
    expect(compiled.outputs[0].prompt).toContain("前侧三分之四视图")
    expect(compiled.outputs[1].prompt).toContain("正侧面视图")
    expect(compiled.outputs[2].prompt).toContain("后侧三分之四视图")
    expect(compiled.outputs[3].prompt).toContain("顶部与结构细节视图")

    const imagesOnly = compileGenerationPrompt({
      taskId: "task-product-3d-images-only",
      userInstruction: "调用这个 Skill，帮我生成图片",
      sourceInstruction: "调用这个 Skill，帮我生成图片",
      context,
      skill,
      target: { mediaType: "image", count: 1 },
    })

    expect(imagesOnly.summary).toBe("图片转 3D：四视角建模参考")
    expect(imagesOnly.outputs).toHaveLength(4)
    expect(imagesOnly.outputs.every((output) => output.mediaType === "image")).toBe(
      true
    )
  })

  it("compiles the world Skill into paired scene images and camera videos", () => {
    const skill: SkillSnapshot = {
      id: "skill-snapshot-world",
      skillId: "builtin-world",
      name: "世界 Skill",
      description: "生成连续世界场景与沉浸式运镜",
      contentHash: "f".repeat(64),
      instructions: "保持世界空间与运镜连续。",
      risks: [],
      createdAt,
    }

    const compiled = compileGenerationPrompt({
      taskId: "task-tea-world",
      userInstruction:
        "为东方茶饮品牌制作一个可以穿梭的微缩山水世界，青绿与朱砂配色，9:16",
      skill,
      target: {
        count: 3,
        durationSeconds: 6,
        resolution: "1080p",
      },
    })

    expect(compiled.summary).toBe("世界 Skill：3 个连续场景")
    expect(compiled.outputs).toHaveLength(6)
    expect(compiled.outputs.map((output) => output.variantKey)).toEqual([
      "world-scene-01-image",
      "world-scene-01-video",
      "world-scene-02-image",
      "world-scene-02-video",
      "world-scene-03-image",
      "world-scene-03-video",
    ])
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      width: 576,
      height: 1024,
    })
    expect(compiled.outputs[0].prompt).toContain("【全局美术圣经】")
    expect(compiled.outputs[0].prompt).toContain("可穿行的入口")
    expect(compiled.outputs[0].prompt).toContain("当代东方视觉语言")
    expect(compiled.outputs[1]).toMatchObject({
      mediaType: "video",
      operation: "animate",
      durationSeconds: 6,
      resolution: "1080p",
    })
    expect(compiled.outputs[1].prompt).toContain(
      "严格以刚生成的 SC#01 场景图为唯一首帧"
    )
    expect(compiled.outputs[1].prompt).toContain("运镜模式：飞行穿梭")
    expect(compiled.outputs[1].prompt).toContain("缓慢 dolly-in")
    expect(compiled.negativeConstraints).toContain(
      "当前阶段只交付场景图与分段视频，不宣称已经完成视频合并或滚动网页预览"
    )
    expect(compiled.sharedConstraints).toContain(
      "本次执行共调用 3 次图片生成和 3 次视频生成；确认即代表同意消耗对应模型额度"
    )

    const locked = compileGenerationPrompt({
      taskId: "task-locked-world",
      userInstruction:
        "制作一个未来温室世界，使用固定视角，银灰与荧光绿色，16:9",
      skill,
      target: { count: 3 },
    })
    expect(locked.outputs[1].prompt).toContain("运镜模式：固定视角")
    expect(locked.outputs[1].prompt).toContain("不旋转、不环绕、不俯仰")
    expect(locked.outputs[3].prompt).toContain("相同的高位等距角度")

    const walkthrough = compileGenerationPrompt({
      taskId: "task-walkthrough-world",
      userInstruction:
        "制作一个春日园林世界，采用第一人称步行漫游，粉绿配色，16:9",
      skill,
      target: { count: 4 },
    })
    expect(walkthrough.outputs[1].prompt).toContain("运镜模式：平视漫游")
    expect(walkthrough.outputs[1].prompt).toContain("沿本场景已经建立的可行走通道")
    expect(walkthrough.outputs[5].prompt).not.toContain("摇臂")
    expect(walkthrough.outputs[7].prompt).not.toContain("圆弧轨道")
  })

  it("compiles the selected image into one transparent 3D sticker asset", () => {
    const sourceInstruction =
      "把当前图片中的人物做成 3D 贴纸，保留衣服上的 Logo"
    const compiled = compileGenerationPrompt({
      taskId: "task-canvas-3d-sticker",
      userInstruction: buildProfessionalCreativeBrief(sourceInstruction),
      sourceInstruction,
      context: imageContextForCompiler(),
      skill: skillSnapshot(
        "builtin-canvas-3d-sticker",
        "canvas-3d-sticker-stylizer"
      ),
      target: { mediaType: "video", count: 4 },
    })

    expect(compiled.summary).toBe("画布 3D 贴纸风格转换：单体资产")
    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      variantKey: "canvas-3d-sticker-v1",
      sourceContextSnapshotId: "context-compiler-image",
      width: 2048,
      height: 2048,
    })
    expect(compiled.outputs[0].prompt).toContain("真实 RGBA 透明通道")
    expect(compiled.outputs[0].prompt).toContain("内置风格参考只控制")
    expect(compiled.outputs[0].prompt).toContain("文字与标志必须逐字")
    expect(compiled.outputs[0].prompt).toContain(
      "桌面、椅子、杯子、纸张、书本"
    )
    expect(compiled.outputs[0].prompt).toContain(
      "生成阶段不要绘制白色贴纸描边"
    )
    expect(compiled.outputs[0].prompt).not.toContain("【场景与叙事】")
    expect(compiled.outputs[0].prompt).not.toContain(
      "【文字模型整理的补充意图】"
    )
    expect(compiled.outputs[0].negativePrompt).toContain("棋盘格像素")
    expect(compiled.sharedConstraints).toContain(
      "style_id: canvas-3d-sticker-v1"
    )
    expect(compiled.negativeConstraints).toContain(
      "当前任务只生成图片，不调用视频模型"
    )
  })

  it("uses the diorama camera contract for self-contained environments", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-canvas-3d-diorama",
      userInstruction: "把当前城市街区转换成完整微缩场景贴纸",
      context: imageContextForCompiler(),
      skill: skillSnapshot(
        "builtin-canvas-3d-sticker",
        "canvas-3d-sticker-stylizer"
      ),
    })
    expect(compiled.summary).toContain("微缩场景")
    expect(compiled.outputs[0].prompt).toContain("30 至 45 度")
    expect(compiled.outputs[0].prompt).toContain("平台足迹的视觉中心")
  })

  it("turns article content into independent Ian Xiaohei illustrations", () => {
    const article = "团队以为自动化能解决所有问题，但模糊输入不断进入流水线，错误在每一步被放大。真正有效的做法是先缩短反馈回路，让每一步都能被验证。".repeat(4)
    const compiled = compileGenerationPrompt({
      taskId: "task-ian-xiaohei",
      userInstruction: `把这篇文章生成 4 张配图：${article}`,
      sourceInstruction: `把这篇文章生成 4 张配图：${article}`,
      skill: skillSnapshot("builtin-ian-xiaohei", "ian-xiaohei-illustrations"),
      target: { mediaType: "video", count: 4 },
      context: imageContextForCompiler(),
    })

    expect(compiled.summary).toBe("Ian 小蓝滴配图：4 张正文插图")
    expect(compiled.outputs).toHaveLength(4)
    expect(compiled.outputs.every((output) => output.mediaType === "image")).toBe(
      true
    )
    expect(compiled.outputs[0]).toMatchObject({
      variantKey: "ian-xiaohei-article-01",
      width: 1024,
      height: 576,
      sourceContextSnapshotId: undefined,
    })
    expect(new Set(compiled.outputs.map((output) => output.prompt)).size).toBe(4)
    expect(compiled.outputs[0].prompt).toContain("不要复述原句")
    expect(compiled.outputs[0].prompt).toContain("【本张专业画面方案】")
    expect(compiled.outputs[0].prompt).toContain("模糊输入方块越滚越大")
    expect(compiled.outputs[0].prompt).toContain("小蓝滴必须亲自执行")
    expect(compiled.outputs[0].prompt).toContain("至少保留 35% 空白")
    expect(compiled.outputs[0].negativePrompt).toContain("左上角结构标题")
    expect(compiled.sharedConstraints).toContain(
      "不引用历史图片、普通选图或其他 Skill 产物"
    )
  })

  it("uses only the selected source for an explicit Ian Xiaohei revision", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-ian-edit",
      userInstruction: "把这张配图左上角标题去掉，其他内容完全不变",
      context: imageContextForCompiler(),
      skill: skillSnapshot("builtin-ian-xiaohei", "Ian 小蓝滴配图"),
      target: { mediaType: "video", count: 8 },
    })

    expect(compiled.summary).toBe("Ian 小蓝滴配图：定向修改")
    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      variantKey: "ian-xiaohei-edit-01",
      sourceContextSnapshotId: "context-compiler-image",
      width: 1024,
      height: 576,
    })
    expect(compiled.outputs[0].prompt).toContain("其他像素级内容尽量保持不变")
  })

  it("compiles social cards into platform-native independent images", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-social-cards",
      userInstruction:
        "为小红书制作 4 张关于独立开发者效率系统的卡片，使用 Swiss 视觉系统",
      skill: skillSnapshot("builtin-social-card", "guizang-social-card-skill"),
      target: { count: 4 },
    })

    expect(compiled.summary).toBe("小红书社交卡：4 张")
    expect(compiled.outputs).toHaveLength(4)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      width: 1080,
      height: 1440,
      variantKey: "social-card-01",
    })
    expect(compiled.outputs[0].prompt).toContain("Swiss")
    expect(compiled.outputs[0].prompt).toContain("卡片 1/4")
    expect(compiled.outputs[0].prompt).not.toContain("运行 HTML")
  })

  it("compiles a directed adult portrait with reference identity protection", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-portrait",
      userInstruction:
        "为成年女性生成一组海边自然光杂志写真，松弛、清透，3 个版本",
      context: imageContextForCompiler(),
      skill: skillSnapshot("builtin-portrait", "人物写真 Skill"),
      target: { count: 3 },
    })

    expect(compiled.summary).toBe("人物写真：3 个导演版本")
    expect(compiled.outputs).toHaveLength(3)
    expect(compiled.outputs[0].prompt).toContain("明确成年")
    expect(compiled.outputs[0].prompt).toContain("当前选中的图片")
    expect(compiled.outputs[0].prompt).toContain("人物调度")
    expect(compiled.outputs[0].sourceContextSnapshotId).toBe(
      "context-compiler-image"
    )
  })

  it("expands terse portrait requirements into concrete direction", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-portrait-terse",
      userInstruction:
        "成年女性，裙子、丸子头、微笑、镜头远景证件照",
      skill: skillSnapshot("builtin-portrait", "人物写真 Skill"),
      target: { count: 1 },
    })
    const prompt = compiled.outputs[0].prompt

    expect(prompt).toContain("用户要求的导演化扩写")
    expect(prompt).toContain("正式人物形象照用途")
    expect(prompt).toContain("远景景别")
    expect(prompt).toContain("裙装")
    expect(prompt).toContain("发型明确为丸子头")
    expect(prompt).toContain("眼轮匝肌")
  })

  it("compiles hand-drawn story beats into paired images and source-bound videos", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-handdrawn",
      userInstruction:
        "把一个女孩第一次独自搬家、整理房间并给家人报平安的故事做成 3 段手绘视频",
      skill: skillSnapshot(
        "builtin-handdrawn-video",
        "story-to-handdrawn-video"
      ),
      target: { count: 3, durationSeconds: 5, resolution: "720p" },
    })

    expect(compiled.summary).toBe("手绘故事视频：3 个叙事段落")
    expect(compiled.outputs.map((output) => output.variantKey)).toEqual([
      "handdrawn-scene-01-image",
      "handdrawn-scene-01-video",
      "handdrawn-scene-02-image",
      "handdrawn-scene-02-video",
      "handdrawn-scene-03-image",
      "handdrawn-scene-03-video",
    ])
    expect(compiled.outputs[0]).toMatchObject({ width: 720, height: 960 })
    expect(compiled.outputs[0].prompt).toContain("单色线稿")
    expect(compiled.outputs[1].prompt).toContain("文字出现")
    expect(compiled.outputs[1].prompt).toContain("逐步上色")
    expect(compiled.outputs[1].prompt).toContain("本工具当前配置的视频模型")
  })

  it("compiles poem lines into paired 9:16 stills and videos", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-poem",
      userInstruction: "《静夜思》李白\n床前明月光，疑是地上霜。\n举头望明月，低头思故乡。",
      skill: skillSnapshot("builtin-classical-poem-silk-video", "古诗词丝绸视频 Skill"),
      target: { count: 2, durationSeconds: 5, resolution: "1080p" },
    })
    expect(compiled.outputs.map((output) => output.variantKey)).toEqual([
      "poem-scene-01-image",
      "poem-scene-01-video",
      "poem-scene-02-image",
      "poem-scene-02-video",
    ])
    expect(compiled.outputs[0]).toMatchObject({ width: 1080, height: 1920 })
    expect(compiled.outputs[1]).toMatchObject({ mediaType: "video", durationSeconds: 5 })
    expect(compiled.outputs[0].prompt).toContain("丝绸")
  })

  it("compiles Antibes as original pen illustration images", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-antibes",
      userInstruction: "画一位在海边骑自行车的旅人",
      skill: skillSnapshot("builtin-antibes-holiday", "Antibes Holiday"),
    })
    expect(compiled.outputs[0].mediaType).toBe("image")
    expect(compiled.outputs[0].prompt).toContain("pen life")
    expect(compiled.outputs[0].negativePrompt).toContain("光滑矢量线")
  })

  it("compiles still-image motion as one source-bound video", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-motion-director",
      userInstruction: "让这张图片有克制的呼吸感",
      context: imageContextForCompiler(),
      skill: skillSnapshot("builtin-still-image-motion-director", "静态图运镜导演 Skill"),
    })
    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "video",
      operation: "animate",
      sourceContextSnapshotId: "context-compiler-image",
      durationSeconds: 4,
    })
    expect(compiled.outputs[0].prompt).toContain("一个主运动")
  })

  it("compiles a single 4:5 brand sticker product photo", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-brand-sticker",
      userInstruction: "品牌名称：ASUI，背景色：薄荷绿，使用纯文字字标",
      skill: skillSnapshot("builtin-brand-sticker-photo", "品牌贴纸写真 Skill"),
    })
    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      width: 1024,
      height: 1280,
      variantKey: "brand-sticker-photo",
    })
    expect(compiled.outputs[0].prompt).toContain("单个完整")
    expect(compiled.outputs[0].negativePrompt).toContain("矩形底板")
  })

  it("compiles an official brand sticker graphic instead of a wordmark", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-brand-sticker-official-icon",
      sourceInstruction: [
        "品牌名称：美团",
        "背景色：白色",
        "Logo 依据：使用官方品牌图标，根据品牌名称识别公开且稳定的官方主图形",
      ].join("\n"),
      userInstruction: [
        "美团官方主图形为黄色底色上的黑色袋鼠剪影，轮廓完整且具有明确负空间。",
        "保留袋鼠头部、耳朵和尾部的识别关系。",
      ].join("\n"),
      skill: skillSnapshot("builtin-brand-sticker-photo", "品牌贴纸写真 Skill"),
    })

    expect(compiled.outputs[0].prompt).toContain("官方主图形识别模式")
    expect(compiled.outputs[0].prompt).toContain("袋鼠剪影")
    expect(compiled.outputs[0].prompt).not.toContain("用户已确认使用纯文字字标")
  })

  it("compiles a source-bound square metal Logo sculpture", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-metal-logo",
      userInstruction: "品牌名称：ASUI，背景色：深灰，金属颜色：枪灰色",
      context: imageContextForCompiler(),
      skill: skillSnapshot(
        "builtin-metal-logo-sculpture",
        "generate-metal-logo-sculpture"
      ),
    })
    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      width: 1024,
      height: 1024,
      variantKey: "metal-logo-sculpture",
      sourceContextSnapshotId: "context-compiler-image",
    })
    expect(compiled.outputs[0].prompt).toContain("宽倒角")
    expect(compiled.outputs[0].prompt).toContain("微装配缝")
    expect(compiled.outputs[0].prompt).toContain("x=128–896")
    expect(compiled.outputs[0].prompt).toContain("不向背景投射阴影")
    expect(compiled.outputs[0].negativePrompt).toContain("整体镜面铬")
  })

  it("compiles an official graphical brand icon without degrading to a wordmark", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-metal-logo-official-icon",
      sourceInstruction: [
        "品牌名称：拼多多",
        "背景色：浅灰",
        "金属颜色：红色",
        "Logo 依据：使用官方品牌图标",
      ].join("\n"),
      userInstruction: [
        "官方主图形为红白分区的圆角心形应用图标。",
        "中央保留清晰的‘拼’字内部符号和对称负空间。",
      ].join("\n"),
      skill: skillSnapshot(
        "builtin-metal-logo-sculpture",
        "generate-metal-logo-sculpture"
      ),
    })

    expect(compiled.outputs[0]).toMatchObject({
      width: 1024,
      height: 1024,
      sourceContextSnapshotId: undefined,
    })
    expect(compiled.outputs[0].prompt).toContain("官方主图形")
    expect(compiled.outputs[0].prompt).toContain("红白分区")
    expect(compiled.outputs[0].prompt).toContain("负空间")
    expect(compiled.outputs[0].prompt).not.toContain("用户已确认使用纯文字字标")
    expect(compiled.outputs[0].prompt).not.toContain("逐字排印品牌名称")
  })

  it("keeps the explicit metal Logo wordmark fallback", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-metal-logo-wordmark",
      userInstruction: [
        "品牌名称：ASUI",
        "背景色：深灰",
        "金属颜色：枪灰色",
        "Logo 依据：使用纯文字字标",
      ].join("\n"),
      skill: skillSnapshot(
        "builtin-metal-logo-sculpture",
        "generate-metal-logo-sculpture"
      ),
    })

    expect(compiled.outputs[0].prompt).toContain("用户已确认使用纯文字字标")
    expect(compiled.outputs[0].prompt).not.toContain("官方主图形识别模式")
  })

  it("compiles a square playful App icon without unrelated canvas references", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-playful-icon",
      userInstruction: "为一个帮助用户专注 25 分钟并减少分心的 App 设计 iOS 图标",
      context: imageContextForCompiler(),
      skill: skillSnapshot(
        "builtin-design-playful-app-icons",
        "design-playful-app-icons"
      ),
    })
    expect(compiled.outputs).toHaveLength(1)
    expect(compiled.outputs[0]).toMatchObject({
      mediaType: "image",
      operation: "create",
      width: 1024,
      height: 1024,
      variantKey: "playful-app-icon-create",
      sourceContextSnapshotId: undefined,
    })
    expect(compiled.outputs[0].prompt).toContain("三个在产品隐喻或外轮廓上真正不同的方向")
    expect(compiled.outputs[0].prompt).toContain("主体占画布 70%–85%")
    expect(compiled.outputs[0].prompt).toContain("32px")
    expect(compiled.outputs[0].prompt).toContain("不烘焙圆角蒙版")
    expect(compiled.outputs[0].negativePrompt).toContain("现有 App 图标")
  })

  it("binds the selected image only for an explicit App icon refinement", () => {
    const compiled = compileGenerationPrompt({
      taskId: "task-playful-icon-refine",
      userInstruction: "把当前图标优化成更清晰的 Android 专注计时器图标",
      context: imageContextForCompiler(),
      skill: skillSnapshot(
        "builtin-design-playful-app-icons",
        "design-playful-app-icons"
      ),
    })
    expect(compiled.outputs[0]).toMatchObject({
      variantKey: "playful-app-icon-refine",
      sourceContextSnapshotId: "context-compiler-image",
    })
    expect(compiled.outputs[0].prompt).toContain("当前选中的图标只用于")
    expect(compiled.outputs[0].prompt).toContain("自适应图标")
  })
})
