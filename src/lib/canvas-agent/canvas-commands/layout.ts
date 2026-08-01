import type { AgentArtifact, AgentTask } from "../task-schema"
import {
  agentCanvasCommandBatchSchema,
  type AgentCanvasCommand,
  type AgentCanvasCommandBatch,
  type CanvasCommandBounds,
  type CanvasOccupiedBounds,
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
  occupiedBounds?: CanvasOccupiedBounds[]
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
  occupiedBounds?: CanvasOccupiedBounds[]
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

  if (artifact.kind === "model3d") {
    return { width: 720, height: 720 }
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

function boundsOverlapWithGap(
  left: CanvasCommandBounds,
  right: CanvasCommandBounds,
  gap: number
) {
  return (
    left.x < right.x + right.w + gap &&
    left.x + left.w + gap > right.x &&
    left.y < right.y + right.h + gap &&
    left.y + left.h + gap > right.y
  )
}

function enclosingBounds(bounds: CanvasCommandBounds[]) {
  const left = Math.min(...bounds.map((item) => item.x))
  const top = Math.min(...bounds.map((item) => item.y))
  const right = Math.max(...bounds.map((item) => item.x + item.w))
  const bottom = Math.max(...bounds.map((item) => item.y + item.h))
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  }
}

export function offsetBoundsGroupToAvoidOverlaps(
  bounds: CanvasCommandBounds[],
  occupiedBounds: CanvasCommandBounds[] = [],
  gap = DEFAULT_GAP
) {
  if (bounds.length === 0 || occupiedBounds.length === 0) return bounds

  let placed = bounds.map((item) => ({ ...item }))
  for (let attempt = 0; attempt <= occupiedBounds.length; attempt += 1) {
    const groupBounds = enclosingBounds(placed)
    const collisions = occupiedBounds.filter((occupied) =>
      boundsOverlapWithGap(groupBounds, occupied, gap)
    )
    if (collisions.length === 0) return placed

    const nextLeft = Math.max(
      ...collisions.map((item) => item.x + item.w + gap)
    )
    const offsetX = Math.max(gap, nextLeft - groupBounds.x)
    placed = placed.map((item) => ({ ...item, x: item.x + offsetX }))
  }

  return placed
}

export function layoutAgentArtifacts({
  artifacts,
  sourceBounds,
  viewportBounds,
  occupiedBounds = [],
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
  const columnWidths = Array.from({ length: columns }, (_, columnIndex) =>
    Math.max(
      ...sizedArtifacts
        .filter((_, index) => index % columns === columnIndex)
        .map(({ size }) => size.width)
    )
  )
  const columnOffsets = columnWidths.map((_, columnIndex) =>
    columnWidths
      .slice(0, columnIndex)
      .reduce((total, width) => total + width + gap, 0)
  )
  const gridWidth =
    columnWidths.reduce((total, width) => total + width, 0) +
    gap * Math.max(0, columns - 1)
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

  const gridX =
    sourceRight ??
    viewportBounds.x + Math.max(0, (viewportBounds.w - gridWidth) / 2)
  let rowY = startY
  const layouts = rows.flatMap((row, rowIndex) => {
    const results = row.map(({ artifact, size }, columnIndex) => {
      return {
        artifact,
        bounds: {
          x: gridX + columnOffsets[columnIndex],
          y: rowY,
          w: size.width,
          h: size.height,
        },
      }
    })

    rowY += rowHeights[rowIndex] + gap
    return results
  })
  const placedBounds = offsetBoundsGroupToAvoidOverlaps(
    layouts.map(({ bounds }) => bounds),
    occupiedBounds,
    gap
  )

  return layouts.map((layout, index) => ({
    ...layout,
    bounds: placedBounds[index],
  }))
}

function nodeRefFor(artifact: AgentArtifact) {
  return `result-${artifact.id}`
}

function variantKeyForArtifact(task: AgentTask, artifact: AgentArtifact) {
  const stepId = Object.entries(task.artifacts ?? {}).find(([, artifacts]) =>
    artifacts.some((candidate) => candidate.id === artifact.id)
  )?.[0]
  const generationIndex = stepId?.match(/^generate-(\d+)$/)?.[1]
  if (!generationIndex) return undefined
  return task.compiledPrompt?.outputs[Number(generationIndex) - 1]?.variantKey
}

function matchingWorldImageVariant(variantKey?: string) {
  const scene = variantKey?.match(/^world-scene-(\d{2})-video$/)?.[1]
  return scene ? `world-scene-${scene}-image` : undefined
}

export function buildAgentCanvasCommandBatch({
  task,
  sourceBounds,
  viewportBounds,
  occupiedBounds = [],
  gap,
}: BuildCommandBatchInput): AgentCanvasCommandBatch {
  const artifacts = flattenAgentTaskArtifacts(task)
  const taskPromptBounds = occupiedBounds.filter(
    (bounds) => bounds.taskId === task.id
  )
  const placementAnchor =
    taskPromptBounds.length > 0
      ? enclosingBounds(taskPromptBounds)
      : sourceBounds
  const otherOccupiedBounds = occupiedBounds.filter(
    (bounds) => bounds.taskId !== task.id
  )
  const layouts = layoutAgentArtifacts({
    artifacts,
    sourceBounds: placementAnchor,
    viewportBounds,
    occupiedBounds: otherOccupiedBounds,
    gap,
  })
  const commands: AgentCanvasCommand[] = []
  const resultRefs: string[] = []
  const resultRefByVariant = new Map<string, string>()

  for (const { artifact } of layouts) {
    const variantKey = variantKeyForArtifact(task, artifact)
    if (variantKey) resultRefByVariant.set(variantKey, nodeRefFor(artifact))
  }

  for (const { artifact, bounds } of layouts) {
    const nodeRef = nodeRefFor(artifact)
    const variantKey = variantKeyForArtifact(task, artifact)
    resultRefs.push(nodeRef)

    if (artifact.kind === "image") {
      commands.push({
        type: "create-image-node",
        nodeRef,
        artifact,
        bounds,
      })
    } else if (artifact.kind === "video") {
      commands.push({
        type: "create-video-node",
        nodeRef,
        artifact,
        prompt: task.userInstruction,
        bounds,
      })
    } else {
      commands.push({
        type: "create-3d-model-node",
        nodeRef,
        artifact,
        bounds,
      })
    }

    const worldImageVariant = matchingWorldImageVariant(variantKey)
    const worldImageRef = worldImageVariant
      ? resultRefByVariant.get(worldImageVariant)
      : undefined
    if (worldImageRef) {
      commands.push({
        type: "connect-nodes",
        sourceNodeRef: worldImageRef,
        targetNodeRef: nodeRef,
      })
    } else if (task.selectedCanvasId) {
      commands.push({
        type: "connect-nodes",
        sourceNodeId: task.selectedCanvasId,
        targetNodeRef: nodeRef,
      })
    }
  }

  const recommendedRef = resultRefs[0]

  if (recommendedRef) {
    commands.push({
      type: "set-recommended-result",
      nodeRef: recommendedRef,
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
