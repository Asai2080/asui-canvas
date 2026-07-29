import {
  createAgentTask,
  transitionAgentTask,
} from "./task-machine"
import {
  agentCanvasCommandAcknowledgementSchema,
  type AgentCanvasCommandAcknowledgement,
} from "./canvas-commands/schema"
import {
  agentTaskSchema,
  type AgentTask,
  type AgentTaskStatus,
} from "./task-schema"
import {
  AgentTaskNotFoundError,
  createStoredAgentTask,
  getStoredAgentTask,
  saveStoredAgentTask,
} from "./task-store"

type CancelAgentTaskOptions = {
  root?: string
  now?: () => string
  createId?: () => string
  cancelProviderJob?: (jobId: string) => Promise<void>
}

type RetryAgentTaskOptions = {
  root?: string
  now?: () => string
  createTaskId?: () => string
  createEventId?: () => string
}

type ConfirmAgentTaskOptions = {
  root?: string
  now?: () => string
  createId?: () => string
}

type AcknowledgeCanvasWritebackOptions = {
  root?: string
  now?: () => string
  createId?: () => string
}

const TERMINAL_STATUSES = new Set<AgentTaskStatus>([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function hasCompletedOutput(task: AgentTask) {
  const artifacts = Object.values(task.artifacts ?? {}).flat()
  return artifacts.length > 0 || task.resultNodeIds.length > 0
}

export class InvalidAgentTaskRetryError extends Error {
  constructor(taskId: string, status: AgentTaskStatus) {
    super(`Canvas Agent task cannot be retried from ${status}: ${taskId}`)
    this.name = "InvalidAgentTaskRetryError"
  }
}

export class InvalidAgentCanvasAcknowledgementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidAgentCanvasAcknowledgementError"
  }
}

export class InvalidAgentTaskConfirmationError extends Error {
  constructor(taskId: string, status: AgentTaskStatus) {
    super(`Canvas Agent task cannot be confirmed from ${status}: ${taskId}`)
    this.name = "InvalidAgentTaskConfirmationError"
  }
}

export async function confirmAgentTask(
  taskId: string,
  options: ConfirmAgentTaskOptions = {}
) {
  const stored = await getStoredAgentTask(taskId, options.root)
  if (!stored) {
    throw new AgentTaskNotFoundError(taskId)
  }
  if (stored.task.status !== "awaiting-confirmation") {
    throw new InvalidAgentTaskConfirmationError(
      taskId,
      stored.task.status
    )
  }

  const now = options.now?.() ?? nowIso()
  const nextTask = transitionAgentTask(stored.task, "planning", {
    now,
    eventId: options.createId?.() ?? createId("event"),
    message: "用户已确认提示词，开始执行生成任务",
  })
  const confirmed = agentTaskSchema.parse({
    ...nextTask,
    promptConfirmedAt: now,
  })

  return (
    await saveStoredAgentTask(
      confirmed,
      stored.task.revision,
      options.root
    )
  ).task
}

function finishCanvasStep(
  task: AgentTask,
  acknowledgement: AgentCanvasCommandAcknowledgement
) {
  if (!task.executionPlan) return task

  const writebackTools = new Set([
    "create_canvas_nodes",
    "connect_canvas_nodes",
    "mark_recommended_node",
  ])

  return agentTaskSchema.parse({
    ...task,
    executionPlan: {
      ...task.executionPlan,
      steps: task.executionPlan.steps.map((step) =>
        writebackTools.has(step.tool)
          ? {
              ...step,
              status:
                acknowledgement.status === "rejected"
                  ? ("failed" as const)
                  : ("completed" as const),
              outputRefs: acknowledgement.resultNodeIds,
            }
          : step
      ),
    },
  })
}

