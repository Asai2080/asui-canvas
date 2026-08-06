import { afterEach, describe, expect, it, vi } from "vitest"

import { detectWithOmniParser, formatOmniParserHints } from "./omniparser"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("OmniParser adapter", () => {
  it("maps ratio bboxes from the official parse response to image pixels", async () => {
    vi.stubEnv("OMNIPARSER_URL", "http://127.0.0.1:8000")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      parsed_content_list: [
        { type: "text", bbox: [0.1, 0.2, 0.4, 0.5], interactivity: false, content: "标题" },
        { type: "icon", bbox: [0.5, 0.25, 0.75, 0.75], interactivity: true, content: "" },
      ],
    }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await detectWithOmniParser({
      source: "data:image/png;base64,AAAA",
      width: 1000,
      height: 800,
    })

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/parse/", expect.objectContaining({ method: "POST" }))
    expect(result?.hints).toEqual([
      { type: "text", x: 100, y: 160, width: 300, height: 240, interactivity: false, content: "标题" },
      { type: "icon", x: 500, y: 200, width: 250, height: 400, interactivity: true, content: undefined },
    ])
    expect(formatOmniParserHints(result?.hints ?? [])).toContain("text (100,160,300,240)")
  })

  it("silently falls back when the local detector is unavailable", async () => {
    vi.stubEnv("OMNIPARSER_URL", "http://127.0.0.1:8000")
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))

    await expect(detectWithOmniParser({
      source: "data:image/png;base64,AAAA",
      width: 100,
      height: 100,
    })).resolves.toBeNull()
  })
})
