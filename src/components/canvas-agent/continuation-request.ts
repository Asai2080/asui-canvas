import type {
  AgentExecutionMode,
  AgentTask,
} from "../../lib/canvas-agent/task-schema"

export type ContinuationRequestOverrides = {
  skillId?: string
  requestedOutputCount?: number
  executionMode: AgentExecutionMode
}

export function continuationRequestOverrides(
  task: AgentTask
): ContinuationRequestOverrides {
  return {
    skillId: task.skillId,
    requestedOutputCount: task.requestedOutputCount,
    executionMode: task.executionMode ?? "confirm",
  }
}
