import type { AgentTask } from "@/lib/canvas-agent/task-schema"

const DEFAULT_ADVANCE_DELAY_MS = 750
const VIDEO_POLL_DELAY_MS = 2_500

export function agentTaskAdvanceDelay(task: AgentTask) {
  if (task.status !== "executing" || !task.activeStepId) {
    return DEFAULT_ADVANCE_DELAY_MS
  }

  const activeStep = task.executionPlan?.steps.find(
    (step) => step.id === task.activeStepId
  )
  const hasProviderJob = Boolean(task.providerJobIds?.[task.activeStepId])
  return activeStep?.tool === "generate_video" &&
    activeStep.status === "running" &&
    hasProviderJob
    ? VIDEO_POLL_DELAY_MS
    : DEFAULT_ADVANCE_DELAY_MS
}
