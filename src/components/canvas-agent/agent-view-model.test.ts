import { describe, expect, it } from "vitest"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import {
  getAgentPromptReviewState,
  getAgentTaskResultText,
  isAgentCapabilityIntroduction,
  isAgentTaskTerminal,
  selectForegroundTask,
  selectPromptWritebackTask,
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
  it("keeps prompt confirmation inside the existing task and exposes execution state", () => {
    const waiting = task(
      "prompt-confirmation",
      "awaiting-confirmation",
      "2026-07-26T08:00:00.000Z"
    )
    const planning = { ...waiting, status: "planning" as const }
    const completed = { ...waiting, status: "completed" as const }

    expect(getAgentPromptReviewState(waiting, null, false)).toEqual({
      isExecuting: false,
      label: "等待确认",
    })
    expect(
      getAgentPromptReviewState(waiting, "confirming", false)
    ).toEqual({
      isExecuting: true,
      label: "执行中",
    })
    expect(getAgentPromptReviewState(planning, null, true)).toEqual({
      isExecuting: true,
      label: "执行中",
    })
    expect(getAgentPromptReviewState(completed, "confirming", true)).toEqual({
      isExecuting: false,
      label: "已完成",
    })
  })

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

  it("never writes historical prompt tasks into the current canvas session", () => {
    const historicalStoryboard = {
      ...task(
        "historical-storyboard",
        "awaiting-confirmation",
        "2026-07-26T08:00:00.000Z"
      ),
      compiledPrompt: {
        summary: "十二张历史分镜",
        sharedConstraints: [],
        outputs: Array.from({ length: 12 }, (_, index) => ({
          id: `historical-output-${index + 1}`,
          mediaType: "image" as const,
          prompt: `历史分镜 ${index + 1}`,
        })),
      },
    } satisfies AgentTask
    const currentPortrait = {
      ...task(
        "current-portrait",
        "awaiting-confirmation",
        "2026-07-26T08:01:00.000Z"
      ),
      compiledPrompt: {
        summary: "当前写真任务",
        sharedConstraints: [],
        outputs: [
          {
            id: "current-output",
            mediaType: "image" as const,
            prompt: "成年女性西装近景写真",
          },
        ],
      },
    } satisfies AgentTask

    expect(
      selectPromptWritebackTask(
        [historicalStoryboard, currentPortrait],
        new Set([currentPortrait.id])
      )?.id
    ).toBe(currentPortrait.id)
    expect(
      selectPromptWritebackTask(
        [historicalStoryboard, currentPortrait],
        new Set()
      )
    ).toBeUndefined()
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

  it("shows a review message without auto-running a task that awaits confirmation", () => {
    const waiting = {
      ...task(
        "waiting",
        "awaiting-confirmation",
        "2026-07-26T08:00:00.000Z"
      ),
      executionMode: "confirm" as const,
      compiledPrompt: {
        summary: "生成春天图片",
        sharedConstraints: [],
        outputs: [
          {
            id: "output-spring",
            mediaType: "image" as const,
            prompt: "春日花园，明亮自然光。",
          },
        ],
      },
    } satisfies AgentTask

    expect(selectForegroundTask([waiting])).toBeUndefined()
    expect(tasksToThreadMessages([waiting])).toHaveLength(2)
    expect(tasksToThreadMessages([waiting])[1]).toMatchObject({
      role: "assistant",
      metadata: {
        custom: {
          taskId: "waiting",
          taskStatus: "awaiting-confirmation",
        },
      },
    })
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

  it("retains the confirmed prompt review before the final result", () => {
    const completed = {
      ...task("confirmed", "completed", "2026-07-26T08:00:00.000Z"),
      completedAt: "2026-07-26T08:03:00.000Z",
      promptConfirmedAt: "2026-07-26T08:01:00.000Z",
      resultNodeIds: ["node-one"],
      compiledPrompt: {
        summary: "生成皮克斯风格图片",
        sharedConstraints: ["输出尺寸 1024 × 1024"],
        outputs: [
          {
            id: "output-confirmed",
            mediaType: "image" as const,
            operation: "create" as const,
            prompt: "【创作简报】\n皮克斯风格的春日角色场景。",
            width: 1024,
            height: 1024,
          },
        ],
      },
      history: [
        ...task("confirmed-history", "queued", "2026-07-26T08:00:00.000Z").history,
        {
          id: "event-awaiting-confirmation",
          status: "awaiting-confirmation" as const,
          message: "提示词已准备好，等待确认",
          createdAt: "2026-07-26T08:00:30.000Z",
        },
      ],
    } satisfies AgentTask

    const messages = tasksToThreadMessages([completed])

    expect(messages).toHaveLength(3)
    expect(messages[1]).toMatchObject({
      id: "confirmed-assistant-review",
      role: "assistant",
      createdAt: new Date("2026-07-26T08:01:00.000Z"),
      metadata: {
        custom: {
          taskId: "confirmed",
          taskStatus: "completed",
          messageKind: "prompt-review",
        },
      },
    })
    expect(messages[2]).toMatchObject({
      id: "confirmed-assistant",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "已完成当前任务，1 个结果已写入画布。",
        },
      ],
    })
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

  it("does not carry conversation history across different Skills", () => {
    const storyboard = {
      ...task("storyboard", "completed", "2026-07-26T08:00:00.000Z"),
      skillId: "skill-storyboard",
      userInstruction: "生成四张分镜",
    } satisfies AgentTask
    const imageTo3d = {
      ...task("image-to-3d", "understanding", "2026-07-26T08:01:00.000Z"),
      skillId: "builtin-image-to-3d",
      userInstruction: "使用这个 Skill",
    } satisfies AgentTask

    expect(
      tasksToConversationHistory(
        [storyboard, imageTo3d],
        imageTo3d.id
      )
    ).toEqual([])
  })

  it("does not revive an older run of the same Skill after another workflow", () => {
    const oldCover = {
      ...task("old-cover", "completed", "2026-07-26T08:00:00.000Z"),
      skillId: "builtin-cover-design",
      userInstruction: "主标题：旧封面",
    } satisfies AgentTask
    const ordinary = {
      ...task("ordinary", "completed", "2026-07-26T08:01:00.000Z"),
      userInstruction: "你好",
    } satisfies AgentTask
    const activeCover = {
      ...task("active-cover", "understanding", "2026-07-26T08:02:00.000Z"),
      skillId: "builtin-cover-design",
      userInstruction: "用封面 Skill 做一个新的封面",
    } satisfies AgentTask

    expect(
      tasksToConversationHistory(
        [oldCover, ordinary, activeCover],
        activeCover.id
      )
    ).toEqual([])
  })

  it("hides legacy revision conflict details behind a retry message", () => {
    const failed = {
      ...task("revision-conflict", "failed", "2026-07-26T08:00:00.000Z"),
      error: {
        code: "AGENT_EXECUTION_FAILED",
        message:
          "Canvas Agent task revision conflict for task-one: expected 7, actual 8",
        retryable: true,
      },
    } satisfies AgentTask

    expect(getAgentTaskResultText(failed)).toContain(
      "任务状态已同步，请点击重试继续。"
    )
    expect(getAgentTaskResultText(failed)).not.toContain("expected 7")
  })
})
