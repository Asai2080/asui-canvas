import { describe, expect, it } from "vitest"

import { isCanvasAgentEnabled, parseBooleanFlag } from "./feature-flags"

describe("canvas agent feature flag", () => {
  it("is disabled when no flag is configured", () => {
    expect(isCanvasAgentEnabled({})).toBe(false)
  })

  it.each(["1", "true", "TRUE", " yes ", "on"])("accepts %s as enabled", (value) => {
    expect(parseBooleanFlag(value)).toBe(true)
  })

  it.each([undefined, "", "0", "false", "off", "enabled"])("rejects %s as enabled", (value) => {
    expect(parseBooleanFlag(value)).toBe(false)
  })

  it("only reads the public flag for client-safe behavior", () => {
    expect(
      isCanvasAgentEnabled({
        CANVAS_AGENT_ENABLED: "true",
        NEXT_PUBLIC_CANVAS_AGENT_ENABLED: "false",
      })
    ).toBe(false)
  })
})
