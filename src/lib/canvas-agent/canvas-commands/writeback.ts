import type { AgentTask } from "../task-schema"
import type {
  CanvasCommandBounds,
  CanvasOccupiedBounds,
} from "./schema"
import type { CanvasCommandBridge } from "./bridge"
import { canvasCommandBridge } from "./bridge"
import { buildAgentCanvasCommandBatch } from "./layout"

type WriteAgentTaskToCanvasInput = {
  task: AgentTask
  sourceBounds?: CanvasCommandBounds
  viewportBounds: CanvasCommandBounds
  occupiedBounds?: CanvasOccupiedBounds[]
}

type WriteAgentTaskToCanvasDependencies = {
  publish?: CanvasCommandBridge["publish"]
  fetcher?: typeof fetch
}

export async function writeAgentTaskToCanvas(
  {
    task,
    sourceBounds,
    viewportBounds,
    occupiedBounds,
  }: WriteAgentTaskToCanvasInput,
  dependencies: WriteAgentTaskToCanvasDependencies = {}
) {
  if (task.status !== "writing-canvas") {
    throw new Error(
      `Canvas Agent task must be writing-canvas before writeback: ${task.id}`
    )
  }

  const batch = buildAgentCanvasCommandBatch({
    task,
    sourceBounds,
    viewportBounds,
    occupiedBounds,
  })
  const acknowledgement = await (
    dependencies.publish ?? canvasCommandBridge.publish
  )(batch)
  const response = await (dependencies.fetcher ?? fetch)(
    `/api/agent/tasks/${encodeURIComponent(task.id)}/writeback`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acknowledgement),
    }
  )
  const payload = (await response.json()) as {
    task?: AgentTask
    error?: string
  }

  if (!response.ok || !payload.task) {
    throw new Error(payload.error ?? "画布写回确认失败")
  }

  return payload.task
}
