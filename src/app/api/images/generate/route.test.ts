import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

const createRequest = (body: unknown) =>
  new Request("http://localhost/api/images/generate", {
    method: "POST",
    body: JSON.stringify(body),
  })

describe("image generation route", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("rejects missing API configuration", async () => {
    const response = await POST(createRequest({ prompt: "test" }))
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toContain("Base URL")
  })

  it("returns an image version from an OpenAI-compatible response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "abc123", revised_prompt: "revised" }],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://api.example.test/v1/",
        apiKey: "sk-test",
        model: "gpt-image-1",
        prompt: "ramen poster",
        width: 320,
        height: 240,
      })
    )
    const payload = (await response.json()) as { version: { src: string; width: number; height: number } }

    expect(response.status).toBe(200)
    expect(payload.version.src).toBe("data:image/png;base64,abc123")
    expect(payload.version.width).toBe(320)
    expect(payload.version.height).toBe(240)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.test/v1/images/generations",
      expect.objectContaining({
        method: "POST",
      })
    )
  })

  it("returns an image version from a Responses API image_generation_call response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "image_generation_call",
              result: "a".repeat(120),
            },
          ],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://api.example.test/v1",
        apiKey: "sk-test",
        model: "gpt-image-1",
        prompt: "ramen poster",
      })
    )
    const payload = (await response.json()) as { version: { src: string } }

    expect(response.status).toBe(200)
    expect(payload.version.src).toBe(`data:image/png;base64,${"a".repeat(120)}`)
  })

  it("uses OpenRouter chat completions image generation when the base URL is openrouter.ai", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "revised openrouter prompt",
                images: [
                  {
                    type: "image_url",
                    image_url: {
                      url: "https://example.test/generated.png",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://openrouter.ai",
        apiKey: "sk-test",
        model: "google/gemini-3-flash-image-preview",
        prompt: "ramen poster",
        width: 320,
        height: 480,
      })
    )
    const payload = (await response.json()) as { version: { src: string; prompt: string } }
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      modalities: string[]
      image_config: { aspect_ratio: string }
    }

    expect(response.status).toBe(200)
    expect(payload.version.src).toBe("https://example.test/generated.png")
    expect(payload.version.prompt).toBe("revised openrouter prompt")
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      })
    )
    expect(body.modalities).toEqual(["image", "text"])
    expect(body.image_config.aspect_ratio).toBe("2:3")
  })

  it("maps arbitrary canvas sizes to the nearest OpenRouter-supported aspect ratio", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ image_url: { url: "https://example.test/generated.png" } }],
              },
            },
          ],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-test",
        model: "openai/gpt-5.4-image-2-20260421",
        prompt: "ramen poster",
        width: 800,
        height: 600,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      image_config: { aspect_ratio: string }
    }

    expect(response.status).toBe(200)
    expect(body.image_config.aspect_ratio).toBe("4:3")
  })

  it("sends the source image and localized edit instructions for OpenRouter annotation edits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ image_url: { url: "https://example.test/edited.png" } }],
              },
            },
          ],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://openrouter.ai",
        apiKey: "sk-test",
        model: "openai/gpt-5.4-image-2-20260421",
        prompt: "ramen poster",
        feedback: "把标题改成阿水拉面",
        sourceImageSrc: "https://example.test/source.png",
        width: 900,
        height: 1600,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      messages: Array<{
        content: Array<{
          type: string
          text?: string
          image_url?: { url: string }
        }>
      }>
      image_config: { aspect_ratio: string }
    }

    expect(response.status).toBe(200)
    expect(body.image_config.aspect_ratio).toBe("9:16")
    expect(body.messages[0]?.content[0]?.type).toBe("text")
    expect(body.messages[0]?.content[0]?.text).toContain("Apply ONLY the requested annotation change")
    expect(body.messages[0]?.content[0]?.text).toContain("把标题改成阿水拉面")
    expect(body.messages[0]?.content[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.test/source.png" },
    })
  })

  it("summarizes unrecognized successful payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ status: "queued", id: "job-1" }],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://api.example.test/v1",
        apiKey: "sk-test",
        model: "gpt-image-1",
        prompt: "ramen poster",
      })
    )
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(payload.error).toContain("data[0] 字段：status, id")
  })

  it("reports upstream diagnostics when the model endpoint returns an empty body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }))

    const response = await POST(
      createRequest({
        baseUrl: "https://api.example.test/v1",
        apiKey: "sk-test",
        model: "gpt-image-1",
        prompt: "ramen poster",
      })
    )
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(payload.error).toContain("已请求模型接口 https://api.example.test/v1/images/generations")
    expect(payload.error).toContain("返回体为空")
  })
})
