import { describe, expect, it } from "vitest"

import {
  parseSafe3dPreviewSpec,
  safe3dPreviewSpecSchema,
} from "./preview-schema"

describe("safe3dPreviewSpecSchema", () => {
  it("accepts only bounded canvas references", () => {
    const parsed = safe3dPreviewSpecSchema.parse({
      version: 1,
      mode: "multiview-proxy",
      title: "3D 多视角代理",
      referenceShapeIds: [
        "shape:image-front",
        "shape:image-side",
        "shape:image-back",
        "shape:image-top",
      ],
    })

    expect(parsed).toMatchObject({
      mode: "multiview-proxy",
    })
    expect(parsed.referenceShapeIds).toHaveLength(4)
  })

  it("rejects duplicate references, external URLs, and executable fields", () => {
    expect(
      parseSafe3dPreviewSpec({
        version: 1,
        mode: "multiview-proxy",
        title: "Unsafe",
        referenceShapeIds: [
          "shape:image-front",
          "shape:image-front",
        ],
      }).success
    ).toBe(false)
    expect(
      parseSafe3dPreviewSpec({
        version: 1,
        mode: "multiview-proxy",
        title: "Unsafe",
        referenceShapeIds: [
          "https://example.com/front.png",
          "shape:image-side",
        ],
      }).success
    ).toBe(false)
    expect(
      parseSafe3dPreviewSpec({
        version: 1,
        mode: "multiview-proxy",
        title: "Unsafe",
        referenceShapeIds: [
          "shape:image-front",
          "shape:image-side",
        ],
        code: "while (true) {}",
      }).success
    ).toBe(false)
  })
})
