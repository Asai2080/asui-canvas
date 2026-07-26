import {
  canvasContextInputNodeSchema,
  canvasContextSnapshotSchema,
  type CanvasContextAnnotation,
  type CanvasContextInputMedia,
  type CanvasContextInputNode,
  type CanvasContextMedia,
  type CanvasContextNode,
  type CanvasContextScope,
  type CanvasContextSnapshot,
  type ParsedCanvasContextInputNode,
} from "./schema"

type BuildCanvasContextInput = {
  scope: CanvasContextScope
  selectedNodeId?: string
  nodes: CanvasContextInputNode[]
}

type BuildCanvasContextOptions = {
  snapshotId?: string
  createdAt?: string
}

function sanitizeMedia(media?: CanvasContextInputMedia): CanvasContextMedia | undefined {
  if (!media) {
    return undefined
  }

  if (
    media.src.startsWith("data:") ||
    media.src.startsWith("blob:") ||
    media.src.includes("base64")
  ) {
    return {
      referenceType: "inline-omitted",
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
    }
  }

  const src = media.src.trim()
  if (!src) {
    return undefined
  }

  return {
    referenceType: "url",
    mediaType: media.mediaType,
    src,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
  }
}

function sanitizeNode(node: ParsedCanvasContextInputNode): CanvasContextNode {
  return {
    ...node,
    media: sanitizeMedia(node.media),
  }
}

function normalizeAnnotationBounds(
  annotation: CanvasContextInputNode,
  source: ParsedCanvasContextInputNode
) {
  if (source.bounds.w <= 0 || source.bounds.h <= 0) {
    return undefined
  }

  return {
    x: (annotation.bounds.x - source.bounds.x) / source.bounds.w,
    y: (annotation.bounds.y - source.bounds.y) / source.bounds.h,
    w: annotation.bounds.w / source.bounds.w,
    h: annotation.bounds.h / source.bounds.h,
  }
}

function uniqueNodes(nodes: ParsedCanvasContextInputNode[]) {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    if (seen.has(node.id)) {
      return false
    }
    seen.add(node.id)
    return true
  })
}

function collectConnectedNodes(
  source: ParsedCanvasContextInputNode,
  nodes: ParsedCanvasContextInputNode[]
) {
  const sourceReferences = new Set(source.referenceIds)
  return uniqueNodes(
    nodes.filter((node) => {
      if (node.id === source.id || node.kind === "annotation") {
        return false
      }

      return (
        node.sourceNodeId === source.id ||
        source.sourceNodeId === node.id ||
        node.parentNodeId === source.id ||
        source.parentNodeId === node.id ||
        node.referenceIds.includes(source.id) ||
        sourceReferences.has(node.id)
      )
    })
  )
}

function collectReferences(
  source: ParsedCanvasContextInputNode,
  connectedNodes: ParsedCanvasContextInputNode[],
  nodes: ParsedCanvasContextInputNode[]
) {
  const referenceIds = new Set([
    ...source.referenceIds,
    ...connectedNodes.flatMap((node) => node.referenceIds),
  ])

  return nodes.filter(
    (node) =>
      referenceIds.has(node.id) &&
      node.id !== source.id &&
      node.kind !== "annotation" &&
      Boolean(node.media)
  )
}

export function buildCanvasContextSnapshot(
  input: BuildCanvasContextInput,
  options: BuildCanvasContextOptions = {}
): CanvasContextSnapshot {
  const nodes = input.nodes.map((node) => canvasContextInputNodeSchema.parse(node))
  const source = input.selectedNodeId
    ? nodes.find((node) => node.id === input.selectedNodeId)
    : undefined

  const annotations: CanvasContextAnnotation[] = source
    ? nodes
        .filter(
          (node) =>
            node.kind === "annotation" &&
            node.sourceNodeId === source.id &&
            Boolean(node.text?.trim())
        )
        .map((node) => ({
          id: node.id,
          sourceNodeId: source.id,
          text: node.text!.trim(),
          bounds: node.bounds,
          normalizedBounds: normalizeAnnotationBounds(node, source),
        }))
    : []

  const connectedNodes = source ? collectConnectedNodes(source, nodes) : []
  const references = source ? collectReferences(source, connectedNodes, nodes) : []

  return canvasContextSnapshotSchema.parse({
    id: options.snapshotId ?? `context-${crypto.randomUUID()}`,
    createdAt: options.createdAt ?? new Date().toISOString(),
    scope: input.scope,
    selectedNodeId: input.selectedNodeId,
    sourceNode: source ? sanitizeNode(source) : undefined,
    annotations,
    connectedNodes: connectedNodes.map(sanitizeNode),
    references: references.map(sanitizeNode),
    canvasNodes:
      input.scope === "whole-canvas"
        ? nodes.filter((node) => node.kind !== "annotation").map(sanitizeNode)
        : undefined,
  })
}
