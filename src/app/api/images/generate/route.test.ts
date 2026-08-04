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

  it("sends arbitrary canvas dimensions for gpt-image-2 compatible models", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "abc123" }],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://api.example.test/v1",
        apiKey: "sk-test",
        model: "gpt-image-2",
        prompt: "ramen poster",
        width: 1024,
        height: 1820,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      size: string
    }

    expect(response.status).toBe(200)
    expect(body.size).toBe("1024x1824")
  })

  it("maps gpt-image-1 canvas dimensions to the nearest supported standard size", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "abc123" }],
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
        width: 900,
        height: 1600,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      size: string
    }

    expect(response.status).toBe(200)
    expect(body.size).toBe("1024x1536")
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
      prompt: string
      aspect_ratio: string
      output_format: string
    }

    expect(response.status).toBe(200)
    expect(payload.version.src).toBe("https://example.test/generated.png")
    expect(payload.version.prompt).toBe("revised openrouter prompt")
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/images",
      expect.objectContaining({
        method: "POST",
      })
    )
    expect(body.prompt).toBe("ramen poster")
    expect(body.aspect_ratio).toBe("2:3")
    expect(body.output_format).toBe("png")
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
      aspect_ratio: string
    }

    expect(response.status).toBe(200)
    expect(body.aspect_ratio).toBe("4:3")
  })

  it("repairs a concatenated GPT image model before calling OpenRouter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ url: "https://example.test/generated.png" }],
        }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-test",
        model: "gpt-imagegpt-5.4-image-2-1",
        prompt: "spring poster",
      })
    )
    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    ) as { model: string }

    expect(response.status).toBe(200)
    expect(body.model).toBe("openai/gpt-5.4-image-2")
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
      prompt: string
      input_references: Array<{
        type: string
        image_url: { url: string }
      }>
      aspect_ratio: string
    }

    expect(response.status).toBe(200)
    expect(body.aspect_ratio).toBe("9:16")
    expect(body.prompt).toContain("Apply ONLY the requested annotation change")
    expect(body.prompt).toContain("把标题改成阿水拉面")
    expect(body.input_references[0]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.test/source.png" },
    })
  })

  it("sends uploaded reference images as OpenRouter input references", async () => {
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
        baseUrl: "https://openrouter.ai",
        apiKey: "sk-test",
        model: "openai/gpt-5.4-image-2-20260421",
        prompt: "make a poster using references",
        referenceImageSrcs: ["https://example.test/ref-1.png", "https://example.test/ref-2.png"],
        width: 1024,
        height: 1024,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      prompt: string
      input_references: Array<{
        type: string
        image_url: { url: string }
      }>
    }

    expect(response.status).toBe(200)
    expect(body.prompt).toContain("uploaded reference images")
    expect(body.prompt).toContain("Text prompt: make a poster using references")
    expect(body.input_references).toEqual([
      {
        type: "image_url",
        image_url: { url: "https://example.test/ref-1.png" },
      },
      {
        type: "image_url",
        image_url: { url: "https://example.test/ref-2.png" },
      },
    ])
  })

  it("loads bundled Skill references as model-ready image data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [
                  { image_url: { url: "https://example.test/sticker.png" } },
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
        model: "openai/gpt-5.4-image-2-20260421",
        prompt: "convert the source into a transparent sticker",
        sourceImageSrc: "https://example.test/source.png",
        referenceImageSrcs: [
          "/builtin-skill-assets/canvas-3d-sticker-characters-chibi.png",
        ],
      })
    )
    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    ) as {
      input_references: Array<{ image_url: { url: string } }>
    }

    expect(response.status).toBe(200)
    expect(body.input_references).toHaveLength(2)
    expect(body.input_references[0].image_url.url).toBe(
      "https://example.test/source.png"
    )
    expect(body.input_references[1].image_url.url).toMatch(
      /^data:image\/png;base64,/
    )
  })

  it("requests a transparent PNG when the prompt requires a true alpha channel", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }),
        { status: 200 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://api.example.test/v1",
        apiKey: "sk-test",
        model: "gpt-image-2",
        prompt: "必须具有真实 RGBA 透明通道",
      })
    )
    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    ) as { background?: string; output_format?: string }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      background: "transparent",
      output_format: "png",
    })
  })

  it("classifies mixed reference assets and only sends images to the image model", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined)
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
        baseUrl: "https://openrouter.ai",
        apiKey: "sk-test",
        model: "openai/gpt-5.4-image-2-20260421",
        prompt: "turn this still into a cinematic video frame",
        referenceAssets: [
          {
            src: "data:image/png;base64,abc123",
            name: "upstream.png",
          },
          {
            src: "data:video/mp4;base64,def456",
            name: "motion.mp4",
          },
        ],
        width: 1024,
        height: 1024,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      input_references: Array<{
        type: string
        image_url: { url: string }
      }>
    }

    expect(response.status).toBe(200)
    expect(body.input_references).toEqual([
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc123" },
      },
    ])
    expect(console.info).toHaveBeenCalledWith("[asui-image-generate] reference assets", {
      imageCount: 1,
      videoCount: 1,
    })
  })

  it("composes multiple annotation feedback items into one localized edit request", async () => {
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
        feedbackItems: [
          { label: "右上区域", text: "把天空改成傍晚", bounds: { x: 0.6, y: 0.1, w: 0.2, h: 0.2 } },
          {
            label: "中间主体",
            text: "外套改成红色",
            taskType: "color edit",
            targetHint: "目标区域来自用户画出的圈",
            bounds: { x: 0.3, y: 0.4, w: 0.3, h: 0.3 },
          },
        ],
        sourceImageSrc: "https://example.test/source.png",
        width: 900,
        height: 1600,
      })
    )
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as {
      prompt: string
    }

    expect(response.status).toBe(200)
    expect(body.prompt).toContain("Apply the following canvas annotations")
    expect(body.prompt).toContain("There are 2 required annotation tasks")
    expect(body.prompt).toContain("EVERY checklist item is completed")
    expect(body.prompt).toContain("Different task types must not override each other")
    expect(body.prompt).toContain("Handwritten annotation words, circles, arrows, and marks")
    expect(body.prompt).toContain("For color edits, recolor the object inside the annotated region")
    expect(body.prompt).toContain("For object replacement edits, replace the visual object inside the annotated region")
    expect(body.prompt).toContain("replace the visible text in that annotated region with the exact requested text")
    expect(body.prompt).toContain("If there are multiple numbered annotations, complete all of them")
    expect(body.prompt).toContain(
      '1. task_type=localized edit; target=右上区域, normalized region x=60%, y=10%, w=20%, h=20%; instruction="把天空改成傍晚"'
    )
    expect(body.prompt).toContain(
      '2. task_type=color edit; target=中间主体, normalized region x=30%, y=40%, w=30%, h=30%; instruction="外套改成红色"'
    )
    expect(body.prompt).toContain('target_hint="目标区域来自用户画出的圈"')
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

  it("returns a friendly message for upstream safety rejections", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message:
              "Your request was rejected by the safety system. Include the request ID req_test123. safety_violations=[sexual].",
          },
        }),
        { status: 400 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-test",
        model: "openai/gpt-image-1",
        prompt: "poster",
      })
    )
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toContain("模型安全系统拒绝了这次生成")
    expect(payload.error).toContain("原因：sexual")
    expect(payload.error).toContain("请求 ID：req_test123")
    expect(payload.error).not.toContain("Your request was rejected")
  })

  it("returns a friendly message for generic upstream safety rejections", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message:
              "Your request was rejected by the safety system. If you believe this is an error, include the request ID db3fee52-e767-4778-8da5-6e4c3bd3605f.",
          },
        }),
        { status: 400 }
      )
    )

    const response = await POST(
      createRequest({
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-test",
        model: "openai/gpt-image-1",
        prompt: "poster",
      })
    )
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toContain("模型安全系统拒绝了这次生成")
    expect(payload.error).toContain("不是字体、画布尺寸或前端按钮导致")
    expect(payload.error).toContain("请求 ID：db3fee52-e767-4778-8da5-6e4c3bd3605f")
    expect(payload.error).not.toContain("Your request was rejected")
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
