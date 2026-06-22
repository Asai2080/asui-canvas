import type { CanvasSize } from "@/lib/canvas/types"

export const MIN_CANVAS_SIZE = 1
export const MAX_CANVAS_SIZE = 1600

const clampSize = (value: number) =>
  Math.min(Math.max(Math.round(value), MIN_CANVAS_SIZE), MAX_CANVAS_SIZE)

export const normalizeCanvasSize = (size: CanvasSize): CanvasSize => ({
  width: clampSize(size.width),
  height: clampSize(size.height),
})

export const sanitizeCanvasSizeInput = (value: string) => value.replace(/\D/g, "")

export function resolveDraftCanvasSize(draft: { width: string; height: string }, fallback: CanvasSize) {
  const nextWidth = Number.parseInt(draft.width, 10)
  const nextHeight = Number.parseInt(draft.height, 10)

  return normalizeCanvasSize({
    width: Number.isFinite(nextWidth) ? nextWidth : fallback.width,
    height: Number.isFinite(nextHeight) ? nextHeight : fallback.height,
  })
}
