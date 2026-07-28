import { describe, expect, it, vi } from "vitest"

import { createTextModelAdapter } from "./text-model"

describe("text model adapter", () => {
  it("parses a structured interpretation from an OpenAI-compatible response", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>
      }
      expect(requestBody.messages.slice(1, 3)).toEqual([
        { role: "user", content: "你能做什么" },
        {
          role: "assistant",
          content: "我可以帮助你进行图片和视频创作。",
        },
      ])
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "我会生成 4 张国风茶饮海报并写回画布。",
                summary: "4 张 3:4 国风茶饮海报",
                normalizedInstruction: "生成 4 张国风茶饮海报，比例 3:4。",
                intent: "image",
                target: { mediaType: "image", count: 4 },
              }),
            },
          },
        ],
      })
    })
    const adapter = createTextModelAdapter({ fetchImpl })

    const result = await adapter.interpret(
      {
        userInstruction: "生成4张国风茶饮海报，比例3:4",
        conversationHistory: [
          { role: "user", content: "你能做什么" },
          {
            role: "assistant",
            content: "我可以帮助你进行图片和视频创作。",
          },
        ],
      },
      {
        baseUrl: "https://text.example.com/v1",
        apiKey: "text-secret",
        model: "text-model",
      }
    )

    expect(result).toMatchObject({ intent: "image", target: { count: 4 } })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://text.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("accepts a natural conversation response", async () => {
    const adapter = createTextModelAdapter({
      fetchImpl: vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message:
                    "有什么我可以帮你的吗？比如：\n\n• 生成图片\n• 生成视频\n\n请告诉我你的需求！",
                  summary: "普通对话",
                  normalizedInstruction: "你是谁",
                  intent: "conversation",
                }),
              },
            },
          ],
        })
      ),
    })

    const result = await adapter.interpret(
      { userInstruction: "你是谁" },
      {
        baseUrl: "https://text.example.com/v1",
        apiKey: "text-secret",
        model: "text-model",
      }
    )

    expect(result).toMatchObject({
      intent: "conversation",
      summary: "普通对话",
    })
  })

  it("accepts fenced JSON and omits media URLs from text-model context", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = String(init?.body)
      expect(requestBody).not.toContain("data:image/png;base64")
      expect(requestBody).not.toContain("private-source.png")
      expect(requestBody).toContain("替换标题")
      return Response.json({
        choices: [
          {
            message: {
              content:
                '```json\n{"message":"我会按标注修改。","summary":"按标注修改图片","normalizedInstruction":"替换标题","intent":"image"}\n```',
            },
          },
        ],
      })
    })
    const adapter = createTextModelAdapter({ fetchImpl })

    const result = await adapter.interpret(
      {
        userInstruction: "按标注修改",
        context: {
          id: "context-1",
          createdAt: "2026-07-26T08:00:00.000Z",
          scope: "selection",
          selectedNodeId: "image-1",
          sourceNode: {
            id: "image-1",
            kind: "image",
            bounds: { x: 0, y: 0, w: 360, h: 480 },
            media: {
              referenceType: "url",
              mediaType: "image",
              src: "https://example.test/private-source.png",
            },
            referenceIds: [],
          },
          annotations: [
            {
              id: "annotation-1",
              sourceNodeId: "image-1",
              text: "替换标题",
              bounds: { x: 0, y: 0, w: 100, h: 40 },
            },
          ],
          connectedNodes: [],
          references: [],
        },
      },
      {
        baseUrl: "https://text.example.com/v1/chat/completions",
        apiKey: "text-secret",
        model: "text-model",
      }
    )

    expect(result.intent).toBe("image")
  })

  it("does not expose the API key when the provider fails", async () => {
    const adapter = createTextModelAdapter({
      fetchImpl: vi.fn(async () => new Response("text-secret", { status: 401 })),
    })

    await expect(
      adapter.interpret(
        { userInstruction: "生成海报" },
        {
          baseUrl: "https://text.example.com/v1",
          apiKey: "text-secret",
          model: "text-model",
        }
      )
    ).rejects.toThrow("文字模型请求失败（HTTP 401）")
  })
})
