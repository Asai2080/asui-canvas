import { describe, expect, it } from "vitest"

import { normalizeCanvasSize, resolveDraftCanvasSize, sanitizeCanvasSizeInput } from "./size"

describe("canvas size controls", () => {
  it("keeps numeric draft input editable before applying", () => {
    expect(sanitizeCanvasSizeInput("800")).toBe("800")
    expect(sanitizeCanvasSizeInput("1024px")).toBe("1024")
  })

  it("applies typed width and height instead of clamping every keystroke", () => {
    expect(resolveDraftCanvasSize({ width: "800", height: "1024" }, { width: 360, height: 480 })).toEqual({
      width: 800,
      height: 1024,
    })
  })

  it("allows small custom sizes such as 90px", () => {
    expect(resolveDraftCanvasSize({ width: "90", height: "120" }, { width: 360, height: 480 })).toEqual({
      width: 90,
      height: 120,
    })
  })

  it("clamps only invisible or oversized drafts when applied", () => {
    expect(resolveDraftCanvasSize({ width: "0", height: "5000" }, { width: 360, height: 480 })).toEqual({
      width: 1,
      height: 4096,
    })
  })

  it("falls back to the current size for empty drafts", () => {
    expect(resolveDraftCanvasSize({ width: "", height: "" }, { width: 640, height: 360 })).toEqual({
      width: 640,
      height: 360,
    })
  })

  it("normalizes canvas sizes to the supported range", () => {
    expect(normalizeCanvasSize({ width: 0, height: 5000.8 })).toEqual({
      width: 1,
      height: 4096,
    })
  })
})
