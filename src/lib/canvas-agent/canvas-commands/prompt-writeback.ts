import type { AgentTask, CompiledPrompt } from "../task-schema"
import { isImageTo3dVariantKey } from "../skills/identifiers"
import { canvasCommandBridge, type CanvasCommandBridge } from "./bridge"
import {
  agentCanvasCommandBatchSchema,
  type CanvasCommandBounds,
} from "./schema"

type WriteAgentPromptToCanvasInput = {
  task: AgentTask
  sourceBounds?: CanvasCommandBounds
  viewportBounds: CanvasCommandBounds
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

function imageTo3dPromptContent(compiledPrompt: CompiledPrompt) {
  return [
    `# ${compiledPrompt.summary}`,
    compiledPrompt.originalGoal
      ? `## 用户目标\n${compiledPrompt.originalGoal}`
      : "",
    "## 交付视图",
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
  viewportBounds: CanvasCommandBounds
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

  return contents.map((content, index) => {
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
}

export async function writeAgentPromptToCanvas(
  {
    task,
    sourceBounds,
    viewportBounds,
  }: WriteAgentPromptToCanvasInput,
  dependencies: WriteAgentPromptToCanvasDependencies = {}
) {
  if (!task.compiledPrompt) {
    throw new Error(`Canvas Agent task has no compiled prompt: ${task.id}`)
  }

  const isStoryboard =
    task.compiledPrompt.outputs.length > 1 &&
    task.compiledPrompt.summary.includes("分镜")
  const isImageTo3d = isImageTo3dPrompt(task.compiledPrompt)
  const content = isStoryboard
    ? ""
    : isImageTo3d
      ? imageTo3dPromptContent(task.compiledPrompt)
      : promptContent(task.compiledPrompt)
  const commands = isStoryboard
    ? storyboardPromptCommands(
        task.compiledPrompt,
        sourceBounds,
        viewportBounds
      )
    : [
        {
          type: "create-prompt-node" as const,
          nodeRef: "professional-prompt",
          title: isImageTo3d ? "图片转 3D 规格" : "专业提示词",
          content,
          bounds: promptBounds(content, sourceBounds, viewportBounds),
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
