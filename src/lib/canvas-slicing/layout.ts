import type { Bounds } from "../canvas/types"
import { expandBounds, findClearPlacement, intersects } from "../canvas/geometry"
import type { SliceCandidate } from "./schema"

export type SliceLayoutItem = {
  candidate: SliceCandidate
  bounds: Bounds
}

export function getSliceDisplaySize(
  slice: { width: number; height: number },
  sourceBounds: Pick<Bounds, "w" | "h">,
  sourceImageSize?: { width: number; height: number }
) {
  const scaleX = sourceImageSize
    ? sourceBounds.w / Math.max(1, sourceImageSize.width)
    : 1
  const scaleY = sourceImageSize
    ? sourceBounds.h / Math.max(1, sourceImageSize.height)
    : 1

  return {
    width: Math.max(1, Math.round(slice.width * scaleX)),
    height: Math.max(1, Math.round(slice.height * scaleY)),
  }
}

export function layoutSliceResults({
  candidates,
  sourceBounds,
  sourceImageSize,
  occupiedBounds,
  gap = 28,
}: {
  candidates: SliceCandidate[]
  sourceBounds: Bounds
  sourceImageSize?: { width: number; height: number }
  occupiedBounds: Bounds[]
  gap?: number
}): SliceLayoutItem[] {
  const columns = candidates.length <= 2 ? 1 : 2
  const obstacles = [...occupiedBounds]
  const itemSizes = candidates.map((candidate) =>
    getSliceDisplaySize(candidate, sourceBounds, sourceImageSize)
  )
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(...itemSizes.filter((_, index) => index % columns === column).map(({ width }) => width))
  )
  const columnX: number[] = []
  let nextColumnX = sourceBounds.x + sourceBounds.w + 64
  for (const columnWidth of columnWidths) {
    columnX.push(nextColumnX)
    nextColumnX += columnWidth + gap
  }
  const columnY = Array.from({ length: columns }, () => sourceBounds.y)

  return candidates.map((candidate, index) => {
    const { width, height } = itemSizes[index]
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
