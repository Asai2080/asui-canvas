import type { Bounds } from "@/lib/canvas/types"

export const CANVAS_MEDIA_INSET = 6

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
