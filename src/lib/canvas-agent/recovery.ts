import { agentTaskSchema, type AgentTask } from "./task-schema"
import { listStoredAgentTasks, saveStoredAgentTask } from "./task-store"

type RecoverAgentTasksOptions = {
  root?: string
  now?: () => string
  createId?: () => string
}

function defaultNow() {
  return new Date().toISOString()
}

function defaultCreateId() {
  return `event-recovery-${crypto.randomUUID()}`
}

function recoverExecutingTask(
  task: AgentTask,
  options: RecoverAgentTasksOptions
) {
  if (task.status !== "executing" || !task.executionPlan) return task

  const resetStepIds = new Set(
    task.executionPlan.steps
      .filter(
        (step) =>
          step.status === "running" &&
          !(
            step.tool === "generate_video" &&
            task.providerJobIds?.[step.id]
          )
      )
      .map((step) => step.id)
  )
  if (resetStepIds.size === 0) return task

  const now = (options.now ?? defaultNow)()
  return agentTaskSchema.parse({
    ...task,
    revision: task.revision + 1,
    updatedAt: now,
    activeStepId:
      task.activeStepId && resetStepIds.has(task.activeStepId)
        ? undefined
        : task.activeStepId,
    executionPlan: {
      ...task.executionPlan,
      steps: task.executionPlan.steps.map((step) =>
        resetStepIds.has(step.id)
          ? { ...step, status: "pending" as const }
          : step
      ),
    },
    history: [
      ...task.history,
      {
        id: (options.createId ?? defaultCreateId)(),
        status: "executing",
        message: "恢复任务：未发现可续跑的 Provider Job，已回到安全步骤",
        createdAt: now,
      },
    ],
  })
}

export async function recoverAgentTasks(
  options: RecoverAgentTasksOptions = {}
) {
  const tasks = await listStoredAgentTasks(options.root)
  return Promise.all(
    tasks.map(async (task) => {
      const recovered = recoverExecutingTask(task, options)
      if (recovered === task) return task
      return (
        await saveStoredAgentTask(recovered, task.revision, options.root)
      ).task
    })
  )
}
