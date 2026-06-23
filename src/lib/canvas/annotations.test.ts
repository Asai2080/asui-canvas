import { describe, expect, it } from "vitest"

import { buildAnnotationFeedbackItems, validateSameAnnotationTarget } from "./annotations"

describe("canvas annotation generation helpers", () => {
  const source = { imageId: "shape:image", versionId: "version-1" }

  it("accepts annotations that target the same image version", () => {
    expect(
      validateSameAnnotationTarget([
        { annotationId: "shape:a", text: "改天空", ...source },
        { annotationId: "shape:b", text: "改衣服", ...source },
      ])
    ).toEqual(source)
  })

  it("rejects annotations that target different image versions", () => {
    expect(
      validateSameAnnotationTarget([
        { annotationId: "shape:a", text: "改天空", ...source },
        { annotationId: "shape:b", text: "改衣服", imageId: "shape:other", versionId: "version-2" },
      ])
    ).toBeNull()
  })

  it("builds labeled feedback items while preserving per-annotation text", () => {
    expect(
      buildAnnotationFeedbackItems([
        {
          annotationId: "shape:a",
          text: "把天空改成傍晚",
          imageId: "shape:image",
          versionId: "version-1",
          label: "右上区域",
        },
        {
          annotationId: "shape:b",
          text: "外套改成红色",
          imageId: "shape:image",
          versionId: "version-1",
        },
      ])
    ).toEqual([
      { label: "右上区域", text: "把天空改成傍晚" },
      { label: "标注 2", text: "外套改成红色" },
    ])
  })
})
