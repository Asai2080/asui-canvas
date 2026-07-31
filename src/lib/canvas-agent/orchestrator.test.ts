import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { TextModelInterpretationInput } from "./adapters/text-model"
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

  it("treats a selected image as independent input for a new operation", async () => {
    const root = await createRoot()
    await createStoredCanvasContextSnapshot(
      {
        id: "context-independent-skill",
        createdAt: now,
        scope: "selection",
        selectedNodeId: "image-current",
        sourceNode: {
          id: "image-current",
          kind: "image",
          bounds: { x: 100, y: 100, w: 640, h: 480 },
          media: {
            referenceType: "url",
            mediaType: "image",
            src: "https://example.test/current-image.png",
            width: 640,
            height: 480,
          },
          parentNodeId: "current-image-holder",
          referenceIds: ["explicit-reference"],
        },
        annotations: [],
        connectedNodes: [
          {
            id: "old-storyboard-prompt",
            kind: "other",
            bounds: { x: 780, y: 100, w: 360, h: 640 },
            text: "继续之前的四格分镜流程",
            sourceNodeId: "image-current",
            referenceIds: [],
          },
          {
            id: "current-image-holder",
            kind: "holder",
            bounds: { x: 94, y: 94, w: 652, h: 492 },
            referenceIds: [],
          },
        ],
        references: [
          {
            id: "explicit-reference",
            kind: "image",
            bounds: { x: 0, y: 0, w: 320, h: 240 },
            media: {
              referenceType: "url",
              mediaType: "image",
              src: "https://example.test/reference.png",
              width: 320,
              height: 240,
            },
            referenceIds: [],
          },
        ],
      },
      root
    )
    const task = createAgentTask(
      {
        userInstruction: "调用这个 Skill，帮我生成图片",
        executionMode: "confirm",
        contextSnapshotId: "context-independent-skill",
        skillId: "builtin-image-to-3d",
      },
      { id: "task-independent-skill", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const modelInputs: TextModelInterpretationInput[] = []
    const textAdapter = {
      interpret: vi.fn(async (input: TextModelInterpretationInput) => {
        modelInputs.push(input)
        return {
          message: "我会把当前图片扩展为四视角建模参考。",
          summary: "图片转 3D 四视角参考",
          normalizedInstruction: "基于当前选中图片生成一致的四视角建模参考。",
          intent: "image" as const,
          target: { mediaType: "image" as const },
        }
      }),
    }
    const deps = { ...dependencies(root), textAdapter }

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)

    const modelInput = modelInputs[0]
    expect(modelInput?.context?.sourceNode?.id).toBe("image-current")
    expect(modelInput?.context?.references.map(({ id }) => id)).toEqual([
      "explicit-reference",
    ])
    expect(modelInput?.context?.connectedNodes.map(({ id }) => id)).toEqual([
      "current-image-holder",
    ])
  })

  it("preserves the exact user style when the text model generalizes it", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "生成一张液态铬合金主义风格的未来剧院海报，比例 3:4",
        executionMode: "confirm",
      },
      { id: "task-style-fidelity", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "我会先整理未来剧院海报的专业提示词。",
          summary: "未来剧院主题海报",
          normalizedInstruction:
            "制作一张未来剧院主题商业海报，金属材质，戏剧性灯光，3:4。",
          intent: "image" as const,
          target: { mediaType: "image" as const },
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)
    const prompt = waiting.compiledPrompt?.outputs[0].prompt ?? ""

    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.compiledPrompt?.originalGoal).toBe(task.userInstruction)
    expect(prompt).toContain("液态铬合金主义风格")
    expect(prompt).toContain("制作一张未来剧院主题商业海报")
  })

  it("sends the compiled director brief to the video adapter", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction:
          "生成一个 8 秒未来运动鞋广告视频，16:9，镜头环绕产品，1080p",
        executionMode: "auto",
      },
      { id: "task-video-director", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)
    deps.videoAdapter.create.mockResolvedValueOnce({
      taskId: "provider-video-director",
      status: "queued",
    })

    for (let index = 0; index < 5; index += 1) {
      await runAgentTaskTick(task.id, deps)
    }

    expect(deps.videoAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 8,
        resolution: "1080p",
        prompt: expect.stringContaining("【导演创作简报】"),
      }),
      {}
    )
    const input = deps.videoAdapter.create.mock.calls[0]?.[0]
    expect(input?.prompt).toContain("沿稳定圆弧轨道环绕主体")
    expect(input?.prompt).toContain("画幅比例 16:9")
    expect(input?.prompt).toContain("保持 180 度轴线")
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

  it("asks for the missing topic and title before running the cover Skill", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "用这个 Skill，帮我生成封面",
        executionMode: "confirm",
        skillId: "builtin-cover-design",
      },
      { id: "task-cover-clarification", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const answered = await runAgentTaskTick(task.id, deps)

    expect(answered.status).toBe("completed")
    expect(answered.interpretation).toMatchObject({
      intent: "conversation",
      summary: "封面信息待补充",
      source: "local-rules",
    })
    expect(answered.interpretation?.message).toContain("主题或核心内容")
    expect(answered.interpretation?.message).toContain("主标题")
    expect(answered.compiledPrompt).toBeUndefined()
    expect(deps.textAdapter.interpret).not.toHaveBeenCalled()
  })

  it("carries same-Skill answers into the final cover prompt", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "主题是独立设计师的春季新品",
        executionMode: "confirm",
        skillId: "builtin-cover-design",
      },
      { id: "task-cover-multiturn", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      conversationHistory: [
        { role: "user" as const, content: "用这个 Skill 帮我生成封面" },
        { role: "assistant" as const, content: "请告诉我主题和主标题。" },
        { role: "user" as const, content: "主标题：春日新章" },
      ],
    }

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)

    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.compiledPrompt?.summary).toBe("封面设计：春日新章")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain(
      "独立设计师的春季新品"
    )
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain(
      "主标题原文：“春日新章”"
    )
  })

  it("asks for an image before starting the built-in four-view Skill", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "使用这个 Skill 生成四视角",
        executionMode: "confirm",
        skillId: "builtin-image-to-3d",
      },
      { id: "task-four-view-no-image", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: { interpret: vi.fn() },
    }

    await runAgentTaskTick(task.id, deps)
    const answered = await runAgentTaskTick(task.id, deps)

    expect(answered.status).toBe("completed")
    expect(answered.interpretation).toMatchObject({
      intent: "conversation",
      summary: "四视角输入待选择",
    })
    expect(answered.compiledPrompt).toBeUndefined()
    expect(deps.textAdapter.interpret).not.toHaveBeenCalled()
  })

  it("asks for the world theme and camera mode before creating scene media", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "用世界 Skill 帮我生成",
        executionMode: "confirm",
        skillId: "builtin-world",
      },
      { id: "task-world-clarification", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: { interpret: vi.fn() },
    }

    await runAgentTaskTick(task.id, deps)
    const answered = await runAgentTaskTick(task.id, deps)

    expect(answered.status).toBe("completed")
    expect(answered.interpretation).toMatchObject({
      intent: "conversation",
      summary: "世界规划信息待补充",
    })
    expect(answered.compiledPrompt).toBeUndefined()
    expect(deps.textAdapter.interpret).not.toHaveBeenCalled()
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

  it("professionally expands a short creative sentence in the local fallback", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      { userInstruction: "人物在厨房做饭", executionMode: "confirm" },
      { id: "task-local-professional-brief", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)

    expect(understood.interpretation?.normalizedInstruction.length).toBeGreaterThan(180)
    expect(understood.interpretation?.normalizedInstruction).toContain("厨房操作台")
    expect(understood.interpretation?.normalizedInstruction).toContain("电影主光")
    expect(understood.interpretation?.normalizedInstruction).not.toBe(
      task.userInstruction
    )
  })

  it("advances preparation one recoverable status at a time", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "生成一张绿色环保海报",
        executionMode: "auto",
      },
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

  it("keeps the latest task when concurrent ticks race on one revision", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "使用图片转 3D Skill 处理当前图片",
        executionMode: "confirm",
      },
      { id: "task-concurrent-tick", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)
    await runAgentTaskTick(task.id, deps)

    const interpretation = {
      message: "我会根据当前图片建立四视角参考。",
      summary: "图片转 3D 四视角参考",
      normalizedInstruction: "根据当前图片建立一致的四视角建模参考。",
      intent: "image" as const,
      target: { mediaType: "image" as const },
    }
    let releaseFirst: (() => void) | undefined
    let calls = 0
    const textAdapter = {
      interpret: vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve
          })
        }
        return interpretation
      }),
    }
    const racingDeps = { ...deps, textAdapter }

    const firstTick = runAgentTaskTick(task.id, racingDeps)
    await vi.waitFor(() => expect(calls).toBe(1))
    const secondResult = await runAgentTaskTick(task.id, racingDeps)
    releaseFirst?.()
    const firstResult = await firstTick
    const stored = await getStoredAgentTask(task.id, root)

    expect(firstResult.status).toBe("compiling-prompt")
    expect(secondResult.status).toBe("compiling-prompt")
    expect(stored?.task.status).toBe("compiling-prompt")
    expect(stored?.task.error).toBeUndefined()
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
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("【创作简报】")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("【构图与镜头】")
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
        executionMode: "auto",
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
      { userInstruction: "生成一张海报", executionMode: "auto" },
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
      { userInstruction: "生成一张海报", executionMode: "auto" },
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
