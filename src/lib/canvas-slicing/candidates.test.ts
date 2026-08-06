import { describe, expect, it } from "vitest"

import { normalizeSliceCandidates } from "./candidates"

describe("normalizeSliceCandidates", () => {
  it("clamps candidates to image pixels and removes near duplicates", () => {
    const result = normalizeSliceCandidates([
      { name: "logo", type: "logo", x: -4, y: 10, width: 60, height: 40, confidence: 0.9 },
      { name: "same-logo", type: "logo", x: 1, y: 11, width: 56, height: 38, confidence: 0.7 },
      { name: "hero", type: "illustration", x: 200, y: 80, width: 180, height: 220, confidence: 0.8 },
    ], 360, 640)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: "logo", x: 0, y: 10, width: 60, height: 40 })
    expect(result[1]).toMatchObject({ name: "hero", x: 180, width: 180 })
  })

  it("filters whole-screen and low-confidence guesses", () => {
    const result = normalizeSliceCandidates([
      { name: "screen", x: 0, y: 0, width: 1000, height: 1000, confidence: 0.9 },
      { name: "guess", x: 10, y: 10, width: 20, height: 20, confidence: 0.2 },
    ], 1000, 1000)

    expect(result).toEqual([])
  })

  it("keeps skipped semantic elements visible without selecting them", () => {
    const result = normalizeSliceCandidates([
      {
        name: "hero-title",
        assetType: "region",
        elementType: "text",
        decision: "skip",
        x: 40,
        y: 24,
        width: 260,
        height: 48,
        confidence: 0.98,
        reason: "文字应保持可编辑，不应栅格化",
      },
      {
        name: "hero-product",
        assetType: "illustration",
        elementType: "product",
        decision: "extract",
        x: 80,
        y: 120,
        width: 180,
        height: 220,
        confidence: 0.91,
        reason: "主体边界完整，可作为独立素材复用",
      },
    ], 360, 640)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ elementType: "product", decision: "extract", recommended: true })
    expect(result[1]).toMatchObject({ elementType: "text", decision: "skip", recommended: false })
  })

  it("forces non-extractable UI elements to skip even when the model is overconfident", () => {
    const result = normalizeSliceCandidates([
      {
        name: "primary-button",
        assetType: "region",
        elementType: "button",
        decision: "extract",
        recommended: true,
        x: 24,
        y: 500,
        width: 220,
        height: 52,
        confidence: 1,
      },
      {
        name: "product-packaging",
        assetType: "illustration",
        elementType: "product",
        decision: "extract",
        x: 60,
        y: 90,
        width: 160,
        height: 220,
        confidence: 0.86,
      },
    ], 320, 640)

    expect(result.find((item) => item.elementType === "button")).toMatchObject({
      decision: "skip",
      recommended: false,
    })
    expect(result.find((item) => item.elementType === "product")).toMatchObject({
      decision: "extract",
      recommended: true,
    })
  })

  it("always starts automatic candidates with the original background", () => {
    const result = normalizeSliceCandidates([
      {
        name: "product",
        assetType: "illustration",
        elementType: "product",
        cropMode: "transparent",
        x: 20,
        y: 20,
        width: 120,
        height: 160,
        confidence: 0.9,
      },
    ], 240, 240)

    expect(result[0]).toMatchObject({ cropMode: "rectangle" })
  })
})
