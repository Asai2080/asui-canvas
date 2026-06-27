import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

type ServiceState = {
  process?: ChildProcessWithoutNullStreams
  logs: string[]
  startedAt?: string
}

declare global {
  var __asuiBirefnetService: ServiceState | undefined
}

const DEFAULT_PORT = 7861
const DEFAULT_HOST = "127.0.0.1"
export const DEFAULT_BIREFNET_SERVICE_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`

const state = () => {
  globalThis.__asuiBirefnetService ??= { logs: [] }
  return globalThis.__asuiBirefnetService
}

const pushLog = (message: string) => {
  const current = state()
  current.logs.push(message)
  current.logs = current.logs.slice(-40)
}

export function getBirefnetServiceUrl() {
  return (process.env.BIREFNET_SERVICE_URL || DEFAULT_BIREFNET_SERVICE_URL).replace(/\/+$/, "")
}

export function isManagedLocalBirefnetService() {
  return getBirefnetServiceUrl() === DEFAULT_BIREFNET_SERVICE_URL
}

async function checkHealth(url = getBirefnetServiceUrl()) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 900)

  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export async function getBirefnetServiceStatus() {
  const current = state()
  const healthy = await checkHealth()
  const managedProcessRunning = Boolean(current.process && !current.process.killed && current.process.exitCode === null)

  return {
    running: healthy,
    managed: managedProcessRunning,
    url: getBirefnetServiceUrl(),
    startedAt: current.startedAt,
    logs: current.logs,
  }
}

export async function startBirefnetService() {
  if (!isManagedLocalBirefnetService()) {
    return {
      ...(await getBirefnetServiceStatus()),
      message: "当前使用外部 BiRefNet 服务地址，不由画布启动。",
    }
  }

  if (await checkHealth(DEFAULT_BIREFNET_SERVICE_URL)) {
    return {
      ...(await getBirefnetServiceStatus()),
      message: "BiRefNet HR 服务已在运行。",
    }
  }

  const current = state()
  if (current.process && !current.process.killed && current.process.exitCode === null) {
    return {
      ...(await getBirefnetServiceStatus()),
      message: "BiRefNet HR 服务正在启动中。",
    }
  }

  const scriptPath = join(process.cwd(), "services", "birefnet", "server.py")
  if (!existsSync(scriptPath)) {
    throw new Error("缺少 services/birefnet/server.py")
  }

  const python = process.env.BIREFNET_PYTHON || "python3"
  const child = spawn(python, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BIREFNET_HOST: DEFAULT_HOST,
      BIREFNET_PORT: String(DEFAULT_PORT),
    },
  })

  current.process = child
  current.startedAt = new Date().toISOString()
  current.logs = []
  pushLog(`[asui] starting ${python} ${scriptPath}`)

  child.stdout.on("data", (chunk) => pushLog(String(chunk).trim()))
  child.stderr.on("data", (chunk) => pushLog(String(chunk).trim()))
  child.on("exit", (code, signal) => {
    pushLog(`[asui] exited code=${code ?? "null"} signal=${signal ?? "null"}`)
    if (state().process === child) {
      state().process = undefined
      state().startedAt = undefined
    }
  })

  return {
    running: false,
    managed: true,
    url: DEFAULT_BIREFNET_SERVICE_URL,
    startedAt: current.startedAt,
    logs: current.logs,
    message: "BiRefNet HR 服务启动中。",
  }
}

export async function stopBirefnetService() {
  const current = state()
  const child = current.process

  if (!child || child.killed || child.exitCode !== null) {
    return {
      ...(await getBirefnetServiceStatus()),
      message: "没有由画布启动的 BiRefNet HR 服务可关闭。",
    }
  }

  child.kill("SIGTERM")
  current.process = undefined
  current.startedAt = undefined
  pushLog("[asui] stop requested")

  return {
    running: false,
    managed: false,
    url: getBirefnetServiceUrl(),
    startedAt: undefined,
    logs: current.logs,
    message: "BiRefNet HR 服务已请求关闭。",
  }
}
