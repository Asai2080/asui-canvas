import { describe, expect, it } from "vitest"

import { insetCanvasMediaBounds } from "./media-layout"

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
