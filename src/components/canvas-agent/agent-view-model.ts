import type { ThreadMessage } from "@assistant-ui/react"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

const TERMINAL_STATUSES = new Set<AgentTask["status"]>([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

const STATUS_LABELS: Record<AgentTask["status"], string> = {
  queued: "排队中",
  understanding: "理解目标",
  "reading-skill": "读取 Skill",
  "reading-canvas": "读取画布",
  "compiling-prompt": "整理提示词",
  planning: "制定步骤",
  executing: "执行生成",
  "writing-canvas": "写回画布",
  completed: "已完成",
  "partially-completed": "部分完成",
  failed: "执行失败",
  cancelled: "已取消",
}

export function isAgentTaskTerminal(task: AgentTask) {
  return TERMINAL_STATUSES.has(task.status)
}

export function selectForegroundTask(tasks: readonly AgentTask[]) {
  return tasks
    .filter((task) => !isAgentTaskTerminal(task))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
}

function assistantSummary(task: AgentTask) {
  const sections = [`状态：${STATUS_LABELS[task.status]}`]

  if (task.compiledPrompt) {
    sections.push(`提示词摘要：${task.compiledPrompt.summary}`)
    sections.push(
      `输出提示词：\n${task.compiledPrompt.outputs
        .map((output, index) => `${index + 1}. ${output.prompt}`)
        .join("\n")}`
    )
  }

  if (task.executionPlan) {
    sections.push(
      `执行步骤：\n${task.executionPlan.steps
        .map((step) => `- ${step.title} · ${step.status}`)
        .join("\n")}`
    )
  }

  if (task.error) sections.push(`错误：${task.error.message}`)
  if (task.resultNodeIds.length > 0) {
    sections.push(`画布结果：${task.resultNodeIds.length} 个节点`)
  }

  return sections.join("\n\n")
}

export function tasksToThreadMessages(
  tasks: readonly AgentTask[]
): ThreadMessage[] {
  return [...tasks]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .flatMap((task) => {
      const createdAt = new Date(task.createdAt)
      return [
        {
          id: `${task.id}-user`,
          role: "user" as const,
          content: [{ type: "text" as const, text: task.userInstruction }],
          attachments: [],
          createdAt,
          metadata: { custom: { taskId: task.id } },
        },
        {
          id: `${task.id}-assistant`,
          role: "assistant" as const,
          content: [{ type: "text" as const, text: assistantSummary(task) }],
          status: { type: "complete" as const, reason: "stop" as const },
          createdAt: new Date(task.updatedAt),
          metadata: {
            unstable_state: null,
            unstable_annotations: [],
            unstable_data: [],
            steps: [],
            custom: { taskId: task.id, taskStatus: task.status },
          },
        },
      ] satisfies ThreadMessage[]
    })
}
