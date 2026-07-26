import { describe, expect, it } from "vitest"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import {
  isAgentTaskTerminal,
  selectForegroundTask,
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

  it("maps tasks to auditable user and assistant messages", () => {
    const planned = {
      ...task("planned", "planning", "2026-07-26T08:00:00.000Z"),
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
    const serialized = JSON.stringify(messages)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: "user" })
    expect(messages[1]).toMatchObject({ role: "assistant" })
    expect(serialized).toContain("生成两张克制的茶饮海报")
    expect(serialized).toContain("青绿色茶饮海报，留白排版")
    expect(serialized).not.toContain("内部状态记录不应原样展示")
  })
})
