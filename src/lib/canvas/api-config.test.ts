import { describe, expect, it } from "vitest"

import { DEFAULT_API_CONFIG, maskApiKey, parseApiConfig } from "./api-config"

describe("api config", () => {
  it("falls back to defaults for empty or invalid config", () => {
    expect(parseApiConfig(null)).toEqual(DEFAULT_API_CONFIG)
    expect(parseApiConfig("{broken")).toEqual(DEFAULT_API_CONFIG)
  })

  it("parses partial saved config safely", () => {
    expect(parseApiConfig(JSON.stringify({ baseUrl: "https://example.com/v1" }))).toEqual({
      ...DEFAULT_API_CONFIG,
      baseUrl: "https://example.com/v1",
    })
  })

  it("masks saved API keys", () => {
    expect(maskApiKey("")).toBe("未配置")
    expect(maskApiKey("short")).toBe("已配置")
    expect(maskApiKey("sk-1234567890")).toBe("sk-1••••7890")
  })
})
