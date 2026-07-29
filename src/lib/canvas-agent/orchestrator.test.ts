import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createStoredCanvasContextSnapshot } from "./context/store"
import { runAgentTaskTick } from "./orchestrator"
import { createAgentTask } from "./task-machine"
import { createStoredAgentTask, getStoredAgentTask } from "./task-store"

const roots: string[] = []
const now = "2026-07-26T08:00:00.000Z"

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-agent-orchestrator-"))
  roots.push(root)
  return root
}

function dependencies(root: string) {
  return {
    root,
    apiOrigin: "http://localhost:3030",
    now: () => now,
    createId: (prefix: string) => `${prefix}-fixed`,
    imageAdapter: {
      generate: vi.fn(async () => [
        {
          kind: "image" as const,
          versionId: "version-1",
          src: "https://example.test/result.png",
          prompt: "生成海报",
          width: 1024,
          height: 1024,
          createdAt: now,
        },
      ]),
    },
    videoAdapter: {
      create: vi.fn(),
      poll: vi.fn(),
    },
  }
}

describe("runAgentTaskTick", () => {
  it("uses the text model for auditable understanding before planning", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "生成4张国风茶饮海报，比例3:4" },
      { id: "task-understand", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const textAdapter = {
      interpret: vi.fn(async () => ({
        message: "我会生成 4 张国风茶饮海报。",
        summary: "4 张 3:4 国风茶饮海报",
        normalizedInstruction: "生成 4 张国风茶饮海报，比例 3:4。",
        intent: "image" as const,
        target: { mediaType: "image" as const, count: 4 },
      })),
    }
    const deps = {
      ...dependencies(root),
      textAdapter,
      textCredentials: {
        apiKey: "text-secret",
        baseUrl: "https://text.example.com/v1",
        model: "text-model",
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    const compiled = await runAgentTaskTick(task.id, deps)

    expect(understood.interpretation).toMatchObject({
      source: "text-model",
      target: { count: 4 },
    })
    expect(compiled.compiledPrompt?.outputs).toHaveLength(4)
    expect(JSON.stringify(compiled)).not.toContain("text-secret")
  })

  it("answers unsupported requests without creating canvas output", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "帮我修改代码" },
      { id: "task-unsupported", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "我目前只处理图片和视频创作任务。",
          summary: "非创作任务，未执行",
          normalizedInstruction: "帮我修改代码",
          intent: "unsupported" as const,
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const answered = await runAgentTaskTick(task.id, deps)

    expect(answered.status).toBe("completed")
    expect(answered.interpretation?.intent).toBe("unsupported")
    expect(answered.compiledPrompt).toBeUndefined()
  })

  it("answers ordinary conversation without creating canvas output", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "你是谁" },
      { id: "task-conversation", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message:
            "有什么我可以帮你的吗？比如：\n\n• 生成图片\n• 生成视频\n\n请告诉我你的需求！",
          summary: "普通对话",
          normalizedInstruction: "你是谁",
          intent: "conversation" as const,
        })),
      },
      conversationHistory: [
        { role: "user" as const, content: "你好" },
        { role: "assistant" as const, content: "你好，我是阿水画布 Agent。" },
      ],
    }

    await runAgentTaskTick(task.id, deps)
    const answered = await runAgentTaskTick(task.id, deps)

    expect(answered.status).toBe("completed")
    expect(answered.interpretation).toMatchObject({
      intent: "conversation",
      source: "text-model",
    })
    expect(answered.interpretation?.message).toContain("生成图片")
    expect(answered.compiledPrompt).toBeUndefined()
  })

  it("provides a natural local conversation fallback when no text model is configured", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "你是谁" },
      { id: "task-local-conversation", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)

    await runAgentTaskTick(task.id, deps)
    const answered = await runAgentTaskTick(task.id, deps)

    expect(answered.status).toBe("completed")
    expect(answered.interpretation).toMatchObject({
      intent: "conversation",
      source: "local-rules",
    })
    expect(answered.interpretation?.message).toContain("生成视频")
  })

  it("falls back to local planning when the text model is unavailable", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "生成一张海报" },
      { id: "task-text-fallback", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => {
          throw new Error("provider failed with text-secret")
        }),
      },
      textCredentials: {
        apiKey: "text-secret",
        baseUrl: "https://text.example.com/v1",
        model: "text-model",
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)

    expect(understood.status).toBe("compiling-prompt")
    expect(understood.interpretation).toMatchObject({
      source: "local-rules",
      intent: "image",
    })
    expect(understood.interpretation?.message).toContain("已切换到本地规则")
    expect(JSON.stringify(understood)).not.toContain("text-secret")
  })

  it("advances preparation one recoverable status at a time", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "生成一张绿色环保海报" },
      { id: "task-prepare", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)

    expect((await runAgentTaskTick(task.id, deps)).status).toBe("understanding")
    expect((await runAgentTaskTick(task.id, deps)).status).toBe(
      "compiling-prompt"
    )
    expect((await runAgentTaskTick(task.id, deps)).status).toBe("planning")
    const planned = await runAgentTaskTick(task.id, deps)

    expect(planned.status).toBe("executing")
    expect(planned.compiledPrompt?.outputs).toHaveLength(1)
    expect(planned.executionPlan?.steps.find(({ id }) => id === "compile-prompt"))
      .toMatchObject({ status: "completed", attempts: 1 })
  })

  it("waits after prompt compilation when confirmation mode is enabled", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "生成一张春天的图片",
        executionMode: "confirm",
      },
      { id: "task-confirm", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)
    const stillWaiting = await runAgentTaskTick(task.id, deps)

    expect(waiting).toMatchObject({
      status: "awaiting-confirmation",
      executionMode: "confirm",
    })
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("【创作目标】")
    expect(stillWaiting.revision).toBe(waiting.revision)
    expect(stillWaiting.status).toBe("awaiting-confirmation")
  })

  it("loads the canvas snapshot and preserves its source dimensions", async () => {
    const root = await createRoot()
    await createStoredCanvasContextSnapshot(
      {
        id: "context-1",
        createdAt: now,
        scope: "selection",
        selectedNodeId: "image-1",
        sourceNode: {
          id: "image-1",
          kind: "image",
          bounds: { x: 0, y: 0, w: 480, h: 270 },
          media: {
            referenceType: "url",
            mediaType: "image",
            src: "https://example.test/source.png",
            width: 480,
            height: 270,
          },
          referenceIds: [],
        },
        annotations: [
          {
            id: "annotation-1",
            sourceNodeId: "image-1",
            text: "把标题改成阿水画布",
            bounds: { x: 20, y: 20, w: 160, h: 40 },
          },
        ],
        connectedNodes: [],
        references: [],
      },
      root
    )
    const task = createAgentTask(
      {
        userInstruction: "按照画布标注修改",
        contextSnapshotId: "context-1",
      },
      { id: "task-context", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const compiled = await runAgentTaskTick(task.id, deps)

    expect(compiled.status).toBe("planning")
    expect(compiled.compiledPrompt?.outputs[0]).toMatchObject({
      operation: "edit",
      width: 480,
      height: 270,
    })
    expect(compiled.compiledPrompt?.outputs[0].prompt).toContain(
      "把标题改成阿水画布"
    )
  })

  it("delegates execution without persisting ephemeral credentials", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "生成一张海报" },
      { id: "task-execute", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      imageCredentials: {
        apiKey: "never-persist-this-key",
        model: "image-model",
      },
    }

    for (let index = 0; index < 5; index += 1) {
      await runAgentTaskTick(task.id, deps)
    }
    const stored = await getStoredAgentTask(task.id, root)

    expect(stored?.task.status).toBe("writing-canvas")
    expect(JSON.stringify(stored?.task)).not.toContain("never-persist-this-key")
  })

  it("moves provider failures to a safe failed state", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "生成一张海报" },
      { id: "task-failure", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)
    deps.imageAdapter.generate.mockRejectedValueOnce(
      new Error("provider rejected secret-value")
    )

    for (let index = 0; index < 5; index += 1) {
      await runAgentTaskTick(task.id, {
        ...deps,
        imageCredentials: { apiKey: "secret-value" },
      })
    }
    const stored = await getStoredAgentTask(task.id, root)

    expect(stored?.task.status).toBe("failed")
    expect(stored?.task.error).toMatchObject({
      code: "AGENT_EXECUTION_FAILED",
      retryable: true,
    })
    expect(JSON.stringify(stored?.task)).not.toContain("secret-value")
  })
})
