import type { Bounds, NormalizedBounds } from "./types"

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function intersects(a: Bounds, b: Bounds) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function expandBounds(bounds: Bounds, amount: number): Bounds {
  return {
    x: bounds.x - amount,
    y: bounds.y - amount,
    w: bounds.w + amount * 2,
    h: bounds.h + amount * 2,
  }
}

export function normalizeBounds(image: Bounds, annotation: Bounds): NormalizedBounds {
  const left = clamp01((annotation.x - image.x) / image.w)
  const top = clamp01((annotation.y - image.y) / image.h)
  const right = clamp01((annotation.x + annotation.w - image.x) / image.w)
  const bottom = clamp01((annotation.y + annotation.h - image.y) / image.h)

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  }
}

export function findClearPlacement({
  anchor,
  width,
  height,
  obstacles,
  margin = 40,
  direction = "right",
  maxAttempts = 80,
}: {
  anchor: Bounds
  width: number
  height: number
  obstacles: Bounds[]
  margin?: number
  direction?: "right" | "left" | "below"
  maxAttempts?: number
}): Bounds {
  const safeMargin = Math.max(0, margin)
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  let x = anchor.x + anchor.w + safeMargin
  let y = anchor.y

  if (direction === "left") {
    x = anchor.x - safeWidth - safeMargin
  }

  if (direction === "below") {
    x = anchor.x
    y = anchor.y + anchor.h + safeMargin
  }

  const stepX = safeWidth + safeMargin
  const stepY = safeHeight + safeMargin

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = { x, y, w: safeWidth, h: safeHeight }
    const hasCollision = obstacles.some((obstacle) => intersects(expandBounds(candidate, safeMargin / 2), obstacle))

    if (!hasCollision) return candidate

    if (direction === "left") {
      x -= stepX
    } else if (direction === "below") {
      y += stepY
    } else {
      x += stepX
    }
  }

  return { x, y, w: safeWidth, h: safeHeight }
}
