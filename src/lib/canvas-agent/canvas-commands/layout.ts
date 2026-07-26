import type { AgentArtifact, AgentTask } from "../task-schema"
import {
  agentCanvasCommandBatchSchema,
  type AgentCanvasCommand,
  type AgentCanvasCommandBatch,
  type CanvasCommandBounds,
} from "./schema"

type ViewportBounds = CanvasCommandBounds

type ArtifactLayout = {
  artifact: AgentArtifact
  bounds: CanvasCommandBounds
}

type LayoutAgentArtifactsInput = {
  artifacts: AgentArtifact[]
  sourceBounds?: CanvasCommandBounds
  viewportBounds: ViewportBounds
  gap?: number
  videoSize?: {
    width: number
    height: number
  }
}

type BuildCommandBatchInput = {
  task: AgentTask
  sourceBounds?: CanvasCommandBounds
  viewportBounds: ViewportBounds
  gap?: number
}

const DEFAULT_GAP = 64
const DEFAULT_VIDEO_SIZE = { width: 640, height: 360 }
const MAX_COLUMNS = 2

function orderedStepIds(task: AgentTask) {
  const executionStepIds =
    task.executionPlan?.steps.map((step) => step.id) ?? []
  const artifactStepIds = Object.keys(task.artifacts ?? {}).sort()

  return [
    ...executionStepIds,
    ...artifactStepIds.filter((stepId) => !executionStepIds.includes(stepId)),
  ]
}

export function flattenAgentTaskArtifacts(task: AgentTask) {
  const artifactsByStep = task.artifacts ?? {}

  return orderedStepIds(task).flatMap((stepId) => artifactsByStep[stepId] ?? [])
}

function artifactSize(
  artifact: AgentArtifact,
  sourceBounds: CanvasCommandBounds | undefined,
  videoSize: { width: number; height: number }
) {
  if (artifact.kind === "image") {
    return { width: artifact.width, height: artifact.height }
  }

  if (sourceBounds) {
    return { width: sourceBounds.w, height: sourceBounds.h }
  }

  return videoSize
}

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

export function layoutAgentArtifacts({
  artifacts,
  sourceBounds,
  viewportBounds,
  gap = DEFAULT_GAP,
  videoSize = DEFAULT_VIDEO_SIZE,
}: LayoutAgentArtifactsInput): ArtifactLayout[] {
  if (artifacts.length === 0) return []

  const columns = Math.min(MAX_COLUMNS, artifacts.length)
  const sizedArtifacts = artifacts.map((artifact) => ({
    artifact,
    size: artifactSize(artifact, sourceBounds, videoSize),
  }))
  const rows = chunk(sizedArtifacts, columns)
  const rowHeights = rows.map((row) =>
    Math.max(...row.map(({ size }) => size.height))
  )
  const totalHeight =
    rowHeights.reduce((total, height) => total + height, 0) +
    gap * Math.max(0, rows.length - 1)
  const startY = sourceBounds
    ? sourceBounds.y
    : viewportBounds.y + Math.max(0, (viewportBounds.h - totalHeight) / 2)
  const sourceRight = sourceBounds
    ? sourceBounds.x + sourceBounds.w + gap
    : undefined

  let rowY = startY
  return rows.flatMap((row, rowIndex) => {
    const rowWidth =
      row.reduce((total, { size }) => total + size.width, 0) +
      gap * Math.max(0, row.length - 1)
    let itemX =
      sourceRight ??
      viewportBounds.x + Math.max(0, (viewportBounds.w - rowWidth) / 2)

    const results = row.map(({ artifact, size }) => {
      const result = {
        artifact,
        bounds: {
          x: itemX,
          y: rowY,
          w: size.width,
          h: size.height,
        },
      }
      itemX += size.width + gap
      return result
    })

    rowY += rowHeights[rowIndex] + gap
    return results
  })
}

function nodeRefFor(artifact: AgentArtifact) {
  return `result-${artifact.id}`
}

export function buildAgentCanvasCommandBatch({
  task,
  sourceBounds,
  viewportBounds,
  gap,
}: BuildCommandBatchInput): AgentCanvasCommandBatch {
  const artifacts = flattenAgentTaskArtifacts(task)
  const layouts = layoutAgentArtifacts({
    artifacts,
    sourceBounds,
    viewportBounds,
    gap,
  })
  const commands: AgentCanvasCommand[] = []
  const resultRefs: string[] = []

  for (const { artifact, bounds } of layouts) {
    const nodeRef = nodeRefFor(artifact)
    resultRefs.push(nodeRef)

    if (artifact.kind === "image") {
      commands.push({
        type: "create-image-node",
        nodeRef,
        artifact,
        bounds,
      })
    } else {
      commands.push({
        type: "create-video-node",
        nodeRef,
        artifact,
        prompt: task.userInstruction,
        bounds,
      })
    }

    if (task.selectedCanvasId) {
      commands.push({
        type: "connect-nodes",
        sourceNodeId: task.selectedCanvasId,
        targetNodeRef: nodeRef,
      })
    }
  }

  if (resultRefs[0]) {
    commands.push({
      type: "set-recommended-result",
      nodeRef: resultRefs[0],
    })
    commands.push({
      type: "focus-results",
      nodeRefs: resultRefs,
    })
  }

  return agentCanvasCommandBatchSchema.parse({
    id: `canvas-write-${task.id}-r${task.revision}`,
    taskId: task.id,
    createdAt: task.updatedAt,
    commands,
  })
}
