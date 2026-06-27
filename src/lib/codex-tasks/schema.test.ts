import { describe, expect, it } from "vitest"

import { codexTaskCreateSchema, createCodexTask } from "./schema"

describe("codex task schema", () => {
  it("creates a queued image-generation task with canvas context", () => {
    const task = createCodexTask({
      type: "image-generation",
      instruction: "根据标注生成一版修改结果",
      canvasContext: {
        selectedShapeIds: ["shape:1"],
        annotationIds: ["shape:annotation"],
        width: 1024,
        height: 768,
        sizePreset: "web",
      },
    })

    expect(task).toMatchObject({
      type: "image-generation",
      status: "queued",
      source: "asui-canvas",
      instruction: "根据标注生成一版修改结果",
    })
    expect(task.id).toMatch(/^task-/)
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("rejects code-change tasks", () => {
    expect(() =>
      codexTaskCreateSchema.parse({
        type: "code-change",
        instruction: "修改代码",
        canvasContext: {
          selectedShapeIds: [],
          annotationIds: [],
        },
      })
    ).toThrow()
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
