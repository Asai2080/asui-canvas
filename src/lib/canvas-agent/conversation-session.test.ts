import { describe, expect, it } from "vitest"

import {
  readConversationStartedAt,
  writeConversationStartedAt,
  type ConversationSessionStorage,
} from "./conversation-session"

class MemorySessionStorage implements ConversationSessionStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe("canvas agent conversation session", () => {
  it("restores a new conversation after the page is remounted", () => {
    const storage = new MemorySessionStorage()
    const startedAt = "2026-08-06T10:30:00.000Z"

    writeConversationStartedAt(storage, startedAt)

    expect(readConversationStartedAt(storage)).toBe(startedAt)
  })

  it("ignores missing or invalid persisted timestamps", () => {
    const storage = new MemorySessionStorage()
    storage.setItem("asui:canvas-agent:conversation-started-at", "not-a-date")

    expect(readConversationStartedAt(storage)).toBe("")
  })
})
