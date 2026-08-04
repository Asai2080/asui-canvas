import type { ThreadMessage } from "@assistant-ui/react"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

const TERMINAL_STATUSES = new Set<AgentTask["status"]>([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

const PROMPT_EXECUTION_STATUSES = new Set<AgentTask["status"]>([
  "planning",
  "executing",
  "writing-canvas",
])

export function isAgentTaskTerminal(task: AgentTask) {
  return TERMINAL_STATUSES.has(task.status)
}

export function getAgentPromptReviewState(
  task: AgentTask,
  pendingAction: "confirming" | "cancelling" | null,
  readOnly: boolean
) {
  const isExecuting =
    !isAgentTaskTerminal(task) &&
    (pendingAction === "confirming" ||
      PROMPT_EXECUTION_STATUSES.has(task.status))
  const label = isExecuting
    ? "执行中"
    : task.status === "cancelled"
      ? "已取消"
      : task.status === "completed" || task.status === "partially-completed"
        ? "已完成"
        : task.status === "failed"
          ? "执行失败"
          : readOnly
            ? "已确认"
            : "等待确认"

  return { isExecuting, label }
}

function taskErrorMessage(task: AgentTask) {
  const message = task.error?.message
  if (message?.includes("Canvas Agent task revision conflict")) {
    return "任务状态已同步，请点击重试继续。"
  }
  return message ?? "执行遇到问题，请稍后重试。"
}

export function selectForegroundTask(tasks: readonly AgentTask[]) {
  return tasks
    .filter(
      (task) =>
        !isAgentTaskTerminal(task) &&
        task.status !== "awaiting-confirmation"
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
}

export function selectPromptWritebackTask(
  tasks: readonly AgentTask[],
  writableTaskIds: ReadonlySet<string>
) {
  return tasks
    .filter(
      (task) =>
        writableTaskIds.has(task.id) &&
        Boolean(task.compiledPrompt) &&
        [
          "awaiting-confirmation",
          "planning",
          "executing",
          "writing-canvas",
        ].includes(task.status)
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
}

export function getAgentTaskResultText(task: AgentTask) {
  if (
    task.status === "completed" &&
    (task.interpretation?.intent === "conversation" ||
      task.interpretation?.intent === "unsupported")
  ) {
    return task.interpretation.message
  }

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
    return `未能完成${target}：${taskErrorMessage(task)}`
  }

  if (task.status === "cancelled") {
    return `已取消${target}。`
  }

  return "正在处理当前任务。"
}

export function isAgentCapabilityIntroduction(task: AgentTask) {
  if (task.interpretation?.intent !== "conversation") return false
  const message = task.interpretation.message
  return message.includes("生成图片") && message.includes("生成视频")
}

export function tasksToConversationHistory(
  tasks: readonly AgentTask[],
  activeTaskId?: string
) {
  const ordered = [...tasks].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  )
  const activeIndex = activeTaskId
    ? ordered.findIndex((task) => task.id === activeTaskId)
    : -1
  const activeSkillId =
    activeIndex >= 0 ? ordered[activeIndex]?.skillId : undefined
  const priorTasks = activeIndex >= 0 ? ordered.slice(0, activeIndex) : ordered
  let sameWorkflow = priorTasks
  if (activeIndex >= 0) {
    sameWorkflow = []
    for (let index = priorTasks.length - 1; index >= 0; index -= 1) {
      const task = priorTasks[index]
      if (task.skillId !== activeSkillId) break
      sameWorkflow.unshift(task)
    }
  }
  return sameWorkflow
    .filter(
      (task) =>
        isAgentTaskTerminal(task) && task.status !== "cancelled"
    )
    .slice(-6)
    .flatMap((task) => [
      { role: "user" as const, content: task.userInstruction.slice(0, 4_000) },
      {
        role: "assistant" as const,
        content: getAgentTaskResultText(task).slice(0, 4_000),
      },
    ])
    .slice(-12)
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

      const promptReviewEvent = task.history.findLast(
        (event) => event.status === "awaiting-confirmation"
      )
      const hasPromptReview = Boolean(
        task.compiledPrompt &&
          (task.status === "awaiting-confirmation" || promptReviewEvent)
      )

      if (
        !isAgentTaskTerminal(task) &&
        task.status !== "awaiting-confirmation"
      ) {
        return messages
      }

      if (hasPromptReview) {
        messages.push({
          id: `${task.id}-assistant-review`,
          role: "assistant" as const,
          content: [
            {
              type: "text" as const,
              text: task.compiledPrompt?.summary ?? "专业提示词已准备好",
            },
          ],
          status: { type: "complete" as const, reason: "stop" as const },
          createdAt: new Date(
            task.promptConfirmedAt ??
              promptReviewEvent?.createdAt ??
              task.updatedAt
          ),
          metadata: {
            unstable_state: null,
            unstable_annotations: [],
            unstable_data: [],
            steps: [],
            custom: {
              taskId: task.id,
              taskStatus: task.status,
              messageKind: "prompt-review",
            },
          },
        })
      }

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
