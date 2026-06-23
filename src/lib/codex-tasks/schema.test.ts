import { describe, expect, it } from "vitest"

import { codexTaskCreateSchema, createCodexTask } from "./schema"

describe("codex task schema", () => {
  it("creates a queued code-change task with canvas context", () => {
    const task = createCodexTask({
      type: "code-change",
      instruction: "把尺寸设置改成悬浮条",
      canvasContext: {
        selectedShapeIds: ["shape:1"],
        annotationIds: [],
        width: 1024,
        height: 768,
        sizePreset: "web",
      },
    })

    expect(task).toMatchObject({
      type: "code-change",
      status: "queued",
      source: "asui-canvas",
      instruction: "把尺寸设置改成悬浮条",
    })
    expect(task.id).toMatch(/^task-/)
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("rejects empty instructions", () => {
    expect(() =>
      codexTaskCreateSchema.parse({
        type: "image-generation",
        instruction: " ",
        canvasContext: {
          selectedShapeIds: [],
          annotationIds: [],
        },
      })
    ).toThrow()
  })
})
