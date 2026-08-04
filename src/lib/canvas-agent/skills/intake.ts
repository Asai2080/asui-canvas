import type { TextModelConversationMessage } from "../adapters/text-model"
import type { CanvasContextSnapshot } from "../context/schema"
import type {
  AgentChoiceGroup,
  AgentInterpretation,
} from "../task-schema"
import {
  isCanvas3dStickerSkillName,
  isCoverSkillName,
  isHanddrawnVideoSkillName,
  isImageTo3dSkillName,
  isIanXiaoheiSkillName,
  isPortraitSkillName,
  isSocialCardSkillName,
  isStoryboardSkillName,
  isWorldSkillName,
} from "./identifiers"
import {
  extractCoverMainTitle,
  extractCoverTopic,
  inferCoverTitle,
  removeCoverMainTitle,
} from "./cover-copy"
import type { SkillSnapshot } from "./schema"

type ResolveBuiltinSkillIntakeInput = {
  userInstruction: string
  skill?: SkillSnapshot
  context?: CanvasContextSnapshot
  conversationHistory?: TextModelConversationMessage[]
  generationCapabilities?: {
    image: boolean
    video: boolean
  }
}

export type BuiltinSkillIntake = {
  resolvedInstruction: string
  clarification?: AgentInterpretation
}

function recentUserInstructions(
  history?: TextModelConversationMessage[]
): string[] {
  return (history ?? [])
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => message.content.trim())
    .filter(Boolean)
}

function combinedInstruction(
  userInstruction: string,
  history?: TextModelConversationMessage[]
) {
  const values = [...recentUserInstructions(history), userInstruction.trim()]
  return values
    .filter((value, index) => value && values.indexOf(value) === index)
    .join("\n")
}

function clarification(
  message: string,
  summary: string,
  instruction: string,
  choices?: {
    groups: AgentChoiceGroup[]
    submitLabel?: string
  }
): AgentInterpretation {
  return {
    message,
    summary,
    normalizedInstruction: instruction.trim(),
    intent: "conversation",
    source: "local-rules",
    choiceGroups: choices?.groups,
    choiceSubmitLabel: choices?.submitLabel,
    target: undefined,
  }
}

function choiceGroup(
  id: string,
  label: string,
  options: Array<{
    id: string
    label: string
    value?: string
    description?: string
    action?: "submit" | "open-settings"
  }>
): AgentChoiceGroup {
  return {
    id,
    label,
    options: options.map((option) => ({
      action: "submit",
      ...option,
    })),
  }
}

