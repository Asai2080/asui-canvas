import { describe, expect, it } from "vitest"

import { getCanvasSizePreset, resolveCanvasSizePreset } from "./size-presets"

describe("canvas size presets", () => {
  it("resolves aspect-ratio presets from the current longest edge", () => {
    expect(resolveCanvasSizePreset("9:16", { width: 1024, height: 1024 })).toEqual({
      width: 1024,
      height: 1820,
    })
  })

  it("resolves landscape aspect-ratio presets without shrinking the current longest edge", () => {
    expect(resolveCanvasSizePreset("16:9", { width: 900, height: 1600 })).toEqual({
      width: 1600,
      height: 900,
    })
  })

  it("resolves fixed document and web presets", () => {
    expect(resolveCanvasSizePreset("a4", { width: 100, height: 100 })).toEqual({
      width: 1024,
      height: 1754,
    })
    expect(resolveCanvasSizePreset("web", { width: 100, height: 100 })).toEqual({
      width: 1366,
      height: 768,
    })
  })

  it("exposes labels and descriptions for the floating selector", () => {
    expect(getCanvasSizePreset("9:16")).toMatchObject({
      id: "9:16",
      label: "9:16",
      group: "ratio",
    })
  })
})
