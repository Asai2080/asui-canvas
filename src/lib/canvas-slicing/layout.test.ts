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
})
