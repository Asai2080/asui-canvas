import type { TextModelConversationMessage } from "../adapters/text-model"
import type { CanvasContextSnapshot } from "../context/schema"
import type { AgentInterpretation } from "../task-schema"
import {
  isCoverSkillName,
  isImageTo3dSkillName,
  isWorldSkillName,
} from "./identifiers"
import type { SkillSnapshot } from "./schema"

type ResolveBuiltinSkillIntakeInput = {
  userInstruction: string
  skill?: SkillSnapshot
  context?: CanvasContextSnapshot
  conversationHistory?: TextModelConversationMessage[]
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
    .slice(-4)
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
  instruction: string
): AgentInterpretation {
  return {
    message,
    summary,
    normalizedInstruction: instruction.trim(),
    intent: "conversation",
    source: "local-rules",
    target: undefined,
  }
}

function missingCoverDetails(instruction: string) {
  const titlePattern =
    /(?:主标题|标题|封面文案)(?:是|为|叫|[:：])?\s*[《“"'「]?[^》”"'」\n，。；;]{2,24}[》”"'」]?/i
  const hasTitle = titlePattern.test(instruction)
  const topic = instruction
    .replace(titlePattern, "")
    .replace(/gbro-cover-design|cover-design/gi, "")
    .replace(/封面\s*skill/gi, "")
    .replace(/\bskill\b/gi, "")
    .replace(
      /使用|调用|用|这个|帮我|请|生成|制作|做|一张|封面|图片|设计|一下|可以|需要|想要|我要|吧|呀|哟|的/gi,
      ""
    )
    .replace(/[\s，。！？、,.!?:：；;“”"'《》「」]/g, "")
  return {
    topic: topic.length < 2,
    title: !hasTitle,
  }
}

function coverClarification(instruction: string) {
  const missing = missingCoverDetails(instruction)
  if (!missing.topic && !missing.title) return undefined

  const request =
    missing.topic && missing.title
      ? "请先告诉我封面的主题或核心内容，以及要放在画面上的主标题（建议 4 至 12 字）。"
      : missing.topic
        ? "主标题我记下了。还需要你告诉我这张封面要表达的主题或核心内容。"
        : "主题我记下了。请再告诉我要放在画面上的主标题（建议 4 至 12 字）。"
  return clarification(
    `${request}如果有指定人物、产品、界面或品牌素材，也可以先选中对应图片；构图、配色和版式我来完成。`,
    "封面信息待补充",
    instruction
  )
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
    instruction
  )
}

export function resolveBuiltinSkillIntake({
  userInstruction,
  skill,
  context,
  conversationHistory,
}: ResolveBuiltinSkillIntakeInput): BuiltinSkillIntake {
  const resolvedInstruction = combinedInstruction(
    userInstruction,
    conversationHistory
  )
  if (isCoverSkillName(skill?.name)) {
    return {
      resolvedInstruction,
      clarification: coverClarification(resolvedInstruction),
    }
  }
  if (isImageTo3dSkillName(skill?.name)) {
    return {
      resolvedInstruction,
      clarification: imageTo3dClarification(resolvedInstruction, context),
    }
  }
  if (isWorldSkillName(skill?.name)) {
    return {
      resolvedInstruction,
      clarification: worldClarification(resolvedInstruction),
    }
  }
  return { resolvedInstruction: userInstruction.trim() }
}
