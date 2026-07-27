export type CutoutServicePhase = "starting" | "processing" | "stopping"

type CutoutServiceStatus = {
  running?: boolean
  managed?: boolean
  url?: string
  message?: string
  error?: string
  logs?: string[]
}

type AutoManagedCutoutOptions<T> = {
  run: () => Promise<T>
  onPhase?: (phase: CutoutServicePhase) => void
  pollIntervalMs?: number
  startupTimeoutMs?: number
}

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration))

async function requestServiceStatus() {
  const response = await fetch("/api/cutout/service")
  const payload = (await response.json().catch(() => ({}))) as CutoutServiceStatus

  if (!response.ok) {
    throw new Error(payload.error ?? "无法检查 BiRefNet HR 服务状态")
  }

  return payload
}

async function requestServiceAction(action: "start" | "stop") {
  const response = await fetch("/api/cutout/service", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  })
  const payload = (await response.json().catch(() => ({}))) as CutoutServiceStatus

  if (!response.ok) {
    throw new Error(payload.error ?? `BiRefNet HR 服务${action === "start" ? "启动" : "关闭"}失败`)
  }

  return payload
}

function startupError(status: CutoutServiceStatus) {
  return status.error ?? status.logs?.at(-1) ?? status.message
}

async function waitForServiceReady({
  initialStatus,
  pollIntervalMs,
  startupTimeoutMs,
}: {
  initialStatus: CutoutServiceStatus
  pollIntervalMs: number
  startupTimeoutMs: number
}) {
  if (initialStatus.running) return

  const deadline = Date.now() + startupTimeoutMs
  while (Date.now() < deadline) {
    const status = await requestServiceStatus()
    if (status.running) return
    if (initialStatus.managed && status.managed === false) {
      throw new Error(startupError(status) ?? "BiRefNet HR 服务启动失败")
    }
    await wait(pollIntervalMs)
  }

  throw new Error("BiRefNet HR 服务启动超时，请检查本地 Python 环境和模型文件")
}

export async function runWithAutoManagedCutoutService<T>({
  run,
  onPhase,
  pollIntervalMs = 700,
  startupTimeoutMs = 120_000,
}: AutoManagedCutoutOptions<T>) {
  const previousStatus = await requestServiceStatus()
  let shouldStopService = false

  try {
    if (!previousStatus.running) {
      onPhase?.("starting")
      const startedStatus = await requestServiceAction("start")
      shouldStopService = previousStatus.managed !== true && startedStatus.managed === true
      await waitForServiceReady({
        initialStatus: startedStatus,
        pollIntervalMs,
        startupTimeoutMs,
      })
    }

    onPhase?.("processing")
    return await run()
  } finally {
    if (shouldStopService) {
      onPhase?.("stopping")
      try {
        await requestServiceAction("stop")
      } catch (error) {
        console.warn("Failed to stop auto-started BiRefNet HR service", error)
      }
    }
  }
}
