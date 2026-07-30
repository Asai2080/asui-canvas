import { describe, expect, it, vi } from "vitest"

import { createAgentTask } from "../task-machine"
import { agentTaskSchema } from "../task-schema"
import type { AgentCanvasCommandBatch } from "./schema"
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
    const publish = vi.fn(async (batch: AgentCanvasCommandBatch) => ({
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

  it("publishes one fully-sized prompt canvas for every storyboard frame", async () => {
    const publish = vi.fn(async (batch: AgentCanvasCommandBatch) => ({
      batchId: batch.id,
      taskId: batch.taskId,
      status: "applied" as const,
      resultNodeIds: batch.commands.map((_, index) => `shape-prompt-${index + 1}`),
      artifactNodeIds: {},
      errors: [],
    }))
    const base = promptTask()
    const storyboard = agentTaskSchema.parse({
      ...base,
      id: "task-storyboard-prompts",
      compiledPrompt: {
        ...base.compiledPrompt,
        summary: "4 张连续电影分镜",
        outputs: Array.from({ length: 4 }, (_, index) => ({
          ...base.compiledPrompt?.outputs[0],
          id: `task-storyboard-output-${index + 1}`,
          variantKey: `kf-0${index + 1}`,
          prompt: `【分镜 KF#0${index + 1}】\n${"完整镜头描述。".repeat(180)}`,
        })),
      },
    })

    await writeAgentPromptToCanvas(
      {
        task: storyboard,
        sourceBounds: { x: 10, y: 20, w: 360, h: 480 },
        viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
      },
      { publish, now: () => now }
    )

    const batch = publish.mock.calls[0]?.[0]
    const commands = batch?.commands.filter(
      (command): command is Extract<
        AgentCanvasCommandBatch["commands"][number],
        { type: "create-prompt-node" }
      > => command.type === "create-prompt-node"
    )
    expect(commands).toHaveLength(4)
    expect(commands?.map((command) => command.nodeRef)).toEqual([
      "professional-prompt-1",
      "professional-prompt-2",
      "professional-prompt-3",
      "professional-prompt-4",
    ])
    expect(commands?.map((command) => command.title)).toEqual([
      "分镜提示词 KF#01",
      "分镜提示词 KF#02",
      "分镜提示词 KF#03",
      "分镜提示词 KF#04",
    ])
    expect(commands?.every((command) => command.bounds.h > 920)).toBe(true)
    expect(commands?.[1]?.bounds.x).toBeGreaterThan(
      commands?.[0]?.bounds.x ?? 0
    )
    expect(commands?.[2]?.bounds.y).toBeGreaterThan(
      commands?.[0]?.bounds.y ?? 0
    )
  })
})
