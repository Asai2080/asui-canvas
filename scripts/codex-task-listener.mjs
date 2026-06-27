const baseUrl = process.env.ASUI_CANVAS_URL || "http://localhost:3030"
const receiver = process.env.ASUI_CODEX_RECEIVER || "codex-local-listener"
const intervalMs = Number(process.env.ASUI_CODEX_POLL_MS || 1500)

let stopped = false

process.on("SIGINT", () => {
  stopped = true
})

process.on("SIGTERM", () => {
  stopped = true
})

async function receiveOnce() {
  const response = await fetch(`${baseUrl}/api/codex-tasks/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiver }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  if (payload.task) {
    console.log(`[asui-codex-listener] received ${payload.task.id}: ${payload.task.instruction}`)
  }
}

console.log(`[asui-codex-listener] watching ${baseUrl}/api/codex-tasks/receive as ${receiver}`)

while (!stopped) {
  try {
    await receiveOnce()
  } catch (error) {
    console.error(`[asui-codex-listener] ${error instanceof Error ? error.message : String(error)}`)
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs))
}

console.log("[asui-codex-listener] stopped")
