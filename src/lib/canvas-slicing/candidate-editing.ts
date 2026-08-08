import type { SliceRect } from "./schema"

export type SliceResizeHandle = "nw" | "ne" | "sw" | "se"
export type SliceRectField = keyof SliceRect

const MIN_SLICE_SIZE = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function moveSliceRect(
  rect: SliceRect,
  deltaX: number,
  deltaY: number,
  sourceWidth: number,
  sourceHeight: number
): SliceRect {
  return {
    ...rect,
    x: Math.round(clamp(rect.x + deltaX, 0, sourceWidth - rect.width)),
    y: Math.round(clamp(rect.y + deltaY, 0, sourceHeight - rect.height)),
  }
}

export function resizeSliceRect(
  rect: SliceRect,
  handle: SliceResizeHandle,
  deltaX: number,
  deltaY: number,
  sourceWidth: number,
  sourceHeight: number
): SliceRect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  const nextLeft = handle.endsWith("w")
    ? clamp(left + deltaX, 0, right - MIN_SLICE_SIZE)
    : left
  const nextRight = handle.endsWith("e")
    ? clamp(right + deltaX, left + MIN_SLICE_SIZE, sourceWidth)
    : right
  const nextTop = handle.startsWith("n")
    ? clamp(top + deltaY, 0, bottom - MIN_SLICE_SIZE)
    : top
  const nextBottom = handle.startsWith("s")
    ? clamp(bottom + deltaY, top + MIN_SLICE_SIZE, sourceHeight)
    : bottom

  return {
    x: Math.round(nextLeft),
    y: Math.round(nextTop),
    width: Math.round(nextRight - nextLeft),
    height: Math.round(nextBottom - nextTop),
  }
}

export function updateSliceRectField(
  rect: SliceRect,
  field: SliceRectField,
  value: number,
  sourceWidth: number,
  sourceHeight: number
): SliceRect {
  const roundedValue = Math.round(Number.isFinite(value) ? value : rect[field])

  if (field === "x") {
    return { ...rect, x: clamp(roundedValue, 0, sourceWidth - rect.width) }
  }
  if (field === "y") {
    return { ...rect, y: clamp(roundedValue, 0, sourceHeight - rect.height) }
  }
  if (field === "width") {
    return {
      ...rect,
      width: clamp(roundedValue, MIN_SLICE_SIZE, sourceWidth - rect.x),
    }
  }
  return {
    ...rect,
    height: clamp(roundedValue, MIN_SLICE_SIZE, sourceHeight - rect.y),
  }
}
