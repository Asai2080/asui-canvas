const CONVERSATION_STARTED_AT_KEY =
  "asui:canvas-agent:conversation-started-at"

export type ConversationSessionStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function readConversationStartedAt(
  storage?: ConversationSessionStorage
) {
  if (!storage) return ""

  try {
    const value = storage.getItem(CONVERSATION_STARTED_AT_KEY) ?? ""
    return value && !Number.isNaN(Date.parse(value)) ? value : ""
  } catch {
    return ""
  }
}

export function writeConversationStartedAt(
  storage: ConversationSessionStorage | undefined,
  startedAt: string
) {
  if (!storage || Number.isNaN(Date.parse(startedAt))) return

  try {
    storage.setItem(CONVERSATION_STARTED_AT_KEY, startedAt)
  } catch {
    // The in-memory conversation still works when browser storage is unavailable.
  }
}
