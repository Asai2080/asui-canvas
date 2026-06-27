import { describe, expect, it } from "vitest"

import { buildCodexTaskMessage } from "./app-server"
import { createCodexTask } from "../codex-tasks/schema"

describe("Codex app-server bridge", () => {
  it("builds a structured ASUI canvas task message", () => {
    const task = createCodexTask({
      type: "image-generation",
      instruction: "根据圈选区域生成一版新图",
      canvasContext: {
        selectedShapeIds: ["shape:image"],
        annotationIds: ["shape:annotation"],
        prompt: "橙色玩偶",
        width: 1024,
        height: 768,
      },
    })

    const message = buildCodexTaskMessage(task)

    expect(message).toContain("ASUI 画布任务卡片")
    expect(message).toContain(`任务 ID：${task.id}`)
    expect(message).toContain("任务类型：生图/改图")
    expect(message).toContain("1 个选中节点，1 个标注")
    expect(message).toContain("提示词：橙色玩偶")
  })
})
