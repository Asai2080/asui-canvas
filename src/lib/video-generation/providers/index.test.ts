import { describe, expect, it } from "vitest"

import { resolveVideoGenerationProvider } from "./index"

describe("video generation provider registry", () => {
  it("resolves Ark Seedance from Volcengine base URL", () => {
    const provider = resolveVideoGenerationProvider({
      videoBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      videoModel: "doubao-seedance-2-0-260128",
    })

    expect(provider.id).toBe("ark-seedance")
  })

  it("resolves Ark Seedance from model name when provider is not explicit", () => {
    const provider = resolveVideoGenerationProvider({
      videoBaseUrl: "https://example.com/api/v1",
      videoModel: "doubao-seedance-2-0-260128",
    })

    expect(provider.id).toBe("ark-seedance")
  })
})
