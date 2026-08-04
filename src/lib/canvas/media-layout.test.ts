import { describe, expect, it } from "vitest"

import {
  fitImportedImageCanvasSize,
  insetCanvasMediaBounds,
} from "./media-layout"

describe("insetCanvasMediaBounds", () => {
  it("places generated media inside the six pixel canvas frame", () => {
    expect(insetCanvasMediaBounds({ x: 0, y: 0, w: 360, h: 480 })).toEqual({
      x: 6,
      y: 6,
      w: 348,
      h: 468,
    })
  })

  it("keeps very small media bounds valid", () => {
    expect(insetCanvasMediaBounds({ x: 10, y: 20, w: 8, h: 6 })).toEqual({
      x: 13.5,
      y: 22.5,
      w: 1,
      h: 1,
    })
  })
})

describe("fitImportedImageCanvasSize", () => {
  it("fits a portrait import into a readable canvas without changing its aspect ratio", () => {
    expect(fitImportedImageCanvasSize({ width: 1200, height: 1800 })).toEqual({
      width: 373,
      height: 560,
    })
  })

  it("keeps a landscape import within the same long-edge limit", () => {
    expect(fitImportedImageCanvasSize({ width: 1920, height: 1080 })).toEqual({
      width: 560,
      height: 315,
    })
  })
})
