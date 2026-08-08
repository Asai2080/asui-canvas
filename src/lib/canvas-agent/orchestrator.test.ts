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
    await runAgentTaskTick(task.id, deps)
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

  it("corrects a model conversation misclassification for an app home screen request", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "帮我生成一个APP首页，首页内容是记录拉屎",
        executionMode: "confirm",
      },
      { id: "task-default-ui-image", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "有什么可以帮助你的？",
          summary: "普通对话",
          normalizedInstruction: "帮我生成一个APP首页，首页内容是记录拉屎",
          intent: "conversation" as const,
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)

    expect(understood.status).toBe("compiling-prompt")
    expect(understood.interpretation).toMatchObject({
      intent: "image",
      summary: "理解图片创作目标并等待提示词确认",
      target: { mediaType: "image" },
    })
    expect(understood.interpretation?.message).toContain("视觉设计任务")
    expect(understood.interpretation?.normalizedInstruction).toContain(
      "记录一次"
    )
    expect(understood.interpretation?.normalizedInstruction).toContain(
      "底部导航"
    )
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
        userInstruction: "6 / 4 / 1 / 4",
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
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 1 轮 / 3】请告诉我主题和主标题。",
        },
        {
          role: "user" as const,
          content:
            "主题是独立设计师的春季新品，10 正面对视风，主标题：春日新章",
        },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 2 轮 / 3】请确认参考素材。",
        },
        { role: "user" as const, content: "不使用人物，没有其他素材" },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 3 轮 / 3】请确认视觉细节。",
        },
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
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("正面对视")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("托腮思考")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("冷色调")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("超粗黑体")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("描边效果")
  })

  it("uses a concise cover request directly as the final main title", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "按推荐",
        executionMode: "confirm",
        skillId: "builtin-cover-design",
      },
      { id: "task-cover-concise-title", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      conversationHistory: [
        { role: "user" as const, content: "看向窗外" },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 1 轮 / 3】请选择风格与标题。",
        },
        { role: "user" as const, content: "5 极简留白风" },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 2 轮 / 3】请确认参考素材。",
        },
        { role: "user" as const, content: "无人物，没有其他素材" },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 3 轮 / 3】请确认视觉细节。",
        },
      ],
    }

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)

    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.compiledPrompt?.summary).toBe("封面设计：看向窗外")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain(
      "主标题原文：“看向窗外”"
    )
  })

  it("sends merged same-Skill answers to the text model", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "6 / 4 / 1 / 4",
        executionMode: "confirm",
        skillId: "builtin-cover-design",
      },
      { id: "task-cover-text-model-history", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const interpret = vi.fn(async (input: TextModelInterpretationInput) => ({
      message: "封面信息已齐全。",
      summary: "春季新品封面",
      normalizedInstruction: input.userInstruction,
      intent: "image" as const,
      target: { mediaType: "image" as const },
    }))
    const deps = {
      ...dependencies(root),
      textAdapter: { interpret },
      conversationHistory: [
        { role: "user" as const, content: "用封面 Skill 帮我生成" },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 1 轮 / 3】请告诉我主题和主标题。",
        },
        {
          role: "user" as const,
          content:
            "主题是独立设计师的春季新品，10 正面对视风，主标题：春日新章",
        },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 2 轮 / 3】请确认参考素材。",
        },
        { role: "user" as const, content: "无人物，没有其他素材" },
        {
          role: "assistant" as const,
          content: "【封面 Skill · 第 3 轮 / 3】请确认视觉细节。",
        },
      ],
    }

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)

    expect(interpret).toHaveBeenCalledWith(
      expect.objectContaining({
        userInstruction: expect.stringContaining("主标题：春日新章"),
      }),
      {}
    )
    expect(interpret.mock.calls[0]?.[0].userInstruction).toContain(
      "独立设计师的春季新品"
    )
  })

  it("turns portrait follow-up answers into a professional prompt instead of asking again", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "人物为成年女性",
        executionMode: "confirm",
        skillId: "builtin-portrait",
      },
      { id: "task-portrait-multiturn", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const interpret = vi.fn(async (input: TextModelInterpretationInput) => ({
      message: "写真要求已完整，我会整理为可直接生成的导演提示词。",
      summary: "成年女性证件照写真",
      normalizedInstruction: input.userInstruction,
      intent: "image" as const,
      target: { mediaType: "image" as const, count: 1 },
    }))
    const deps = {
      ...dependencies(root),
      textAdapter: { interpret },
      conversationHistory: [
        { role: "user" as const, content: "裙子、丸子头、证件照" },
        {
          role: "assistant" as const,
          content: "造型和用途已经记下，只差确认人物为成年人。",
        },
        {
          role: "user" as const,
          content: "裙子、丸子头、微笑、镜头远景证件照",
        },
        {
          role: "assistant" as const,
          content: "目前仍只差年龄确认，请确认人物为成年人。",
        },
      ],
    }

    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)

    expect(interpret).toHaveBeenCalledTimes(1)
    expect(interpret.mock.calls[0]?.[0].userInstruction).toContain(
      "裙子、丸子头、微笑、镜头远景证件照"
    )
    expect(interpret.mock.calls[0]?.[0].userInstruction).toContain("成年女性")
    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.interpretation?.intent).toBe("image")
    expect(waiting.compiledPrompt?.summary).toBe("人物写真：1 个导演版本")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("丸子头")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("微笑")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("镜头远景证件照")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("人物调度")
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain("灯光与色彩")
  })

  it("keeps the portrait Skill on image generation when camera wording is misclassified as video", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "帮我生成一个女生，女生穿着西装，镜头靠近一点特写",
        executionMode: "confirm",
        skillId: "builtin-portrait",
      },
      { id: "task-portrait-image-lock", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "我会整理视频镜头。",
          summary: "理解视频创作目标并等待提示词确认",
          normalizedInstruction: "西装女生近距离特写，镜头靠近人物。",
          intent: "video" as const,
          target: {
            mediaType: "video" as const,
            durationSeconds: 8,
          },
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)

    expect(understood.interpretation).toMatchObject({
      intent: "image",
      summary: "理解图片创作目标并等待提示词确认",
      target: { mediaType: "image" },
    })
    expect(understood.interpretation?.message).not.toContain("视频")
    expect(understood.interpretation?.normalizedInstruction).not.toContain(
      "0.0–"
    )
    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.compiledPrompt?.outputs).toHaveLength(1)
    expect(waiting.compiledPrompt?.outputs[0].mediaType).toBe("image")
  })

  it("starts Ian Xiaohei as an isolated image task even when old history and the model say video", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction:
          "为这段观点生成 2 张配图：团队不缺工具，真正缺的是清晰输入和短反馈回路。",
        executionMode: "confirm",
        requestedOutputCount: 2,
        skillId: "builtin-ian-xiaohei",
      },
      { id: "task-ian-isolated", eventId: "event-ian-isolated", now }
    )
    await createStoredAgentTask(task, root)
    const modelInputs: TextModelInterpretationInput[] = []
    const deps = {
      ...dependencies(root),
      conversationHistory: [
        { role: "user" as const, content: "继续之前的四格分镜视频" },
        { role: "assistant" as const, content: "我会继续生成分镜视频。" },
      ],
      textAdapter: {
        interpret: vi.fn(async (input: TextModelInterpretationInput) => {
          modelInputs.push(input)
          return {
            message: "继续生成分镜视频。",
            summary: "分镜视频",
            normalizedInstruction: "四格分镜，镜头推进。",
            intent: "video" as const,
            target: { mediaType: "video" as const, count: 2 },
          }
        }),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)

    expect(modelInputs[0].conversationHistory).toBeUndefined()
    expect(understood.interpretation).toMatchObject({
      intent: "image",
      target: { mediaType: "image", count: 2 },
    })
    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.compiledPrompt?.summary).toBe(
      "Ian 小蓝滴配图：2 张正文插图"
    )
    expect(
      waiting.compiledPrompt?.outputs.every(
        (output) => output.mediaType === "image"
      )
    ).toBe(true)
    expect(JSON.stringify(waiting.compiledPrompt)).not.toContain("四格分镜")
  })

  it("keeps a long Ian article intact while bounding the interpretation brief", async () => {
    const root = await createRoot()
    const article = [
      "今天想说的是：工具越多，不代表创作链路越清晰。",
      ...Array.from(
        { length: 180 },
        (_, index) =>
          `第 ${index + 1} 段：当输入、执行和结果反馈被拆得过长，用户就会在重复确认中失去对目标的控制。真正重要的是缩短反馈回路，让每一次选择都有可见结果。`
      ),
      "文章结尾认知锚点：先把输入说清楚，再让工具变得更多。",
    ].join("\n\n")
    expect(article.length).toBeGreaterThan(4_000)

    const task = createAgentTask(
      {
        userInstruction: article,
        executionMode: "confirm",
        requestedOutputCount: 2,
        skillId: "builtin-ian-xiaohei",
      },
      { id: "task-ian-long-article", eventId: "event-ian-long", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => {
          throw new Error(
            '[{"code":"too_big","maximum":4000,"path":["interpretation","normalizedInstruction"]}]'
          )
        }),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const waiting = await runAgentTaskTick(task.id, deps)

    expect(understood.status).toBe("reading-skill")
    expect(understood.userInstruction).toBe(article)
    expect(understood.interpretation?.source).toBe("local-rules")
    expect(understood.interpretation?.normalizedInstruction.length).toBeLessThanOrEqual(
      4_000
    )
    expect(understood.interpretation?.normalizedInstruction).not.toContain(article)
    expect(waiting.status).toBe("awaiting-confirmation")
    expect(waiting.compiledPrompt?.outputs).toHaveLength(2)
    expect(waiting.compiledPrompt?.outputs[0].prompt).toContain(
      "文章结尾认知锚点"
    )
  })

  it("keeps the local portrait fallback on image generation", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: "成年女性穿西装，镜头靠近一点特写",
        executionMode: "confirm",
        skillId: "builtin-portrait",
      },
      { id: "task-portrait-local-image-lock", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = dependencies(root)

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)

    expect(understood.interpretation).toMatchObject({
      intent: "image",
      summary: "理解图片创作目标并等待提示词确认",
      target: { mediaType: "image" },
    })
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
    expect(understood.interpretation?.message).toContain(
      "Agent 推理模型未成功返回"
    )
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

  it("replaces a long but generic model brief with concrete scene expansion", async () => {
    const root = await createRoot()
    const userInstruction =
      "帮我生成一个皮格斯风格的图片，场景是一个小男孩在草坪上踢足球，旁边有条小狗"
    const task = createAgentTask(
      { userInstruction, executionMode: "confirm" },
      { id: "task-concrete-scene-expansion", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "我会整理专业提示词。",
          summary: "男孩、足球与小狗的动画场景",
          normalizedInstruction: [
            "【专业创作目标】完整保留用户原始要求，并发展为高完成度视觉成片。",
            "【主体与动作】主体明确，明确面部朝向、视线落点、手部动作和身体重心，使用自然动作表达情绪。",
            "【构图与叙事】视觉层级清晰，画面焦点集中，构图完整并可直接交付。",
            "【质量要求】光影自然，色彩协调，材质真实，细节丰富。",
          ].join("\n"),
          intent: "image" as const,
          target: { mediaType: "image" as const },
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    const brief = understood.interpretation?.normalizedInstruction ?? ""

    expect(brief).toContain("【画面内容扩写】")
    expect(brief).toContain("脚内侧刚触球")
    expect(brief).toContain("小狗位于人物侧后方")
    expect(brief).toContain("眼睛追随球路")
    expect(brief).not.toContain("【专业创作目标】")
  })

  it("replaces a generic UI model brief with a concrete product specification", async () => {
    const root = await createRoot()
    const userInstruction = "生成一个移动端记账 App 首页，尺寸 750x1624"
    const task = createAgentTask(
      { userInstruction, executionMode: "confirm" },
      { id: "task-concrete-ui-expansion", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "UI 提示词已整理。",
          summary: "移动端记账首页",
          normalizedInstruction:
            "现代简洁，高质量，高级感，信息层级清晰，组件统一，用户体验良好。",
          intent: "image" as const,
          target: { mediaType: "image" as const, width: 750, height: 1624 },
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    const brief = understood.interpretation?.normalizedInstruction ?? ""

    expect(brief).toContain("【UI 产品定义】")
    expect(brief).toContain("本月已支出 ¥3,286.40")
    expect(brief).toContain("“记一笔”")
    expect(brief).toContain("安全区 x=48–702px，y=65–1527px")
    expect(brief).not.toContain("高级感")
  })

  it("professionally deepens every creative model result even when it is already long", async () => {
    const root = await createRoot()
    const userInstruction = "生成一张未来香水广告，玻璃瓶悬浮在水面上"
    const modelDirection = [
      "【模型美术方向】透明玻璃香水瓶悬浮在浅水面上方，瓶身标签朝向镜头，水面形成同心涟漪。",
      "使用克制的银灰与冷青色调，瓶盖金属边缘出现狭长高光，背景保持深色但保留空间层次。",
      "摄影机采用低机位中近景，主体占据画面中央偏上位置，水面反射完整可见。",
      "确保玻璃折射、液体体积和金属粗糙度可信，不生成文字错误、水印或额外产品。",
    ].join("\n")
    const task = createAgentTask(
      { userInstruction, executionMode: "confirm" },
      { id: "task-universal-professionalization", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      textAdapter: {
        interpret: vi.fn(async () => ({
          message: "香水广告提示词已整理。",
          summary: "未来香水广告",
          normalizedInstruction: modelDirection,
          intent: "image" as const,
          target: { mediaType: "image" as const },
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    const brief = understood.interpretation?.normalizedInstruction ?? ""

    expect(brief).toContain("【模型美术方向】")
    expect(brief).toContain("【画面内容扩写】")
    expect(brief).toContain(userInstruction)
    expect(brief).toContain("【构图与摄影】")
    expect(brief).toContain("【光线与色彩】")
    expect(brief).toContain("【材质与质量】")
  })

  it("preserves the official graphical Logo route in the metal sculpture brief", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction: [
          "品牌名称：拼多多",
          "背景色：浅灰",
          "金属颜色：红色",
          "Logo 依据：使用官方品牌图标",
        ].join("\n"),
        executionMode: "confirm",
        skillId: "builtin-metal-logo-sculpture",
      },
      { id: "task-metal-logo-official", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const interpret = vi.fn(async () => ({
      message: "已识别品牌主图形。",
      summary: "拼多多金属 Logo 雕塑",
      normalizedInstruction: [
        "官方应用图标的外轮廓为圆角心形。",
        "内部使用红白分区，中央保留‘拼’字和对称负空间。",
      ].join("\n"),
      intent: "image" as const,
      target: { mediaType: "image" as const },
    }))
    const deps = { ...dependencies(root), textAdapter: { interpret } }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    const brief = understood.interpretation?.normalizedInstruction ?? ""

    expect(interpret).toHaveBeenCalledWith(
      expect.objectContaining({
        userInstruction: expect.stringContaining(
          "Logo 依据：使用官方品牌图标"
        ),
      }),
      expect.anything()
    )
    expect(brief).toContain("圆角心形")
    expect(brief).toContain("红白分区")
    expect(brief).toContain("对称负空间")
    expect(brief).toContain("官方主图形识别模式")
    expect(brief).not.toContain("没有参考图时只使用用户确认的纯文字字标")
  })

  it("carries the original request through a Skill choice continuation", async () => {
    const root = await createRoot()
    const task = createAgentTask(
      {
        userInstruction:
          "Logo 依据：使用官方品牌图标，根据品牌名称识别公开且稳定的官方主图形",
        executionMode: "confirm",
        skillId: "builtin-brand-sticker-photo",
      },
      { id: "task-brand-choice-continuation", eventId: "event-created", now }
    )
    await createStoredAgentTask(task, root)
    const deps = {
      ...dependencies(root),
      conversationHistory: [
        {
          role: "user" as const,
          content: "品牌名称：美团，背景色：白色",
        },
        {
          role: "assistant" as const,
          content: "请选择 Logo 依据。",
        },
      ],
      textAdapter: {
        interpret: vi.fn(async (input: TextModelInterpretationInput) => ({
          message: "已锁定美团官方品牌图形。",
          summary: "美团品牌贴纸写真",
          normalizedInstruction: input.userInstruction,
          intent: "image" as const,
          target: { mediaType: "image" as const },
        })),
      },
    }

    await runAgentTaskTick(task.id, deps)
    const understood = await runAgentTaskTick(task.id, deps)
    await runAgentTaskTick(task.id, deps)
    const compiled = await runAgentTaskTick(task.id, deps)

    expect(understood.interpretation?.resolvedInstruction).toContain("品牌名称：美团")
    expect(compiled.compiledPrompt?.originalGoal).toContain("品牌名称：美团")
    expect(compiled.compiledPrompt?.outputs[0].prompt).toContain("官方主图形识别模式")
    expect(compiled.compiledPrompt?.outputs[0].prompt).not.toContain("用户已确认使用纯文字字标")
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