function missingCoverDetails(instruction: string) {
  const hasTitle = Boolean(extractCoverMainTitle(instruction))
  const explicitTopic = extractCoverTopic(instruction)
  const topic = removeCoverMainTitle(instruction)
    .replace(/gbro-cover-design|cover-design/gi, "")
    .replace(/封面\s*skill/gi, "")
    .replace(/\bskill\b/gi, "")
    .replace(
      /使用|调用|用|这个|帮我|请|生成|制作|做|一张|封面|图片|设计|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
      ""
    )
    .replace(/[\s，。！？、,.!?:：；;“”"'《》「」]/g, "")
  return {
    topic: !explicitTopic && topic.length < 2,
    title: !hasTitle,
  }
}

function normalizeCoverInstruction(
  resolvedInstruction: string,
  userInstruction: string,
  history?: TextModelConversationMessage[]
) {
  if (!missingCoverDetails(resolvedInstruction).title) {
    return resolvedInstruction
  }
  const title = [
    ...recentUserInstructions(history),
    userInstruction.trim(),
  ]
    .map((instruction) => inferCoverTitle(instruction))
    .find(Boolean)
  return title ? `${resolvedInstruction}\n主标题：${title}` : resolvedInstruction
}

const COVER_STYLES = [
  [1, "深色渐变风", "高对比、强冲击，适合观点与情绪主题"],
  [2, "纯色扁平风", "轮廓干净，适合清爽直接的信息"],
  [3, "产品主视觉风", "突出产品、UI 或品牌核心素材"],
  [4, "对比卡片风", "适合前后、好坏与方案对照"],
  [5, "极简留白风", "让标题成为视觉锤，克制清楚"],
  [6, "海报拼贴风", "适合多张参考素材与丰富信息"],
  [7, "人物侧置留白风", "人物偏侧，标题区完整大气"],
  [8, "背影构图风", "使用环境和姿态制造代入感"],
  [9, "局部出镜风", "让手部、产品或文字成为主角"],
  [10, "正面对视风", "人物直视镜头，建立直接连接"],
] as const

type CoverStyle = (typeof COVER_STYLES)[number]

function coverAssistantAsked(
  history: TextModelConversationMessage[] | undefined,
  round: 1 | 2 | 3
) {
  return (history ?? []).some(
    (message) =>
      message.role === "assistant" &&
      message.content.includes(`第 ${round} 轮 / 3`)
  )
}

function coverRecommendedStyles(instruction: string): CoverStyle[] {
  if (/产品|商品|UI|界面|软件|应用|品牌|功能|教程|Skill/i.test(instruction)) {
    return [COVER_STYLES[9], COVER_STYLES[5]]
  }
  if (/对比|前后|之前|之后|好坏|方案|PK|vs/i.test(instruction)) {
    return [COVER_STYLES[3], COVER_STYLES[5]]
  }
  if (/人物|人像|作者|博主|写真/i.test(instruction)) {
    return [COVER_STYLES[6], COVER_STYLES[9]]
  }
  if (/极简|留白|情绪|生活|治愈|散文/i.test(instruction)) {
    return [COVER_STYLES[4], COVER_STYLES[6]]
  }
  return [COVER_STYLES[9], COVER_STYLES[4]]
}

function coverCandidateTitles(instruction: string) {
  const confirmed = extractCoverMainTitle(instruction)
  const topic = extractCoverTopic(instruction) ?? removeCoverMainTitle(instruction)
  const candidates = new Set<string>()

  if (confirmed) candidates.add(confirmed)

  if (/Skill|技能|教程|工作流/i.test(topic)) {
    candidates.add("把 Skill 用起来")
    candidates.add("Skill 实战指南")
  } else if (/春|春季|春日/i.test(topic)) {
    candidates.add("春日上新")
    candidates.add("设计新章")
  } else if (/新品|产品|上新|发布/i.test(topic)) {
    candidates.add("新品正当时")
    candidates.add("一眼看懂新品")
  } else if (/人物|人像|写真|肖像/i.test(topic)) {
    candidates.add("人物新视角")
    candidates.add("镜头里的故事")
  } else {
    const compactTopic = topic
      .replace(/gbro-cover-design|cover-design|封面\s*skill|\bskill\b/gi, "")
      .replace(
        /使用|调用|用|这个|帮我|请|生成|制作|做|一张|封面|图片|设计|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
        ""
      )
      .replace(/[\s，。！？、,.!?:：；;“”"'《》「」]/g, "")
      .slice(0, 8)
    if (compactTopic.length >= 2) candidates.add(compactTopic)
  }

  return [...candidates].slice(0, 3)
}

function coverCandidateTitleList(instruction: string) {
  const candidates = coverCandidateTitles(instruction)
  if (candidates.length === 0) {
    return "候选标题：我会同时给出 1 至 3 个 4 至 8 字选项。"
  }
  return `候选标题：\n${candidates
    .map((candidate, index) => `${index + 1}. ${candidate}`)
    .join("\n")}`
}

function coverStyleByNumber(number: number) {
  return COVER_STYLES.find(([value]) => value === number)
}

function extractCoverStyle(
  instruction: string,
  userInstruction: string,
  history?: TextModelConversationMessage[]
) {
  const named = COVER_STYLES.find(([, name]) => instruction.includes(name))
  if (named) return named

  // Rebuild the round-one choice from persisted user answers. Task recovery
  // may retain the answers even when the assistant's round marker is absent.
  const accumulatedChoice = instruction.match(
    /(?:^|\n)\s*(10|[1-9])(?:\s*[\/／|、，,。.：:]\s*|\s+)(?=(?:主标题|标题)\s*[:：])/i
  )?.[1]
  if (accumulatedChoice) {
    return coverStyleByNumber(Number(accumulatedChoice))
  }

  if (coverAssistantAsked(history, 1)) {
    const explicitNumber = userInstruction.match(
      /^\s*(10|[1-9])(?:\s|[、，,。.：:]|$)/
    )?.[1]
    if (explicitNumber) {
      return coverStyleByNumber(Number(explicitNumber))
    }
    if (/按推荐|用推荐|推荐的|你推荐|交给你|你决定/i.test(userInstruction)) {
      const assistantRecommendation = [...(history ?? [])]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" &&
            message.content.includes("第 1 轮 / 3")
        )
        ?.content.match(/推荐[^\n]*?(10|[1-9])\s*([^\s，。；;]+)/)?.[1]
      return coverStyleByNumber(
        Number(assistantRecommendation ?? coverRecommendedStyles(instruction)[0][0])
      )
    }
  }
  return undefined
}

function appendCoverStyle(instruction: string, style?: CoverStyle) {
  if (!style || /构图风格[:：]/.test(instruction)) return instruction
  return `${instruction}\n构图风格：${style[0]} ${style[1]}`
}

function hasCoverReferenceDecision(instruction: string) {
  return /当前选中|选中的.{0,8}(?:图片|人物|产品|素材)|图\s*1|参考图|人脸参考|人物外观|没有.{0,8}(?:其他|额外|参考|素材)|无.{0,8}(?:其他|额外|参考|素材)|不需要.{0,8}(?:人物|参考|素材)|不使用人物|纯文字封面|产品图|UI\s*截图|品牌素材/i.test(
    instruction
  )
}

function coverVisualAnswer(
  userInstruction: string,
  history?: TextModelConversationMessage[],
  accumulatedInstruction = userInstruction
) {
  const explicitExpression = accumulatedInstruction.match(
    /人物表情(?:选择)?\s*(?:[:：]\s*)?([^\n，。；;]+)/i
  )?.[1]
  const explicitBackground = accumulatedInstruction.match(
    /背景(?:色调)?\s*(?:[:：]\s*)?([^\n，。；;]+)/i
  )?.[1]
  const explicitFont = accumulatedInstruction.match(
    /字体\s*(?:[:：]\s*)?([^\n，。；;]+)/i
  )?.[1]
  const explicitEffect = accumulatedInstruction.match(
    /文字效果\s*(?:[:：]\s*)?([^\n，。；;]+)/i
  )?.[1]
  if (
    explicitExpression &&
    explicitBackground &&
    explicitFont &&
    explicitEffect
  ) {
    return {
      expression: explicitExpression.trim(),
      background: explicitBackground.trim(),
      font: explicitFont.trim(),
      effect: explicitEffect.trim(),
    }
  }

  const assistantAskedRoundThree = coverAssistantAsked(history, 3)
  const canRecoverRoundThree =
    /构图风格\s*[:：]/.test(accumulatedInstruction) &&
    hasCoverReferenceDecision(accumulatedInstruction)
  if (!assistantAskedRoundThree && !canRecoverRoundThree) return undefined
  const answer = userInstruction.trim()
  if (!answer) return undefined
  if (/按推荐|用推荐|交给模型|你决定|全部默认/i.test(answer)) {
    return {
      expression: "8 交给模型决定",
      background: "6 交给模型决定",
      font: "7 交给模型决定",
      effect: "5 交给模型决定",
    }
  }
  const values = answer
    .split(/\s*[\/／|]\s*/)
    .map((value) => value.match(/\d+/)?.[0])
    .filter(Boolean)
  if (values.length >= 4) {
    return {
      expression: values[0]!,
      background: values[1]!,
      font: values[2]!,
      effect: values[3]!,
    }
  }
  if (!assistantAskedRoundThree) return undefined
  return {
    expression: answer,
    background: "6 交给模型决定",
    font: "7 交给模型决定",
    effect: "5 交给模型决定",
  }
}

function appendCoverVisualAnswer(
  instruction: string,
  answer?: ReturnType<typeof coverVisualAnswer>
) {
  if (!answer || /人物表情[:：]/.test(instruction)) return instruction
  return [
    instruction,
    `人物表情：${answer.expression}`,
    `背景：${answer.background}`,
    `字体：${answer.font}`,
    `文字效果：${answer.effect}`,
  ].join("\n")
}

function coverStyleMenu() {
  return COVER_STYLES.map(
    ([number, name, description]) => `${number} ${name}：${description}`
  ).join("\n")
}

function coverStyleChoices() {
  return choiceGroup(
    "cover-style",
    "构图风格",
    COVER_STYLES.map(([number, name, description]) => ({
      id: `cover-style-${number}`,
      label: `${number} ${name}`,
      value: `${number}`,
      description,
    }))
  )
}

function coverTitleChoices(instruction: string) {
  const candidates = coverCandidateTitles(instruction)
  return choiceGroup(
    "cover-title",
    "主标题",
    candidates.map((candidate, index) => ({
      id: `cover-title-${index + 1}`,
      label: candidate,
      value: `主标题：${candidate}`,
    }))
  )
}

function coverReferenceChoices(hasSelectedImage: boolean) {
  return choiceGroup("cover-reference", "参考素材", [
    ...(hasSelectedImage
      ? [
          {
            id: "cover-reference-selected-only",
            label: "使用当前图片",
            value: "使用当前选中图片作为图1，没有其他素材",
            description: "当前选图作为人物或核心视觉参考",
          },
        ]
      : [
          {
            id: "cover-reference-none",
            label: "无人物无素材",
            value: "无人物，没有其他素材",
            description: "使用标题、图形和原创视觉完成封面",
          },
          {
            id: "cover-reference-model-person",
            label: "原创人物",
            value: "不使用人物参考图，由模型创作成年人物，没有其他素材",
            description: "人物不锁定真实身份",
          },
        ]),
  ])
}

function coverVisualChoices(style: CoverStyle) {
  const expressionOptions =
    style[0] === 8
      ? [
          {
            id: "cover-expression-skip",
            label: "背影构图，跳过",
            value: "8",
          },
        ]
      : [
          ["1", "捂嘴惊讶"],
          ["2", "张嘴震惊"],
          ["3", "开心大笑"],
          ["4", "兴奋雀跃"],
          ["5", "自信得意"],
          ["6", "托腮思考"],
          ["7", "推荐种草感"],
          ["8", "交给模型"],
        ].map(([value, label]) => ({
          id: `cover-expression-${value}`,
          label,
          value,
        }))
  const backgroundOptions = (
    style[0] === 5 || style[0] === 7
      ? [
          ["1", "浅色"],
          ["3", "暖色"],
          ["4", "冷色"],
          ["6", "交给模型"],
        ]
      : [
          ["1", "浅色"],
          ["2", "深色"],
          ["3", "暖色"],
          ["4", "冷色"],
          ["5", "高饱和撞色"],
          ["6", "交给模型"],
        ]
  ).map(([value, label]) => ({
    id: `cover-background-${value}`,
    label,
    value,
  }))
  return [
    choiceGroup("cover-expression", "人物表情", expressionOptions),
    choiceGroup("cover-background", "背景色调", backgroundOptions),
    choiceGroup(
      "cover-font",
      "字体",
      [
        ["1", "超粗黑体"],
        ["2", "柔和圆体"],
        ["3", "手写涂鸦体"],
        ["4", "极简无衬线"],
        ["5", "复古宋体"],
        ["6", "狗哥风格字体"],
        ["7", "交给模型"],
      ].map(([value, label]) => ({
        id: `cover-font-${value}`,
        label,
        value,
      }))
    ),
    choiceGroup(
      "cover-text-effect",
      "文字效果",
      [
        ["1", "纯白"],
        ["2", "纯黑"],
        ["3", "渐变色"],
        ["4", "描边效果"],
        ["5", "交给模型"],
      ].map(([value, label]) => ({
        id: `cover-text-effect-${value}`,
        label,
        value,
      }))
    ),
  ]
}

function coverClarification(
  instruction: string,
  userInstruction: string,
  history?: TextModelConversationMessage[],
  context?: CanvasContextSnapshot
) {
  const missing = missingCoverDetails(instruction)
  if (missing.topic || missing.title) {
    const request =
      missing.topic && missing.title
        ? "请先告诉我封面的主题或核心内容，以及要放在画面上的主标题（建议 4 至 12 字）。"
        : missing.topic
          ? "主标题我记下了。还需要你告诉我这张封面要表达的主题或核心内容。"
          : "主题我记下了。请再告诉我要放在画面上的主标题（建议 4 至 12 字）。"
    return clarification(
      [
        "【封面 Skill · 第 1 轮 / 3】风格与标题",
        request,
        "固定使用 3:4 竖版。收到主题和标题后，我会立即返回可点击的构图风格与候选标题。",
      ].join("\n\n"),
      "封面信息待补充",
      instruction
    )
  }

  const style = extractCoverStyle(instruction, userInstruction, history)
  if (!style) {
    const recommendations = coverRecommendedStyles(instruction)
      .map(
        ([number, name, description]) =>
          `${number} ${name}：${description}`
      )
      .join("\n")
    return clarification(
      [
        "【封面 Skill · 第 1 轮 / 3】风格与标题",
        `根据当前内容，我推荐：\n${recommendations}`,
        coverCandidateTitleList(instruction),
        "完整风格表：",
        coverStyleMenu(),
        "请一次回复风格编号或名称，以及最终主标题；回复“按推荐”会采用第一项推荐和当前标题。",
      ].join("\n\n"),
      "封面风格待选择",
      instruction,
      {
        groups: [coverStyleChoices(), coverTitleChoices(instruction)],
        submitLabel: "确认风格与标题",
      }
    )
  }

  if (!hasCoverReferenceDecision(instruction)) {
    const selectedImageMessage = hasUsableSelectedImage(context)
      ? "当前选中的图片会作为图 1（人物或核心视觉参考）。"
      : "图 1：请上传人物参考图；如果不使用人物，请说明“无人物”，或直接描述人物性别与大致外观。"
    return clarification(
      [
        "【封面 Skill · 第 2 轮 / 3】参考素材",
        selectedImageMessage,
        "额外素材：是否还有产品图、UI 截图、品牌素材或其他参考图？有的话请说明每张内容；没有请回复“没有其他素材”。",
      ].join("\n\n"),
      "封面参考素材待确认",
      appendCoverStyle(instruction, style),
      {
        groups: [coverReferenceChoices(hasUsableSelectedImage(context))],
        submitLabel: "确认素材",
      }
    )
  }

  const visualAnswer = coverVisualAnswer(
    userInstruction,
    history,
    instruction
  )
  if (!visualAnswer) {
    const expression =
      style[0] === 8
        ? "A. 当前为背影构图，跳过人物表情。"
        : "A. 人物表情：1 捂嘴惊讶 / 2 张嘴震惊 / 3 开心大笑 / 4 兴奋雀跃 / 5 自信得意 / 6 托腮思考 / 7 推荐种草感 / 8 交给模型"
    const background =
      style[0] === 5 || style[0] === 7
        ? "B. 背景色调：本风格默认浅色系；可回复 1 浅色 / 3 暖色 / 4 冷色 / 6 交给模型"
        : "B. 背景色调：1 浅色 / 2 深色 / 3 暖色 / 4 冷色 / 5 高饱和撞色 / 6 交给模型"
    return clarification(
      [
        "【封面 Skill · 第 3 轮 / 3】视觉细节",
        expression,
        background,
        "C. 字体：1 超粗黑体 / 2 柔和圆体 / 3 手写涂鸦体 / 4 极简无衬线 / 5 复古宋体 / 6 狗哥风格字体 / 7 交给模型",
        "D. 文字效果：1 纯白 / 2 纯黑 / 3 渐变色 / 4 描边效果 / 5 交给模型",
        "请按 A / B / C / D 一次回复，例如“6 / 4 / 1 / 4”；未指定项默认交给模型。也可以直接回复“按推荐”。",
      ].join("\n\n"),
      "封面视觉细节待选择",
      appendCoverStyle(instruction, style),
      {
        groups: coverVisualChoices(style),
        submitLabel: "确认视觉细节",
      }
    )
  }

  return undefined
}

function hasUsableSelectedImage(context?: CanvasContextSnapshot) {
  return Boolean(
    context?.sourceNode?.media?.mediaType === "image" &&
      context.sourceNode.media.referenceType === "url" &&
      context.sourceNode.media.src.trim()
  )
}

function imageTo3dClarification(
  instruction: string,
  context?: CanvasContextSnapshot
) {
  if (hasUsableSelectedImage(context)) return undefined
  return clarification(
    "请先在画布中选中一个已经有图片内容的图片画布，再发送四视角任务。空白画布、视频画布和文字画布不能作为结构参考。",
    "四视角输入待选择",
    instruction
  )
}

function storyboardClarification(
  instruction: string,
  context?: CanvasContextSnapshot
) {
  if (hasUsableSelectedImage(context)) return undefined
  return clarification(
    "分镜 Skill 需要一张有效参考图来锁定人物、场景、服装、道具和光线连续性。请先在画布中选中一个已经有图片内容的图片画布，再描述分镜主题；空白、文字和视频画布不能作为分镜身份参考。",
    "分镜参考图待选择",
    instruction
  )
}

function canvas3dStickerClarification(
  instruction: string,
  context?: CanvasContextSnapshot
) {
  if (hasUsableSelectedImage(context)) return undefined
  return clarification(
    "请先在画布中选中一个已经有图片内容的图片画布，再发送 3D 贴纸风格转换任务。我会保留主体身份与完整结构，自动判断单体、组合或微缩场景模式，并把透明 PNG 结果写入新的图片画布。",
    "3D 贴纸输入待选择",
    instruction
  )
}

function selectedText(context?: CanvasContextSnapshot) {
  const sourceText = context?.sourceNode?.text?.trim()
  if (sourceText) return sourceText
  return context?.connectedNodes
    .map((node) => node.text?.trim())
    .filter(Boolean)
    .join("\n")
}

function isIanImageRevision(instruction: string) {
  return /(?:这张|当前|选中|原图|图片|配图).{0,12}(?:修改|调整|重画|去掉|删除|移除|增强|加强|优化)|(?:去掉|删除|移除).{0,10}(?:标题|文字)|(?:增强|加强).{0,8}(?:荒诞|动作|小蓝滴)/i.test(
    instruction
  )
}

function ianXiaoheiIntake(
  instruction: string,
  context?: CanvasContextSnapshot
) {
  if (isIanImageRevision(instruction)) {
    if (hasUsableSelectedImage(context)) return undefined
    return clarification(
      "请先选中要修改的小蓝滴图片画布，再告诉我要移除标题、增强荒诞感或调整哪些内容。我会保留原图，并把修改结果写入新的图片画布。",
      "小蓝滴修改图片待选择",
      instruction
    )
  }

  const content = instruction
    .replace(/ian[-\s]?xiaohei[-\s]?illustrations/gi, "")
    .replace(/ian\s*小蓝滴配图|小蓝滴配图\s*skill/gi, "")
    .replace(/\bskill\b/gi, "")
    .replace(
      /使用|调用|用|这个|帮我|请|生成|制作|做|一套|几张|配图|插图|图片|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
      ""
    )
    .replace(/[\s，。！？、,.!?:：；;“”"'《》「」\d张个]/g, "")
  if (content.length >= 4 || selectedText(context)) return undefined
  return clarification(
    "请粘贴要配图的文章、观点、流程或方法论，也可以先选中一个文字画布。我会先提炼认知锚点并把原始内容优化成具体画面隐喻，再生成 1 至 9 张独立的 16:9 小蓝滴配图。",
    "小蓝滴配图内容待补充",
    instruction
  )
}

function missingWorldDetails(instruction: string) {
  const hasCameraMode =
    /飞行穿梭|穿梭|飞越|飞行|俯冲|推进|平视漫游|漫游|步行|游览|走进|固定视角|锁定视角|等距视角|运镜.{0,8}(?:交给你|你决定|自动选择|默认)/i.test(
      instruction
    )
  const topic = instruction
    .replace(/scroll-world/gi, "")
    .replace(/世界\s*skill/gi, "")
    .replace(/\bskill\b/gi, "")
    .replace(
      /飞行穿梭|穿梭|飞越|飞行|俯冲|推进|平视漫游|漫游|步行|游览|走进|固定视角|锁定视角|等距视角/gi,
      ""
    )
    .replace(
      /运镜.{0,8}(?:交给你|你决定|自动选择|默认)|使用|调用|用|这个|帮我|请|生成|制作|做|一个|连续|场景|世界|图片|视频|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
      ""
    )
    .replace(/[\s，。！？、,.!?:：；;“”"'《》「」]/g, "")
  return {
    topic: topic.length < 2,
    camera: !hasCameraMode,
  }
}

function worldClarification(instruction: string) {
  const missing = missingWorldDetails(instruction)
  if (!missing.topic && !missing.camera) return undefined

  const request =
    missing.topic && missing.camera
      ? "请告诉我想创建的世界主题或核心内容，并选择一种运镜感觉：飞行穿梭、平视漫游，或固定视角。"
      : missing.topic
        ? "运镜方式我记下了。还需要你告诉我这个世界的主题、核心内容或品牌故事。"
        : "世界主题我记下了。请选择运镜感觉：飞行穿梭、平视漫游，或固定视角；也可以直接说“运镜交给你”。"
  return clarification(
    `${request}场景数量可在输入框下方选择 3 至 6 个；未指定的美术风格、色彩和空间衔接由我统一规划。`,
    "世界规划信息待补充",
    instruction,
    missing.camera
      ? {
          groups: [
            choiceGroup("world-camera", "运镜方式", [
              {
                id: "world-camera-flythrough",
                label: "飞行穿梭",
                value: "飞行穿梭",
                description: "大幅度俯冲、拉升与跨场景飞越，适合微缩世界",
              },
              {
                id: "world-camera-walkthrough",
                label: "平视漫游",
                value: "平视漫游",
                description: "持续向前穿行，适合写实空间与建筑旅程",
              },
              {
                id: "world-camera-locked",
                label: "固定视角",
                value: "固定视角",
                description: "保持统一角度，最稳定、最克制",
              },
              {
                id: "world-camera-auto",
                label: "运镜交给你",
                value: "运镜交给你",
              },
            ]),
          ],
          submitLabel: "确认运镜",
        }
      : undefined
  )
}

function socialCardClarification(
  instruction: string,
  context?: CanvasContextSnapshot
) {
  const hasPlatform = /小红书|rednote|公众号|微信/i.test(instruction)
  const content = instruction
    .replace(/guizang-social-card-skill|social-card-skill/gi, "")
    .replace(/\bskill\b/gi, "")
    .replace(/小红书|rednote|公众号|微信|editorial|swiss|编辑视觉|瑞士视觉/gi, "")
    .replace(
      /使用|调用|用|这个|这套|帮我|请|生成|制作|做|一套|社交|卡片|图片|视觉系统|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
      ""
    )
    .replace(/[\s，。！？、,.!?:：；;“”"'《》「」\d张个]/g, "")
  const hasContent = content.length >= 4
  if (!hasPlatform || !hasContent) {
    const missing = [
      !hasPlatform ? "发布平台（小红书或微信公众号）" : "",
      !hasContent ? "文章、观点或核心内容" : "",
    ].filter(Boolean)
    return clarification(
      `请补充${missing.join("和")}。用户已经提供的标题、正文、张数和素材不用重复；视觉系统未指定时由我根据内容决定。`,
      "社交卡信息待补充",
      instruction,
      !hasPlatform
        ? {
            groups: [
              choiceGroup("social-platform", "发布平台", [
                {
                  id: "social-platform-rednote",
                  label: "小红书",
                  value: "小红书",
                  description: "3:4 独立卡片组",
                },
                {
                  id: "social-platform-wechat",
                  label: "微信公众号",
                  value: "微信公众号",
                  description: "横版封面与方形分享图",
                },
              ]),
            ],
            submitLabel: "确认平台",
          }
        : undefined
    )
  }

  const assetDecision =
    hasUsableSelectedImage(context) ||
    /上传|自有|自己的|当前选中|已有素材|现成素材|图片模型|AI\s*生成|生成配图|素材交给你|不用图片|无图片|纯排版|Pexels|Unsplash|Flickr/i.test(
      instruction
    )
  if (assetDecision) return undefined

  return clarification(
    [
      "【社交卡 Skill · 素材方式】",
      "内容和平台已经足够。当前没有选中的图片素材，这里只问这一次，请选择素材方式：",
      "A. 使用你上传或随后选中的图片（推荐）",
      "B. 使用工具当前配置的图片模型生成原创配图",
      "C. 不使用图片，采用纯文字与图形排版",
      "回复 A、B、C 或直接描述即可；确认后不会再次追问。",
    ].join("\n"),
    "社交卡素材方式待选择",
    instruction,
    {
      groups: [
        choiceGroup("social-assets", "素材方式", [
          {
            id: "social-assets-user",
            label: "A 使用我的图片",
            value: "A 使用我上传或随后选中的图片",
            description: "真实素材优先，最不容易产生 AI 感",
          },
          {
            id: "social-assets-generate",
            label: "B 原创配图",
            value: "B 使用工具当前配置的图片模型生成原创配图",
          },
          {
            id: "social-assets-type",
            label: "C 纯排版",
            value: "C 不使用图片，采用纯文字与图形排版",
          },
        ]),
      ],
      submitLabel: "确认素材方式",
    }
  )
}

function portraitClarification(
  instruction: string,
  userInstruction: string,
  context?: CanvasContextSnapshot,
  history?: TextModelConversationMessage[]
) {
  const portraitInstruction = instruction.replace(/人物写真\s*skill/gi, "")
  const latestExplicitAdult =
    /成年|成人|adult|已满\s*18\s*岁|年满\s*18\s*岁/i.test(
      userInstruction
    )
  const latestExplicitMinor =
    /未成年|儿童|小女孩|小男孩|幼儿|宝宝|婴儿|少年|少女|未满\s*18\s*岁/i.test(
      userInstruction
    )
  const hasExplicitMinorSubject = latestExplicitAdult
    ? false
    : latestExplicitMinor ||
    /未成年|儿童|小女孩|小男孩|幼儿|宝宝|婴儿|少年|少女|未满\s*18\s*岁/i.test(
      portraitInstruction
    )
  const hasAdultSubject =
    latestExplicitAdult ||
    (!hasExplicitMinorSubject &&
      /成年|成人|adult|\d{2}\s*岁|女生|男生|女士|男士|女性|男性|女人|男人/i.test(
        portraitInstruction
      ))
  const hasSubject =
    hasUsableSelectedImage(context) ||
    /女生|男生|女性|男性|女士|男士|女人|男人|模特|人物|肖像|女孩|男孩|裙|西装|衬衫|发型|丸子头|长发|短发/i.test(
      portraitInstruction
    )
  if (hasAdultSubject && hasSubject) {
    return undefined
  }

  const missing = [
    !hasAdultSubject ? "明确人物为成年人" : "",
    !hasSubject ? "写真人物或已授权的人物参考图" : "",
  ].filter(Boolean)
  const previouslyAskedForAdult = (history ?? []).some(
    (message) =>
      message.role === "assistant" && /成年|已满\s*18\s*岁/i.test(message.content)
  )
  const adultIsOnlyMissing = missing.length === 1 && !hasAdultSubject

  if (adultIsOnlyMissing) {
    return clarification(
      previouslyAskedForAdult
        ? "你补充的造型、用途、表情和镜头我都已经记下。目前仍只差年龄确认：请回复“成年女性”“成年男性”或“已满 18 岁”，我就继续整理写真方案。"
        : "造型、用途和镜头方向我已经记下。只差年龄确认：请明确人物为成年人，例如回复“成年女性”“成年男性”或“已满 18 岁”。",
      "写真年龄待确认",
      instruction,
      {
        groups: [
          choiceGroup("portrait-age", "年龄确认", [
            {
              id: "portrait-age-woman",
              label: "成年女性",
              value: "成年女性",
            },
            {
              id: "portrait-age-man",
              label: "成年男性",
              value: "成年男性",
            },
            {
              id: "portrait-age-adult",
              label: "已满 18 岁",
              value: "已满 18 岁",
            },
          ]),
        ],
        submitLabel: "确认年龄",
      }
    )
  }

  return clarification(
    `我会保留已经提供的信息，不需要重复。还请补充：${missing.join("、")}。未指定的场景、造型、动作、镜头与灯光会由我专业补全；如果当前选中的是已获授权的人物照片，我会保持身份一致。`,
    "写真方向待补充",
    instruction
  )
}

function handdrawnVideoClarification(
  instruction: string,
  context?: CanvasContextSnapshot
) {
  if (hasUsableSelectedImage(context)) return undefined
  const content = instruction
    .replace(/story-to-handdrawn-video|手绘故事视频\s*skill/gi, "")
    .replace(
      /使用|调用|用|这个|帮我|请|生成|制作|做成|一段|多段|手绘|故事|视频|动画|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
      ""
    )
    .replace(/[\s，。！？、,.!?:：；;“”"'《》「」\d个段]/g, "")
  if (content.length >= 8) return undefined
  return clarification(
    "请提供要改编的故事内容，或按播放顺序选中画布中的图片。完整句子会默认成为独立节拍，长复句只在自然叙事转折处拆分；我不会额外要求你决定段数。",
    "手绘故事信息待补充",
    instruction
  )
}

function capabilityClarification(
  skillName: string | undefined,
  instruction: string,
  capabilities?: ResolveBuiltinSkillIntakeInput["generationCapabilities"]
) {
  if (!capabilities) return undefined
  if (isWorldSkillName(skillName)) {
    const missing = [
      !capabilities.image ? "图片模型" : "",
      !capabilities.video ? "视频模型" : "",
    ].filter(Boolean)
    if (missing.length === 0) return undefined
    return clarification(
      `世界 Skill 需要同时生成场景图和分段视频。请先在设置中完成${missing.join("和")}的 API 配置，再重新发送这次任务；我不会先生成一半后再报错。`,
      "世界生成能力待配置",
      instruction,
      settingsChoice()
    )
  }
  if (isHanddrawnVideoSkillName(skillName)) {
    const missing = [
      !capabilities.image ? "图片模型" : "",
      !capabilities.video ? "视频模型" : "",
    ].filter(Boolean)
    if (missing.length === 0) return undefined
    return clarification(
      `手绘故事视频需要先生成分段图片，再生成对应动画。请先在设置中完成${missing.join("和")}的 API 配置，再重新发送任务。`,
      "手绘视频能力待配置",
      instruction,
      settingsChoice()
    )
  }
  if (
    (isCoverSkillName(skillName) ||
      isStoryboardSkillName(skillName) ||
      isImageTo3dSkillName(skillName) ||
      isSocialCardSkillName(skillName) ||
      isPortraitSkillName(skillName) ||
      isCanvas3dStickerSkillName(skillName) ||
      isIanXiaoheiSkillName(skillName)) &&
    !capabilities.image
  ) {
    return clarification(
      "这个 Skill 需要调用图片模型。请先在设置中完成图片模型的 Base URL、API Key 和模型配置，再重新发送这次任务。",
      "图片生成能力待配置",
      instruction,
      settingsChoice()
    )
  }
  return undefined
}

function settingsChoice() {
  return {
    groups: [
      choiceGroup("agent-settings", "下一步", [
        {
          id: "agent-settings-open",
          label: "打开 Agent 设置",
          value: "打开 Agent 设置",
          action: "open-settings",
        },
      ]),
    ],
    submitLabel: "继续",
  }
}

export function resolveBuiltinSkillIntake({
  userInstruction,
  skill,
  context,
  conversationHistory,
  generationCapabilities,
}: ResolveBuiltinSkillIntakeInput): BuiltinSkillIntake {
  let resolvedInstruction = combinedInstruction(
    userInstruction,
    conversationHistory
  )
  if (isCoverSkillName(skill?.name)) {
    resolvedInstruction = normalizeCoverInstruction(
      resolvedInstruction,
      userInstruction,
      conversationHistory
    )
    const style = extractCoverStyle(
      resolvedInstruction,
      userInstruction,
      conversationHistory
    )
    resolvedInstruction = appendCoverStyle(resolvedInstruction, style)
    resolvedInstruction = appendCoverVisualAnswer(
      resolvedInstruction,
      coverVisualAnswer(
        userInstruction,
        conversationHistory,
        resolvedInstruction
      )
    )
    const details = coverClarification(
      resolvedInstruction,
      userInstruction,
      conversationHistory,
      context
    )
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isImageTo3dSkillName(skill?.name)) {
    const details = imageTo3dClarification(resolvedInstruction, context)
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isStoryboardSkillName(skill?.name)) {
    const details = storyboardClarification(resolvedInstruction, context)
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isWorldSkillName(skill?.name)) {
    const details = worldClarification(resolvedInstruction)
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isSocialCardSkillName(skill?.name)) {
    const details = socialCardClarification(resolvedInstruction, context)
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isPortraitSkillName(skill?.name)) {
    const details = portraitClarification(
      resolvedInstruction,
      userInstruction,
      context,
      conversationHistory
    )
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isHanddrawnVideoSkillName(skill?.name)) {
    const details = handdrawnVideoClarification(resolvedInstruction, context)
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isCanvas3dStickerSkillName(skill?.name)) {
    const details = canvas3dStickerClarification(
      resolvedInstruction,
      context
    )
    return {
      resolvedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          resolvedInstruction,
          generationCapabilities
        ),
    }
  }
  if (isIanXiaoheiSkillName(skill?.name)) {
    const isolatedInstruction = [userInstruction.trim(), selectedText(context)]
      .filter(Boolean)
      .join("\n\n【选中文字画布】\n")
    const details = ianXiaoheiIntake(isolatedInstruction, context)
    return {
      resolvedInstruction: isolatedInstruction,
      clarification:
        details ??
        capabilityClarification(
          skill?.name,
          isolatedInstruction,
          generationCapabilities
        ),
    }
  }
  return { resolvedInstruction: userInstruction.trim() }
}
