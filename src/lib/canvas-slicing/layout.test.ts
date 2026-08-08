import { describe, expect, it } from "vitest"

import { layoutSliceResults } from "./layout"

describe("layoutSliceResults", () => {
  it("places slice canvases beside the source without overlap", () => {
    const result = layoutSliceResults({
      sourceBounds: { x: 0, y: 0, w: 360, h: 640 },
      occupiedBounds: [{ x: 420, y: 0, w: 220, h: 220 }],
      candidates: Array.from({ length: 4 }, (_, index) => ({
        id: `candidate-${index}`,
        name: `asset-${index}`,
        assetType: "icon" as const,
        cropMode: "rectangle" as const,
        x: 10,
        y: 10,
        width: 64,
        height: 64,
        confidence: 1,
        recommended: true,
      })),
    })

    expect(result).toHaveLength(4)
    expect(result.every(({ bounds }) => bounds.x > 360)).toBe(true)
    const keys = new Set(result.map(({ bounds }) => `${bounds.x}:${bounds.y}`))
    expect(keys.size).toBe(4)
  })

  it("keeps the slice at its source display size instead of capping it", () => {
    const [result] = layoutSliceResults({
      sourceBounds: { x: 0, y: 0, w: 750, h: 1624 },
      sourceImageSize: { width: 750, height: 1624 },
      occupiedBounds: [],
      candidates: [
        {
          id: "candidate-title",
          name: "page-title",
          assetType: "region",
          cropMode: "rectangle",
          x: 10,
          y: 10,
          width: 640,
          height: 220,
          confidence: 1,
          recommended: true,
        },
      ],
    })

    expect(result.bounds.w).toBe(640)
    expect(result.bounds.h).toBe(220)
  })

  it("matches the slice to a scaled source image on the canvas", () => {
    const [result] = layoutSliceResults({
      sourceBounds: { x: 0, y: 0, w: 375, h: 812 },
      sourceImageSize: { width: 750, height: 1624 },
      occupiedBounds: [],
      candidates: [
        {
          id: "candidate-title",
          name: "page-title",
          assetType: "region",
          cropMode: "rectangle",
          x: 50,
          y: 100,
          width: 600,
          height: 200,
          confidence: 1,
          recommended: true,
        },
      ],
    })

    expect(result.bounds.w).toBe(300)
    expect(result.bounds.h).toBe(100)
  })
})
