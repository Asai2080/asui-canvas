import type { Bounds } from "../canvas/types"
import { expandBounds, findClearPlacement, intersects } from "../canvas/geometry"
import type { SliceCandidate } from "./schema"

export type SliceLayoutItem = {
  candidate: SliceCandidate
  bounds: Bounds
}

export function layoutSliceResults({
  candidates,
  sourceBounds,
  occupiedBounds,
  gap = 28,
  maxItemEdge = 220,
}: {
  candidates: SliceCandidate[]
  sourceBounds: Bounds
  occupiedBounds: Bounds[]
  gap?: number
  maxItemEdge?: number
}): SliceLayoutItem[] {
  const columns = candidates.length <= 2 ? 1 : 2
  const obstacles = [...occupiedBounds]
  const columnX = Array.from({ length: columns }, (_, index) =>
    sourceBounds.x + sourceBounds.w + 64 + index * (maxItemEdge + gap)
  )
  const columnY = Array.from({ length: columns }, () => sourceBounds.y)

  return candidates.map((candidate, index) => {
    const scale = Math.min(1, maxItemEdge / Math.max(candidate.width, candidate.height))
    const width = Math.max(48, Math.round(candidate.width * scale))
    const height = Math.max(48, Math.round(candidate.height * scale))
    const column = index % columns
    const desired: Bounds = {
      x: columnX[column],
      y: columnY[column],
      w: width,
      h: height,
    }
    const collision = obstacles.some((obstacle) => intersects(expandBounds(desired, 12), obstacle))
    const bounds = collision
      ? findClearPlacement({
          anchor: desired,
          width,
          height,
          obstacles,
          margin: gap,
        })
      : desired

    obstacles.push(bounds)
    columnY[column] = bounds.y + bounds.h + gap
    return { candidate, bounds }
  })
}
