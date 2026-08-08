import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("POST /api/slices/candidates", () => {
  it("normalizes visual model candidates", async () => {
    vi.stubEnv("OMNIPARSER_URL", "")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        isUiDesign: true,
        confidence: 0.94,
        assets: [{ name: "logo", assetType: "logo", x: 12, y: 10, width: 80, height: 40, confidence: 0.9 }],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(new Request("http://localhost/api/slices/candidates", {
      method: "POST",
      body: JSON.stringify({
        sourceImageSrc: "data:image/png;base64,AA==",
        width: 360,
        height: 640,
        textBaseUrl: "https://example.com/v1",
        textApiKey: "secret",
        textModel: "vision-model",
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(payload.detector).toBe("vision-model")
    expect(payload.candidates[0]).toMatchObject({ name: "logo", assetType: "logo", width: 80 })
  })

  it("uses OpenRouter's chat endpoint and requests structured JSON", async () => {
    vi.stubEnv("OMNIPARSER_URL", "")
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions")
      const requestBody = JSON.parse(String(init?.body)) as {
        temperature?: number
        response_format?: { type?: string }
        reasoning?: { effort?: string; exclude?: boolean }
        messages?: Array<{ content?: Array<{ type?: string; image_url?: { detail?: string } }> }>
      }
      expect(requestBody.response_format).toEqual({ type: "json_object" })
      expect(requestBody.reasoning).toEqual({ effort: "low", exclude: true })
      expect(requestBody.temperature).toBeUndefined()
      expect(requestBody.messages?.[0]?.content?.[1]?.image_url?.detail).toBe("high")

      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: [{
              type: "output_text",
              text: "```json\n{\"isUiDesign\":true,\"confidence\":0.9,\"assets\":[{\"name\":\"hero\",\"assetType\":\"illustration\",\"x\":20,\"y\":30,\"width\":180,\"height\":120,\"confidence\":0.9}]}\n```",
            }],
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(new Request("http://localhost/api/slices/candidates", {
      method: "POST",
      body: JSON.stringify({
        sourceImageSrc: "data:image/png;base64,AA==",
        width: 360,
        height: 640,
        textBaseUrl: "https://openrouter.ai/",
        textApiKey: "secret",
        textModel: "gpt-5.5",
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.candidates[0]).toMatchObject({ name: "hero", width: 180 })
  })
})
