import type { ThreadMessage } from "@assistant-ui/react"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

const TERMINAL_STATUSES = new Set<AgentTask["status"]>([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

export function isAgentTaskTerminal(task: AgentTask) {
  return TERMINAL_STATUSES.has(task.status)
}

export function selectForegroundTask(tasks: readonly AgentTask[]) {
  return tasks
    .filter((task) => !isAgentTaskTerminal(task))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
}

export function getAgentTaskResultText(task: AgentTask) {
  const summary = task.interpretation?.summary
  const target = summary ? `“${summary}”` : "当前任务"
  const resultCount = task.resultNodeIds.length
  const resultText =
    resultCount > 0
      ? `${resultCount} 个结果已写入画布`
      : "任务已处理完成"

  if (task.status === "completed") {
    return `已完成${target}，${resultText}。`
  }

  if (task.status === "partially-completed") {
    return `已部分完成${target}${
      resultCount > 0 ? `，${resultText}` : ""
    }。`
  }

  if (task.status === "failed") {
    return `未能完成${target}：${task.error?.message ?? "执行遇到问题，请稍后重试。"}`
  }

  if (task.status === "cancelled") {
    return `已取消${target}。`
  }

  return "正在处理当前任务。"
}

export function tasksToThreadMessages(
  tasks: readonly AgentTask[]
): ThreadMessage[] {
  return [...tasks]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .flatMap((task) => {
      const createdAt = new Date(task.createdAt)
      const messages: ThreadMessage[] = [
        {
          id: `${task.id}-user`,
          role: "user" as const,
          content: [{ type: "text" as const, text: task.userInstruction }],
          attachments: [],
          createdAt,
          metadata: { custom: { taskId: task.id } },
        },
      ]

      if (!isAgentTaskTerminal(task)) return messages

      messages.push({
        id: `${task.id}-assistant`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: getAgentTaskResultText(task) }],
        status: { type: "complete" as const, reason: "stop" as const },
        createdAt: new Date(task.completedAt ?? task.updatedAt),
        metadata: {
          unstable_state: null,
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          custom: { taskId: task.id, taskStatus: task.status },
        },
      })

      return messages
    })
}
