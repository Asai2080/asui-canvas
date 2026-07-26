import {
  agentTaskSchema,
  type AgentTask,
  type AgentTaskError,
  type AgentTaskStatus,
} from "./task-schema"

type CreateAgentTaskInput = {
  userInstruction: string
  selectedCanvasId?: string
  skillId?: string
  contextSnapshotId?: string
  retryOfTaskId?: string
}

type TaskEventOverrides = {
  id?: string
  eventId?: string
  now?: string
}

type TransitionAgentTaskOptions = {
  eventId?: string
  now?: string
  message?: string
  activeStepId?: string
  error?: AgentTaskError
  resultNodeIds?: string[]
}

const TERMINAL_STATUSES = new Set<AgentTaskStatus>([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

const ALLOWED_TRANSITIONS: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  queued: ["understanding", "failed", "cancelled"],
  understanding: [
    "reading-skill",
    "reading-canvas",
    "compiling-prompt",
    "failed",
    "cancelled",
  ],
  "reading-skill": ["reading-canvas", "compiling-prompt", "failed", "cancelled"],
  "reading-canvas": ["compiling-prompt", "failed", "cancelled"],
  "compiling-prompt": ["planning", "failed", "cancelled"],
  planning: ["executing", "failed", "cancelled"],
  executing: ["writing-canvas", "partially-completed", "failed", "cancelled"],
  "writing-canvas": ["completed", "partially-completed", "failed", "cancelled"],
  completed: [],
  "partially-completed": [],
  failed: [],
  cancelled: [],
}

const DEFAULT_MESSAGES: Record<AgentTaskStatus, string> = {
  queued: "任务已进入队列",
  understanding: "正在理解任务",
  "reading-skill": "正在读取 Skill",
  "reading-canvas": "正在读取画布上下文",
  "compiling-prompt": "正在整理生成提示词",
  planning: "正在规划执行步骤",
  executing: "正在执行生成任务",
  "writing-canvas": "正在将结果写入画布",
  completed: "任务已完成",
  "partially-completed": "任务部分完成",
  failed: "任务执行失败",
  cancelled: "任务已取消",
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function nowIso() {
  return new Date().toISOString()
}

export class InvalidAgentTaskTransitionError extends Error {
  constructor(from: AgentTaskStatus, to: AgentTaskStatus) {
    super(`Invalid Canvas Agent task transition: ${from} -> ${to}`)
    this.name = "InvalidAgentTaskTransitionError"
  }
}

export function createAgentTask(
  input: CreateAgentTaskInput,
  overrides: TaskEventOverrides = {}
) {
  const now = overrides.now ?? nowIso()
  const task: AgentTask = {
    id: overrides.id ?? createId("agent-task"),
    revision: 0,
    source: "asui-canvas-agent",
    status: "queued",
    userInstruction: input.userInstruction,
    selectedCanvasId: input.selectedCanvasId,
    skillId: input.skillId,
    contextSnapshotId: input.contextSnapshotId,
    retryOfTaskId: input.retryOfTaskId,
    resultNodeIds: [],
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: overrides.eventId ?? createId("event"),
        status: "queued",
        message: DEFAULT_MESSAGES.queued,
        createdAt: now,
      },
    ],
  }

  return agentTaskSchema.parse(task)
}

export function transitionAgentTask(
  task: AgentTask,
  nextStatus: AgentTaskStatus,
  options: TransitionAgentTaskOptions = {}
) {
  if (!ALLOWED_TRANSITIONS[task.status].includes(nextStatus)) {
    throw new InvalidAgentTaskTransitionError(task.status, nextStatus)
  }

  const now = options.now ?? nowIso()
  const isTerminal = TERMINAL_STATUSES.has(nextStatus)
  const nextTask: AgentTask = {
    ...task,
    revision: task.revision + 1,
    status: nextStatus,
    updatedAt: now,
    completedAt: isTerminal ? now : undefined,
    activeStepId: isTerminal ? undefined : options.activeStepId ?? task.activeStepId,
    error: options.error ?? task.error,
    resultNodeIds: options.resultNodeIds ?? task.resultNodeIds,
    history: [
      ...task.history,
      {
        id: options.eventId ?? createId("event"),
        status: nextStatus,
        message: options.message ?? DEFAULT_MESSAGES[nextStatus],
        createdAt: now,
        stepId: options.activeStepId,
      },
    ],
  }

  return agentTaskSchema.parse(nextTask)
}
