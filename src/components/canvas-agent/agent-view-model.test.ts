import { describe, expect, it } from "vitest"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import {
  getAgentTaskResultText,
  isAgentCapabilityIntroduction,
  isAgentTaskTerminal,
  selectForegroundTask,
  tasksToConversationHistory,
  tasksToThreadMessages,
} from "./agent-view-model"

function task(
  id: string,
  status: AgentTask["status"],
  createdAt: string
): AgentTask {
  return {
    id,
    revision: 0,
    source: "asui-canvas-agent",
    status,
    userInstruction: `目标 ${id}`,
    resultNodeIds: [],
    createdAt,
    updatedAt: createdAt,
    history: [
      {
        id: `event-${id}`,
        status,
        message: "内部状态记录不应原样展示",
        createdAt,
      },
    ],
  }
}

describe("agent view model", () => {
  it("selects the oldest unfinished task for foreground execution", () => {
    const newer = task("newer", "queued", "2026-07-26T08:01:00.000Z")
    const older = task("older", "planning", "2026-07-26T08:00:00.000Z")

    expect(selectForegroundTask([newer, older])?.id).toBe("older")
  })

  it("skips terminal tasks when selecting the foreground task", () => {
    const completed = task(
      "completed",
      "completed",
      "2026-07-26T08:00:00.000Z"
    )
    const queued = task("queued", "queued", "2026-07-26T08:01:00.000Z")

    expect(isAgentTaskTerminal(completed)).toBe(true)
    expect(selectForegroundTask([completed, queued])?.id).toBe("queued")
  })

  it("keeps active tasks in the thinking state without an assistant result", () => {
    const planned = {
      ...task("planned", "planning", "2026-07-26T08:00:00.000Z"),
      interpretation: {
        message: "我已理解这个海报任务。",
        summary: "两张茶饮海报",
        normalizedInstruction: "生成两张茶饮海报",
        intent: "image" as const,
        source: "text-model" as const,
      },
      compiledPrompt: {
        summary: "生成两张克制的茶饮海报",
        sharedConstraints: ["3:4", "保留品牌字样"],
        outputs: [
          {
            id: "output-one",
            mediaType: "image" as const,
            prompt: "青绿色茶饮海报，留白排版",
          },
        ],
      },
    } satisfies AgentTask

    const messages = tasksToThreadMessages([planned])

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ role: "user" })
  })

  it("adds only the final result after a task finishes", () => {
    const completed = {
      ...task("completed", "completed", "2026-07-26T08:00:00.000Z"),
      completedAt: "2026-07-26T08:02:00.000Z",
      resultNodeIds: ["node-one"],
      interpretation: {
        message: "我会先整理目标和步骤。",
        summary: "生成春日海报",
        normalizedInstruction: "生成春日海报",
        intent: "image" as const,
        source: "text-model" as const,
      },
    } satisfies AgentTask

    const messages = tasksToThreadMessages([completed])
    const serialized = JSON.stringify(messages)

    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "已完成“生成春日海报”，1 个结果已写入画布。" }],
      createdAt: new Date("2026-07-26T08:02:00.000Z"),
    })
    expect(getAgentTaskResultText(completed)).toBe(
      "已完成“生成春日海报”，1 个结果已写入画布。"
    )
    expect(serialized).not.toContain("我会先整理目标和步骤")
    expect(serialized).not.toContain("内部状态记录不应原样展示")
  })

  it("shows the text-model reply for conversation tasks", () => {
    const conversation = {
      ...task("conversation", "completed", "2026-07-26T08:00:00.000Z"),
      completedAt: "2026-07-26T08:00:10.000Z",
      userInstruction: "你是谁",
      interpretation: {
        message:
          "有什么我可以帮你的吗？比如：\n\n• 生成图片\n• 生成视频\n\n请告诉我你的需求！",
        summary: "普通对话",
        normalizedInstruction: "你是谁",
        intent: "conversation" as const,
        source: "text-model" as const,
      },
    } satisfies AgentTask

    expect(getAgentTaskResultText(conversation)).toBe(
      conversation.interpretation.message
    )
    expect(isAgentCapabilityIntroduction(conversation)).toBe(true)
    expect(tasksToThreadMessages([conversation])[1]).toMatchObject({
      content: [{ type: "text", text: conversation.interpretation.message }],
    })
  })

  it("builds bounded model conversation history without the active task", () => {
    const completed = {
      ...task("completed", "completed", "2026-07-26T08:00:00.000Z"),
      interpretation: {
        message: "你好，我可以帮助你进行图片和视频创作。",
        summary: "普通对话",
        normalizedInstruction: "你好",
        intent: "conversation" as const,
        source: "text-model" as const,
      },
    } satisfies AgentTask
    const active = task("active", "understanding", "2026-07-26T08:01:00.000Z")

    expect(tasksToConversationHistory([completed, active], active.id)).toEqual([
      { role: "user", content: "目标 completed" },
      {
        role: "assistant",
        content: "你好，我可以帮助你进行图片和视频创作。",
      },
    ])
  })
})
