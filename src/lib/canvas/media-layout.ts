import type { Bounds } from "@/lib/canvas/types"

export const CANVAS_MEDIA_INSET = 6
export const IMPORTED_IMAGE_CANVAS_LONG_EDGE = 560

export function fitImportedImageCanvasSize(
  size: { width: number; height: number },
  longEdge = IMPORTED_IMAGE_CANVAS_LONG_EDGE
) {
  const width = Math.max(1, size.width)
  const height = Math.max(1, size.height)
  const scale = Math.max(1, longEdge) / Math.max(width, height)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function insetCanvasMediaBounds(
  bounds: Bounds,
  inset = CANVAS_MEDIA_INSET
): Bounds {
  const insetX = Math.min(inset, Math.max(0, (bounds.w - 1) / 2))
  const insetY = Math.min(inset, Math.max(0, (bounds.h - 1) / 2))

  return {
    x: bounds.x + insetX,
    y: bounds.y + insetY,
    w: Math.max(1, bounds.w - insetX * 2),
    h: Math.max(1, bounds.h - insetY * 2),
  }
}