export async function acknowledgeAgentCanvasWriteback(
  taskId: string,
  input: AgentCanvasCommandAcknowledgement,
  options: AcknowledgeCanvasWritebackOptions = {}
) {
  const acknowledgement = agentCanvasCommandAcknowledgementSchema.parse(input)
  if (acknowledgement.taskId !== taskId) {
    throw new InvalidAgentCanvasAcknowledgementError(
      `Canvas acknowledgement task ${acknowledgement.taskId} does not match ${taskId}`
    )
  }

  const stored = await getStoredAgentTask(taskId, options.root)
  if (!stored) {
    throw new AgentTaskNotFoundError(taskId)
  }

  if (TERMINAL_STATUSES.has(stored.task.status)) {
    return stored.task
  }
  if (stored.task.status !== "writing-canvas") {
    throw new InvalidAgentCanvasAcknowledgementError(
      `Canvas acknowledgement requires writing-canvas status, got ${stored.task.status}`
    )
  }

  const now = options.now?.() ?? nowIso()
  const prepared = finishCanvasStep(stored.task, acknowledgement)
  const nextStatus =
    acknowledgement.status === "applied"
      ? "completed"
      : acknowledgement.status === "partial"
        ? "partially-completed"
        : "failed"
  const nextTask = transitionAgentTask(prepared, nextStatus, {
    now,
    eventId: options.createId?.() ?? createId("event"),
    message:
      acknowledgement.status === "applied"
        ? "生成结果已写入画布"
        : acknowledgement.status === "partial"
          ? "部分生成结果已写入画布"
          : "生成结果写入画布失败",
    resultNodeIds: acknowledgement.resultNodeIds,
    error:
      acknowledgement.status === "rejected"
        ? {
            code: "CANVAS_WRITEBACK_REJECTED",
            message:
              acknowledgement.errors[0]?.message ?? "生成结果写入画布失败",
            retryable: true,
            details: {
              batchId: acknowledgement.batchId,
              errors: acknowledgement.errors,
            },
          }
        : undefined,
  })

  return (
    await saveStoredAgentTask(
      nextTask,
      stored.task.revision,
      options.root
    )
  ).task
}

export async function cancelAgentTask(
  taskId: string,
  options: CancelAgentTaskOptions = {}
) {
  const stored = await getStoredAgentTask(taskId, options.root)
  if (!stored) {
    throw new AgentTaskNotFoundError(taskId)
  }
  if (TERMINAL_STATUSES.has(stored.task.status)) {
    return stored.task
  }

  const cancellableStepIds = new Set(
    stored.task.executionPlan?.steps
      .filter((step) => step.status === "pending" || step.status === "running")
      .map((step) => step.id) ?? []
  )
  const jobsToCancel = Object.entries(stored.task.providerJobIds ?? {})
    .filter(([stepId]) => cancellableStepIds.has(stepId))
    .map(([, jobId]) => jobId)

  if (options.cancelProviderJob) {
    await Promise.all(
      jobsToCancel.map((jobId) => options.cancelProviderJob?.(jobId))
    )
  }

  const now = options.now?.() ?? nowIso()
  const nextStatus = hasCompletedOutput(stored.task)
    ? "partially-completed"
    : "cancelled"
  const nextTask = agentTaskSchema.parse({
    ...stored.task,
    revision: stored.task.revision + 1,
    status: nextStatus,
    activeStepId: undefined,
    completedAt: now,
    updatedAt: now,
    executionPlan: stored.task.executionPlan
      ? {
          ...stored.task.executionPlan,
          steps: stored.task.executionPlan.steps.map((step) =>
            cancellableStepIds.has(step.id)
              ? { ...step, status: "cancelled" as const }
              : step
          ),
        }
      : undefined,
    history: [
      ...stored.task.history,
      {
        id: options.createId?.() ?? createId("event"),
        status: nextStatus,
        message:
          nextStatus === "partially-completed"
            ? "任务已停止，已完成的结果已保留"
            : "任务已取消",
        createdAt: now,
      },
    ],
  })

  return (await saveStoredAgentTask(nextTask, stored.task.revision, options.root))
    .task
}

export async function retryAgentTask(
  taskId: string,
  options: RetryAgentTaskOptions = {}
) {
  const stored = await getStoredAgentTask(taskId, options.root)
  if (!stored) {
    throw new AgentTaskNotFoundError(taskId)
  }
  if (!TERMINAL_STATUSES.has(stored.task.status)) {
    throw new InvalidAgentTaskRetryError(taskId, stored.task.status)
  }

  const now = options.now?.() ?? nowIso()
  const retried = createAgentTask(
    {
      userInstruction: stored.task.userInstruction,
      executionMode: stored.task.executionMode,
      requestedOutputCount: stored.task.requestedOutputCount,
      selectedCanvasId: stored.task.selectedCanvasId,
      skillId: stored.task.skillId,
      contextSnapshotId: stored.task.contextSnapshotId,
      retryOfTaskId: stored.task.id,
    },
    {
      id: options.createTaskId?.() ?? createId("agent-task"),
      eventId: options.createEventId?.() ?? createId("event"),
      now,
    }
  )

  return (await createStoredAgentTask(retried, options.root)).task
}
