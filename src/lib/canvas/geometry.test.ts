import { describe, expect, it } from "vitest"

import { expandBounds, findClearPlacement, intersects, normalizeBounds } from "./geometry"

const image = { x: 100, y: 100, w: 400, h: 400 }

describe("canvas geometry", () => {
  it("detects overlapping bounds", () => {
    expect(intersects(image, { x: 200, y: 200, w: 120, h: 80 })).toBe(true)
    expect(intersects(image, { x: 700, y: 700, w: 50, h: 50 })).toBe(false)
  })

  it("expands bounds equally in every direction", () => {
    expect(expandBounds(image, 24)).toEqual({ x: 76, y: 76, w: 448, h: 448 })
  })

  it("normalizes an annotation into image space", () => {
    expect(normalizeBounds(image, { x: 200, y: 200, w: 200, h: 200 })).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    })
  })

  it("clamps annotations that extend outside the image", () => {
    expect(normalizeBounds(image, { x: 20, y: 20, w: 600, h: 600 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    })
  })

  it("places generated revisions beside the anchor when the area is clear", () => {
    expect(
      findClearPlacement({
        anchor: image,
        width: 200,
        height: 240,
        obstacles: [image],
        margin: 40,
      })
    ).toEqual({ x: 540, y: 100, w: 200, h: 240 })
  })

  it("moves generated revisions to avoid existing shapes", () => {
    expect(
      findClearPlacement({
        anchor: image,
        width: 200,
        height: 240,
        obstacles: [image, { x: 540, y: 100, w: 200, h: 240 }],
        margin: 40,
      })
    ).toEqual({ x: 780, y: 100, w: 200, h: 240 })
  })
})
