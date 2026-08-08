import type { AgentTask, CompiledPrompt } from "../task-schema"
import { isImageTo3dVariantKey } from "../skills/identifiers"
import { canvasCommandBridge, type CanvasCommandBridge } from "./bridge"
import {
  agentCanvasCommandBatchSchema,
  type CanvasCommandBounds,
  type CanvasOccupiedBounds,
} from "./schema"
import { offsetBoundsGroupToAvoidOverlaps } from "./layout"

type WriteAgentPromptToCanvasInput = {
  task: AgentTask
  sourceBounds?: CanvasCommandBounds
  viewportBounds: CanvasCommandBounds
  occupiedBounds?: CanvasOccupiedBounds[]
}

type WriteAgentPromptToCanvasDependencies = {
  publish?: CanvasCommandBridge["publish"]
  now?: () => string
}

function promptContent(compiledPrompt: CompiledPrompt) {
  const outputSections = compiledPrompt.outputs.map((output, index) => {
    const label =
      compiledPrompt.outputs.length > 1
        ? `生成提示词 ${index + 1}`
        : "生成提示词"
    return [
      `## ${label}`,
      output.prompt,
      output.negativePrompt
        ? `\n### 避免内容\n${output.negativePrompt}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
  })

  return [
    `# ${compiledPrompt.summary}`,
    compiledPrompt.originalGoal
      ? `## 用户目标\n${compiledPrompt.originalGoal}`
      : "",
    ...outputSections,
    compiledPrompt.sharedConstraints.length > 0
      ? `## 统一约束\n${compiledPrompt.sharedConstraints
          .map((constraint) => `- ${constraint}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function isImageTo3dPrompt(compiledPrompt: CompiledPrompt) {
  return compiledPrompt.outputs.some(
    (output) => isImageTo3dVariantKey(output.variantKey)
  )
}

function promptNodeTitle(compiledPrompt: CompiledPrompt) {
  if (compiledPrompt.summary.startsWith("画布 3D 贴纸")) {
    return "3D 贴纸转换规格"
  }
  if (compiledPrompt.summary.startsWith("Ian 小蓝滴")) {
    return "小蓝滴配图方案"
  }
  if (compiledPrompt.summary.includes("社交卡")) return "社交卡编排方案"
  if (compiledPrompt.summary.startsWith("人物写真")) return "人物写真导演方案"
  if (compiledPrompt.summary.startsWith("手绘故事视频")) return "手绘故事分镜"
  if (compiledPrompt.summary.startsWith("古诗词丝绸视频")) return "古诗词场景与运镜方案"
  if (compiledPrompt.summary.startsWith("Antibes Holiday")) return "Antibes 插画方案"
  if (compiledPrompt.summary.startsWith("静态图运镜导演")) return "静态图运镜方案"
  if (compiledPrompt.summary.startsWith("品牌贴纸写真")) return "品牌贴纸写真方案"
  if (compiledPrompt.summary.startsWith("金属 Logo 雕塑")) return "金属 Logo 雕塑方案"
  if (compiledPrompt.summary.startsWith("Playful App Icon")) return "App 图标设计方案"
  return "专业提示词"
}

function imageTo3dPromptContent(compiledPrompt: CompiledPrompt) {
  return [
    `# ${compiledPrompt.summary}`,
    compiledPrompt.originalGoal
      ? `## 用户目标\n${compiledPrompt.originalGoal}`
      : "",
    "## 3D 产物",
    ...compiledPrompt.outputs.map(
      (output, index) =>
        `- ${index + 1}. ${output.variantDifference ?? output.variantKey ?? output.mediaType}`
    ),
    compiledPrompt.sharedConstraints.length > 0
      ? `## 重建规格\n${compiledPrompt.sharedConstraints
          .map((constraint) => `- ${constraint}`)
          .join("\n")}`
      : "",
    compiledPrompt.negativeConstraints?.length
      ? `## 可信边界\n${compiledPrompt.negativeConstraints
          .map((constraint) => `- ${constraint}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function storyboardPromptContent(
  compiledPrompt: CompiledPrompt,
  outputIndex: number
) {
  const output = compiledPrompt.outputs[outputIndex]
  const frameNumber = String(outputIndex + 1).padStart(2, "0")
  return [
    `# 分镜提示词 KF#${frameNumber}`,
    compiledPrompt.originalGoal
      ? `## 用户目标\n${compiledPrompt.originalGoal}`
      : "",
    `## 生成提示词\n${output.prompt}`,
    output.negativePrompt
      ? `## 避免内容\n${output.negativePrompt}`
      : "",
    compiledPrompt.sharedConstraints.length > 0
      ? `## 统一约束\n${compiledPrompt.sharedConstraints
          .map((constraint) => `- ${constraint}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function ianXiaoheiPromptContent(
  compiledPrompt: CompiledPrompt,
  outputIndex: number
) {
  const output = compiledPrompt.outputs[outputIndex]
  return [
    `# 小蓝滴配图方案 ${outputIndex + 1}`,
    compiledPrompt.originalGoal
      ? `## 用户内容\n${compiledPrompt.originalGoal}`
      : "",
    `## 认知锚点与生成提示词\n${output.prompt}`,
    output.negativePrompt
      ? `## 避免内容\n${output.negativePrompt}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function estimatedPromptHeight(content: string) {
  const estimatedLines = content
    .split("\n")
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / 28)),
      0
    )
  return Math.max(460, 168 + estimatedLines * 21)
}

function promptBounds(
  content: string,
  sourceBounds: CanvasCommandBounds | undefined,
  viewportBounds: CanvasCommandBounds
): CanvasCommandBounds {
  const width = 440
  const height = estimatedPromptHeight(content)

  return {
    x: sourceBounds
      ? sourceBounds.x + sourceBounds.w + 96
      : viewportBounds.x + Math.max(48, (viewportBounds.w - width) / 2),
    y: sourceBounds ? sourceBounds.y : viewportBounds.y + 64,
    w: width,
    h: height,
  }
}

function storyboardPromptCommands(
  compiledPrompt: CompiledPrompt,
  sourceBounds: CanvasCommandBounds | undefined,
  viewportBounds: CanvasCommandBounds,
  occupiedBounds: CanvasOccupiedBounds[]
) {
  const width = 440
  const columnGap = 64
  const rowGap = 64
  const baseX = sourceBounds
    ? sourceBounds.x + sourceBounds.w + 96
    : viewportBounds.x + 64
  const baseY = sourceBounds ? sourceBounds.y : viewportBounds.y + 64
  const contents = compiledPrompt.outputs.map((_, index) =>
    storyboardPromptContent(compiledPrompt, index)
  )
  const heights = contents.map(estimatedPromptHeight)
  const uniformHeight = Math.max(...heights)

  const promptCommands = contents.map((content, index) => {
    const row = Math.floor(index / 2)
    const column = index % 2
    const y =
      baseY +
      row * (uniformHeight + rowGap)
    const frameNumber = String(index + 1).padStart(2, "0")
    return {
      type: "create-prompt-node" as const,
      nodeRef: `professional-prompt-${index + 1}`,
      title: `分镜提示词 KF#${frameNumber}`,
      content,
      bounds: {
        x: baseX + column * (width + columnGap),
        y,
        w: width,
        h: uniformHeight,
      },
    }
  })
  const placedBounds = offsetBoundsGroupToAvoidOverlaps(
    promptCommands.map(({ bounds }) => bounds),
    occupiedBounds,
    columnGap
  )

  return promptCommands.map((command, index) => ({
    ...command,
    bounds: placedBounds[index],
  }))
}

function ianXiaoheiPromptCommands(
  compiledPrompt: CompiledPrompt,
  sourceBounds: CanvasCommandBounds | undefined,
  viewportBounds: CanvasCommandBounds,
  occupiedBounds: CanvasOccupiedBounds[]
) {
  const width = 440
  const columnGap = 64
  const rowGap = 64
  const baseX = sourceBounds
    ? sourceBounds.x + sourceBounds.w + 96
    : viewportBounds.x + 64
  const baseY = sourceBounds ? sourceBounds.y : viewportBounds.y + 64
  const contents = compiledPrompt.outputs.map((_, index) =>
    ianXiaoheiPromptContent(compiledPrompt, index)
  )
  const heights = contents.map(estimatedPromptHeight)
  const uniformHeight = Math.max(...heights)
  const promptCommands = contents.map((content, index) => ({
    type: "create-prompt-node" as const,
    nodeRef: `professional-prompt-${index + 1}`,
    title: `小蓝滴配图方案 ${index + 1}`,
    content,
    bounds: {
      x: baseX + (index % 2) * (width + columnGap),
      y: baseY + Math.floor(index / 2) * (uniformHeight + rowGap),
      w: width,
      h: uniformHeight,
    },
  }))
  const placedBounds = offsetBoundsGroupToAvoidOverlaps(
    promptCommands.map(({ bounds }) => bounds),
    occupiedBounds,
    columnGap
  )
  return promptCommands.map((command, index) => ({
    ...command,
    bounds: placedBounds[index],
  }))
}

export async function writeAgentPromptToCanvas(
  {
    task,
    sourceBounds,
    viewportBounds,
    occupiedBounds = [],
  }: WriteAgentPromptToCanvasInput,
  dependencies: WriteAgentPromptToCanvasDependencies = {}
) {
  if (!task.compiledPrompt) {
    throw new Error(`Canvas Agent task has no compiled prompt: ${task.id}`)
  }

  const isStoryboard =
    task.compiledPrompt.outputs.length > 1 &&
    task.compiledPrompt.summary.includes("分镜")
  const isIanXiaohei =
    task.compiledPrompt.outputs.length > 1 &&
    task.compiledPrompt.summary.startsWith("Ian 小蓝滴")
  const isImageTo3d = isImageTo3dPrompt(task.compiledPrompt)
  const content = isStoryboard || isIanXiaohei
    ? ""
    : isImageTo3d
      ? imageTo3dPromptContent(task.compiledPrompt)
      : promptContent(task.compiledPrompt)
  const otherOccupiedBounds = occupiedBounds.filter(
    (bounds) => bounds.taskId !== task.id
  )
  const commands = isStoryboard
    ? storyboardPromptCommands(
        task.compiledPrompt,
        sourceBounds,
        viewportBounds,
        otherOccupiedBounds
      )
    : isIanXiaohei
      ? ianXiaoheiPromptCommands(
          task.compiledPrompt,
          sourceBounds,
          viewportBounds,
          otherOccupiedBounds
        )
      : [
        {
          type: "create-prompt-node" as const,
          nodeRef: "professional-prompt",
          title: isImageTo3d
            ? "图片转 3D 规格"
            : promptNodeTitle(task.compiledPrompt),
          content,
          bounds: offsetBoundsGroupToAvoidOverlaps(
            [promptBounds(content, sourceBounds, viewportBounds)],
            otherOccupiedBounds,
            64
          )[0],
        },
      ]
  const batch = agentCanvasCommandBatchSchema.parse({
    id: `agent-prompt-${task.id}`,
    taskId: task.id,
    createdAt: dependencies.now?.() ?? new Date().toISOString(),
    commands,
  })
  const acknowledgement = await (
    dependencies.publish ?? canvasCommandBridge.publish
  )(batch)

  if (acknowledgement.status === "rejected") {
    throw new Error(
      acknowledgement.errors[0]?.message ?? "提示词画板写入失败"
    )
  }

  return acknowledgement
}
