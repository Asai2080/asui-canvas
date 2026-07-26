import {
  createImageGenerationAdapter,
  type ImageGenerationCredentials,
} from "./adapters/image-generation"
import {
  createVideoGenerationAdapter,
  type VideoGenerationCredentials,
} from "./adapters/video-generation"
import { getStoredCanvasContextSnapshot } from "./context/store"
import {
  executeAgentTask,
  type ExecuteAgentTaskDependencies,
} from "./executor"
import { createAgentPlan } from "./planner/planner"
import { compileGenerationPrompt } from "./prompts/compiler"
import { createSkillSnapshot } from "./skills/registry"
import { agentTaskSchema, type AgentTask } from "./task-schema"
import { transitionAgentTask } from "./task-machine"
import {
  AgentTaskNotFoundError,
  getStoredAgentTask,
  saveStoredAgentTask,
} from "./task-store"

export type RunAgentTaskDependencies = {
  root?: string
  apiOrigin: string
  imageCredentials?: ImageGenerationCredentials
  videoCredentials?: VideoGenerationCredentials
  imageAdapter?: ExecuteAgentTaskDependencies["imageAdapter"]
  videoAdapter?: ExecuteAgentTaskDependencies["videoAdapter"]
  now?: () => string
  createId?: (prefix: string) => string
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

function defaultNow() {
  return new Date().toISOString()
}

function skillSnapshotId(taskId: string) {
  return `${taskId.slice(0, 114)}-skill`
}

async function loadContext(task: AgentTask, root?: string) {
  if (!task.contextSnapshotId) return undefined
  const stored = await getStoredCanvasContextSnapshot(
    task.contextSnapshotId,
    root
  )
  if (!stored) {
    throw new Error(`画布上下文不存在：${task.contextSnapshotId}`)
  }
  return stored.snapshot
}

async function loadSkill(task: AgentTask, root?: string, now?: string) {
  if (!task.skillId) return undefined
  return createSkillSnapshot(task.skillId, skillSnapshotId(task.id), root, {
    now,
  })
}

async function persistTransition(
  task: AgentTask,
  status: Parameters<typeof transitionAgentTask>[1],
  dependencies: RunAgentTaskDependencies,
  extend?: (next: AgentTask) => AgentTask
) {
  const next = transitionAgentTask(task, status, {
    now: (dependencies.now ?? defaultNow)(),
    eventId: (dependencies.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`))(
      "event"
    ),
  })
  const parsed = agentTaskSchema.parse(extend ? extend(next) : next)
  return (await saveStoredAgentTask(parsed, task.revision, dependencies.root))
    .task
}

function sanitizedMessage(
  error: unknown,
  dependencies: RunAgentTaskDependencies
) {
  let message = error instanceof Error ? error.message : "Agent 任务执行失败"
  const secrets = [
    dependencies.imageCredentials?.apiKey,
    dependencies.videoCredentials?.videoApiKey,
  ].filter((value): value is string => Boolean(value))
  for (const secret of secrets) {
    message = message.split(secret).join("[REDACTED]")
  }
  return message.slice(0, 1200)
}

async function failTask(
  task: AgentTask,
  error: unknown,
  dependencies: RunAgentTaskDependencies
) {
  if (TERMINAL_STATUSES.has(task.status)) return task
  const next = transitionAgentTask(task, "failed", {
    now: (dependencies.now ?? defaultNow)(),
    eventId: (dependencies.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`))(
      "event"
    ),
    error: {
      code: "AGENT_EXECUTION_FAILED",
      message: sanitizedMessage(error, dependencies),
      retryable: true,
      stepId: task.activeStepId,
    },
  })
  return (await saveStoredAgentTask(next, task.revision, dependencies.root)).task
}

function completePreparationSteps(task: AgentTask) {
  if (!task.executionPlan) return task
  return {
    ...task,
    executionPlan: {
      ...task.executionPlan,
      steps: task.executionPlan.steps.map((step) =>
        step.id === "read-context" || step.id === "compile-prompt"
          ? { ...step, status: "completed" as const, attempts: 1 }
          : step
      ),
    },
  }
}

export async function runAgentTaskTick(
  taskId: string,
  dependencies: RunAgentTaskDependencies
): Promise<AgentTask> {
  const stored = await getStoredAgentTask(taskId, dependencies.root)
  if (!stored) throw new AgentTaskNotFoundError(taskId)
  const task = stored.task

  if (TERMINAL_STATUSES.has(task.status) || task.status === "writing-canvas") {
    return task
  }

  try {
    if (task.status === "queued") {
      return persistTransition(task, "understanding", dependencies)
    }

    if (task.status === "understanding") {
      const next = task.skillId
        ? "reading-skill"
        : task.contextSnapshotId
          ? "reading-canvas"
          : "compiling-prompt"
      return persistTransition(task, next, dependencies)
    }

    if (task.status === "reading-skill") {
      await loadSkill(task, dependencies.root, (dependencies.now ?? defaultNow)())
      return persistTransition(
        task,
        task.contextSnapshotId ? "reading-canvas" : "compiling-prompt",
        dependencies
      )
    }

    if (task.status === "reading-canvas") {
      await loadContext(task, dependencies.root)
      return persistTransition(task, "compiling-prompt", dependencies)
    }

    if (task.status === "compiling-prompt") {
      const timestamp = (dependencies.now ?? defaultNow)()
      const [context, skill] = await Promise.all([
        loadContext(task, dependencies.root),
        loadSkill(task, dependencies.root, timestamp),
      ])
      const compiledPrompt = compileGenerationPrompt({
        taskId: task.id,
        userInstruction: task.userInstruction,
        context,
        skill,
      })
      return persistTransition(task, "planning", dependencies, (next) => ({
        ...next,
        compiledPrompt,
      }))
    }

    if (task.status === "planning") {
      if (!task.compiledPrompt) throw new Error("任务缺少已编译提示词")
      const executionPlan = createAgentPlan({
        taskId: task.id,
        compiledPrompt: task.compiledPrompt,
        contextSnapshotId: task.contextSnapshotId,
      })
      return persistTransition(task, "executing", dependencies, (next) =>
        completePreparationSteps({ ...next, executionPlan })
      )
    }

    if (task.status === "executing") {
      return await executeAgentTask(task.id, {
        root: dependencies.root,
        imageAdapter:
          dependencies.imageAdapter ??
          createImageGenerationAdapter({ apiOrigin: dependencies.apiOrigin }),
        videoAdapter:
          dependencies.videoAdapter ??
          createVideoGenerationAdapter({ apiOrigin: dependencies.apiOrigin }),
        imageCredentials: dependencies.imageCredentials,
        videoCredentials: dependencies.videoCredentials,
        now: dependencies.now,
        createId: dependencies.createId,
      })
    }

    return task
  } catch (error) {
    const latest = await getStoredAgentTask(task.id, dependencies.root)
    return failTask(latest?.task ?? task, error, dependencies)
  }
}
