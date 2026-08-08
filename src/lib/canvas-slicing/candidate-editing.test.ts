import { describe, expect, it } from "vitest"

import {
  moveSliceRect,
  resizeSliceRect,
  updateSliceRectField,
} from "./candidate-editing"

const rect = { x: 100, y: 80, width: 120, height: 90 }

describe("slice candidate editing", () => {
  it("moves a rectangle while keeping it inside the source image", () => {
    expect(moveSliceRect(rect, 30, -20, 320, 240)).toEqual({
      x: 130,
      y: 60,
      width: 120,
      height: 90,
    })
    expect(moveSliceRect(rect, 500, 500, 320, 240)).toEqual({
      x: 200,
      y: 150,
      width: 120,
      height: 90,
    })
  })

  it("resizes from each corner without crossing the minimum size", () => {
    expect(resizeSliceRect(rect, "nw", -20, -10, 320, 240)).toEqual({
      x: 80,
      y: 70,
      width: 140,
      height: 100,
    })
    expect(resizeSliceRect(rect, "se", 40, 80, 320, 240)).toEqual({
      x: 100,
      y: 80,
      width: 160,
      height: 160,
    })
    expect(resizeSliceRect(rect, "nw", 500, 500, 320, 240)).toEqual({
      x: 212,
      y: 162,
      width: 8,
      height: 8,
    })
  })

  it("updates numeric geometry fields while keeping the rectangle in bounds", () => {
    expect(updateSliceRectField(rect, "width", 300, 320, 240)).toEqual({
      x: 100,
      y: 80,
      width: 220,
      height: 90,
    })
    expect(updateSliceRectField(rect, "x", 260, 320, 240)).toEqual({
      x: 200,
      y: 80,
      width: 120,
      height: 90,
    })
    expect(updateSliceRectField(rect, "height", 2, 320, 240)).toEqual({
      x: 100,
      y: 80,
      width: 120,
      height: 8,
    })
  })
})
