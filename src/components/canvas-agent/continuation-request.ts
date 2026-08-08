import type {
  AgentExecutionMode,
  AgentTask,
} from "../../lib/canvas-agent/task-schema"

export type ContinuationRequestOverrides = {
  skillId?: string
  requestedOutputCount?: number
  executionMode: AgentExecutionMode
  continuationOfTaskId?: string
}

export function continuationRequestOverrides(
  task: AgentTask
): ContinuationRequestOverrides {
  return {
    skillId: task.skillId,
    requestedOutputCount: task.requestedOutputCount,
    executionMode: task.executionMode ?? "confirm",
    continuationOfTaskId: task.id,
  }
}

export function canContinueClarification(
  task: AgentTask,
  selectedSkillId?: string
) {
  return !selectedSkillId || task.skillId === selectedSkillId
}
