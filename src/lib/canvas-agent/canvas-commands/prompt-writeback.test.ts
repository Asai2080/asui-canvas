import { describe, expect, it, vi } from "vitest"

import { createAgentTask } from "../task-machine"
import { agentTaskSchema } from "../task-schema"
import { writeAgentPromptToCanvas } from "./prompt-writeback"

const now = "2026-07-29T02:00:00.000Z"

function promptTask() {
  const task = createAgentTask(
    {
      userInstruction: "帮我生成一个春天的画布",
      executionMode: "confirm",
    },
    { id: "task-spring", eventId: "event-created", now }
  )
  return agentTaskSchema.parse({
    ...task,
    status: "awaiting-confirmation",
    compiledPrompt: {
      originalGoal: task.userInstruction,
      summary: "生成春天图片",
      sharedConstraints: ["输出尺寸 1024 × 1024"],
      outputs: [
        {
          id: "task-spring-output-1",
          mediaType: "image",
          operation: "create",
          prompt: "【创作目标】\n春日花园，明亮自然光。",
          negativePrompt: "避免模糊和过度饱和。",
          width: 1024,
          height: 1024,
        },
      ],
    },
  })
}

describe("writeAgentPromptToCanvas", () => {
  it("publishes one typed prompt node beside the selected canvas", async () => {
    const publish = vi.fn(async (batch) => ({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "applied" as const,
      resultNodeIds: ["shape-prompt"],
      artifactNodeIds: {},
      errors: [],
    }))

    await writeAgentPromptToCanvas(
      {
        task: promptTask(),
        sourceBounds: { x: 10, y: 20, w: 360, h: 480 },
        viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
      },
      { publish, now: () => now }
    )

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "agent-prompt-task-spring",
        commands: [
          expect.objectContaining({
            type: "create-prompt-node",
            title: "专业提示词",
            content: expect.stringContaining("春日花园"),
            bounds: expect.objectContaining({ x: 466, y: 20, w: 440 }),
          }),
        ],
      })
    )
  })
})
