import type { AgentTask, CompiledPrompt } from "../task-schema"
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

function promptBounds(
  content: string,
  sourceBounds: CanvasCommandBounds | undefined,
  viewportBounds: CanvasCommandBounds
): CanvasCommandBounds {
  const width = 440
  const estimatedLines = content
    .split("\n")
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / 28)),
      0
    )
  const height = Math.min(920, Math.max(460, 116 + estimatedLines * 24))

  return {
    x: sourceBounds
      ? sourceBounds.x + sourceBounds.w + 96
      : viewportBounds.x + Math.max(48, (viewportBounds.w - width) / 2),
    y: sourceBounds ? sourceBounds.y : viewportBounds.y + 64,
    w: width,
    h: height,
  }
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

  const content = promptContent(task.compiledPrompt)
  const batch = agentCanvasCommandBatchSchema.parse({
    id: `agent-prompt-${task.id}`,
    taskId: task.id,
    createdAt: dependencies.now?.() ?? new Date().toISOString(),
    commands: [
      {
        type: "create-prompt-node",
        nodeRef: "professional-prompt",
        title: "专业提示词",
        content,
        bounds: promptBounds(content, sourceBounds, viewportBounds),
      },
    ],
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
