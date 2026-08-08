import { describe, expect, it } from "vitest"

import {
  buildUiCreativeBrief,
  buildUiPromptSpecification,
  isWeakUiCreativeBrief,
} from "./ui-spec"

describe("UI prompt specification", () => {
  it("turns a one-line mobile request into concrete product decisions", () => {
    const specification = buildUiPromptSpecification({
      originalGoal: "生成一个每天记录排便的 APP 首页，750x1624",
      width: 750,
      height: 1624,
    })

    expect(specification.prompt).toContain("日常排便与肠道状态记录 App")
    expect(specification.prompt).toContain("今天尚未记录")
    expect(specification.prompt).toContain("记录一次")
    expect(specification.prompt).toContain("最多三条近期记录")
    expect(specification.prompt).toContain("森林绿 #2F7D5B")
    expect(specification.prompt).toContain("安全区 x=48–702px，y=65–1527px")
    expect(specification.prompt).toContain("触控目标至少 88×88px")
    expect(specification.prompt).toContain("【设计推理与校准】")
    expect(specification.prompt).toContain("信息密度 5/10")
    expect(specification.prompt).toContain("【空间系统】")
    expect(specification.prompt).toContain("8 / 16 / 24 / 40 / 64 / 96px")
    expect(specification.prompt).toContain("屏幕左右外边距 48px")
    expect(specification.prompt).toContain("主区块间隔 32–40px")
    expect(specification.prompt).toContain("卡片内边距 24px")
    expect(specification.prompt).toContain("【留白与节奏】")
    expect(specification.prompt).toContain("至少保留 40% 可呼吸的背景区域")
    expect(specification.prompt).toContain("【图像模型渲染协议】")
    expect(specification.prompt).toContain("1px 低对比细边框或轻柔 soft shadow 二选一")
    expect(specification.prompt).toContain("不要把 hover、scroll reveal、stagger")
    expect(specification.prompt).toContain("默认、加载、成功、失败、空、禁用、选中和焦点状态")
    expect(specification.prompt).toContain("错误文案必须说明哪里错、为什么错、如何修复")
    expect(specification.prompt).toContain("焦点环不能被选中背景隐藏")
    expect(specification.prompt).toContain("不将每段文字、指标和图标都包成圆角卡片")
    expect(specification.prompt).toContain("暖白背景、深墨正文、森林绿主操作")
    expect(specification.prompt).toContain("参考图的颜色不可覆盖当前产品语义")
    expect(specification.prompt).not.toContain("35mm")
    expect(specification.prompt).not.toContain("景深变化")
    expect(specification.prompt.length).toBeLessThan(3_000)
  })

  it("uses a dense work architecture for a web dashboard", () => {
    const specification = buildUiPromptSpecification({
      originalGoal: "生成一个 SaaS 运营 dashboard，1440x1024",
      width: 1440,
      height: 1024,
    })

    expect(specification.prompt).toContain("Web 端")
    expect(specification.prompt).toContain("紧凑侧边导航")
    expect(specification.prompt).toContain("主数据表/任务列表")
    expect(specification.prompt).toContain("12 列栅格")
    expect(specification.prompt).toContain("4 / 8 / 12 / 16 / 24 / 32 / 48px")
    expect(specification.prompt).toContain("主区块间隔 24–32px")
    expect(specification.prompt).toContain("表格行高 44–48px")
    expect(specification.prompt).toContain("卡片圆角 6–8px")
    expect(specification.prompt).toContain("信息密度 8/10")
    expect(specification.prompt).not.toContain("四项底部导航")
  })

  it("expands a hydration homepage into domain-specific content", () => {
    const specification = buildUiPromptSpecification({
      originalGoal: "参考当前图片生成移动端每日饮水记录 App 首页，750x1624",
      width: 750,
      height: 1624,
    })

    expect(specification.prompt).toContain("每日饮水与补水节奏记录 App")
    expect(specification.prompt).toContain("1200 ml / 2000 ml")
    expect(specification.prompt).toContain("唯一主操作按钮写“记录一杯”")
    expect(specification.prompt).toContain("主区块间隔 32–40px")
    expect(specification.prompt).toContain("列表行内间隔 16px")
    expect(specification.prompt).not.toContain("唯一主操作按钮写“开始操作”")
  })

  it("keeps an authentication page from being overwritten by its product domain", () => {
    const specification = buildUiPromptSpecification({
      originalGoal:
        "参考这张图片的设计风格，帮我生成一张记录排便 App 的登录页，严格参考我给你的参考图，750x1624",
      professionalBrief: [
        "【参考图分析】参考图是年轻化移动端登录页；上半区使用薄荷绿渐变、粗黑居中标题与双角色插画，下半区使用一枚高对比主按钮和四枚等宽次级登录按钮，底部放协议文字；大留白、胶囊按钮、圆形品牌图标与轻灰表面构成主要视觉语言。",
        "【UI 产品定义】日常排便记录 App，面向希望轻松记录健康状态的成年人；本屏只负责选择登录方式并进入账户。",
        "【当前状态】首次打开，尚未登录，未填写手机号。",
        "【可见内容与顺序】品牌欢迎语；友好角色插画；登录方式按钮组；协议与隐私入口。",
        "【准确短文案】“轻松记录，从今天开始”“手机号登录”“其他登录方式”“用户协议”“隐私政策”。",
        "【设计系统】迁移参考图的薄荷绿渐变、粗黑圆润标题、双角色插画、黑色主按钮、浅灰胶囊次级按钮、统一圆形图标和宽松垂直节奏。",
        "【画布与可用性】严格 750x1624，全部按钮位于安全区。",
        "【禁止】首页、数据卡片、趋势图、底部导航、设备外壳。",
      ].join("\n"),
      width: 750,
      height: 1624,
    })

    expect(specification.prompt).toContain("【参考图视觉拆解与迁移】")
    expect(specification.prompt).toContain("薄荷绿渐变")
    expect(specification.prompt).toContain("登录方式并进入账户")
    expect(specification.prompt).toContain("手机号登录")
    expect(specification.prompt).toContain("协议与隐私入口")
    expect(specification.prompt).not.toContain("今日尚未记录")
    expect(specification.prompt).not.toContain("最多三条近期记录")
    expect(specification.prompt).not.toContain("近 7 天趋势")
    expect(specification.prompt).not.toContain("首页 / 记录 / 趋势 / 我的")
  })

  it("keeps a freelancer finance homepage within a restrained single-screen budget", () => {
    const specification = buildUiPromptSpecification({
      originalGoal: "生成一个面向自由职业者的移动端项目收支首页，750x1624",
      professionalBrief: [
        "【UI 产品定义】自由职业者财务 App。",
        "【当前状态】本月净结余 ¥21,360。",
        "【可见内容与顺序】大号净结余；两个主按钮；四条项目；三条流水；底部导航。",
        "【准确短文案】“创建项目”“近期流水”“查看全部”。",
        "【设计系统】通用蓝色 SaaS 数据卡片。",
        "【画布与可用性】750x1624。",
        "【禁止】无。",
      ].join("\n"),
      width: 750,
      height: 1624,
    })

    expect(specification.prompt).toContain("自由职业者项目收支管理 App")
    expect(specification.prompt).toContain("不使用占满画面的单一大金额")
    expect(specification.prompt).toContain("最多三条活跃项目")
    expect(specification.prompt).toContain("主区块间隔 24–32px")
    expect(specification.prompt).toContain("图标与文字间隔 12px")
    expect(specification.prompt).toContain("“首页 / 项目 / 流水 / 我的”")
    expect(specification.prompt).not.toContain("两个主按钮")
    expect(specification.prompt).not.toContain("四条项目")
    expect(specification.prompt).not.toContain("“创建项目”")
  })

  it("rejects generic UI prose and accepts an auditable UI brief", () => {
    expect(
      isWeakUiCreativeBrief("现代简洁，高质量，高级感，层级清晰，组件统一")
    ).toBe(true)

    const brief = buildUiCreativeBrief(
      "生成一个移动端记账 App 首页，尺寸 750x1624",
      750,
      1624
    )
    expect(isWeakUiCreativeBrief(brief)).toBe(false)
  })

  it("preserves useful user style decisions without duplicating a long brief", () => {
    const originalGoal =
      "生成一个编辑排版风格的记账 App 首页，750x1624，使用黑白和荧光绿"
    const specification = buildUiPromptSpecification({
      originalGoal,
      professionalBrief: [
        "【UI 产品定义】个人记账 App，面向希望快速掌握预算的用户；本屏任务是查看余额并记一笔。",
        "【当前状态】本月支出 ¥3,286，预算剩余 ¥2,714。",
        "【可见内容与顺序】顶部月份；预算摘要；主操作；最近四条交易；底部导航。",
        "【准确短文案】“本月账单”“记一笔”“最近交易”“查看全部”。",
        "【设计系统】采用瑞士国际主义编辑排版，非对称栅格，黑白为基础，荧光绿只用于主操作与选中状态。",
        "【画布与可用性】严格 750x1624，左右 48px 安全区。",
        "【禁止】设备样机、内容截断、渐变和装饰性 3D。",
      ].join("\n"),
      width: 750,
      height: 1624,
    })

    expect(specification.prompt).toContain("瑞士国际主义编辑排版")
    expect(specification.prompt).toContain("荧光绿只用于主操作")
    expect(specification.prompt.match(/瑞士国际主义编辑排版/g)).toHaveLength(1)
    expect(specification.prompt).toContain(originalGoal)
    expect(specification.prompt).not.toContain("【UI 产品定义】")
    expect(specification.prompt.length).toBeLessThan(3_000)
  })
})
