import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { CodexTask } from "../codex-tasks/schema"

type JsonRpcMessage = {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type PendingRequest = {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export type CodexBridgeResult = {
  threadId: string
  turnId?: string
  visible: boolean
  notifications: string[]
  cardTool: {
    name: "open_asui_canvas_card"
    taskId: string
  }
}

export function buildCodexCardOpenInstruction(taskId: string) {
  return `请调用 ASUI Canvas Card 工具 open_asui_canvas_card，并传入 taskId: ${taskId}。只打开任务卡片，不执行代码修改。`
}

export function buildCodexTaskMessage(task: CodexTask) {
  const context = task.canvasContext
  const lines = [
    "ASUI 画布任务卡片",
    "",
    `任务 ID：${task.id}`,
    "任务类型：生图/改图",
    `任务说明：${task.instruction}`,
    "",
    `当前上下文：${context.selectedShapeIds.length} 个选中节点，${context.annotationIds.length} 个标注${
      context.width && context.height ? `，尺寸 ${context.width} × ${context.height}` : ""
    }${context.prompt?.trim() ? "，包含提示词" : ""}。`,
    context.prompt?.trim() ? `提示词：${context.prompt.trim()}` : "",
    context.selectedShapeIds.length ? `选中节点：${context.selectedShapeIds.join(", ")}` : "",
    context.annotationIds.length ? `标注节点：${context.annotationIds.join(", ")}` : "",
    "",
    buildCodexCardOpenInstruction(task.id),
  ]

  return lines.filter(Boolean).join("\n")
}

function createAppServerProcess() {
  const standaloneCodex = join(homedir(), ".local/bin/codex")
  const codexBin = process.env.CODEX_BIN || (existsSync(standaloneCodex) ? standaloneCodex : "codex")

  return spawn(codexBin, ["app-server", "proxy"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  })
}

export async function sendCodexTaskToAppServer(task: CodexTask): Promise<CodexBridgeResult> {
  const child = createAppServerProcess()
  const client = new CodexAppServerClient(child)

  try {
    await client.initialize()
    const thread = await client.startThread()
    await client.setThreadName(thread.id, "ASUI 画布任务")
    const turn = await client.startTaskTurn(thread.id, task)
    await client.waitForTurnCompleted(60_000).catch(() => null)

    return {
      threadId: thread.id,
      turnId: turn.id,
      visible: true,
      notifications: client.notifications,
      cardTool: {
        name: "open_asui_canvas_card",
        taskId: task.id,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes("app-server-control.sock") ||
      message.includes("failed to connect") ||
      message.includes("No such file or directory")
    ) {
      throw new Error("Codex 桌面桥接未连接：当前没有可用的 Codex app-server daemon，网页任务已备份到本地队列，可稍后用 ASUI 卡片工具打开。")
    }
    if (message.includes("Codex app-server 请求超时：initialize")) {
      throw new Error(
        "Codex daemon 已启动，但桌面 app-server proxy 没有响应当前会话投递协议；任务已备份到本地队列，但不会自动出现在当前 Codex 输入框。"
      )
    }
    throw error
  } finally {
    child.kill("SIGTERM")
  }
}

class CodexAppServerClient {
  private nextId = 1
  private buffer = ""
  private readonly pending = new Map<number, PendingRequest>()
  private readonly stderrChunks: string[] = []
  readonly notifications: string[] = []
  private turnCompletedResolver: (() => void) | null = null

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk) => this.handleStdout(String(chunk)))
    child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim()
      if (text) this.stderrChunks.push(text)
    })
    child.on("exit", (code, signal) => {
      const logs = this.stderrChunks.slice(-3).join(" | ")
      const suffix = logs ? `；日志：${logs}` : ""
      const error = new Error(
        `Codex app-server proxy 已退出：code=${code ?? "null"} signal=${signal ?? "null"}${suffix}`
      )
      for (const request of this.pending.values()) {
        request.reject(error)
      }
      this.pending.clear()
    })
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "asui_canvas",
        title: "ASUI Canvas",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: ["item/agentMessage/delta"],
      },
    })
    this.notify("initialized", {})
  }

  async startThread() {
    const response = (await this.request("thread/start", {
      cwd: process.cwd(),
      ephemeral: false,
      threadSource: "appServer",
      approvalPolicy: "never",
      sandbox: "workspace-write",
    })) as {
      thread?: {
        id?: string
      }
    }
    const threadId = response.thread?.id
    if (!threadId) throw new Error("Codex app-server 没有返回 threadId")
    return { id: threadId }
  }

  async setThreadName(threadId: string, title: string) {
    await this.request("thread/name/set", {
      threadId,
      name: title,
    })
  }

  async startTaskTurn(threadId: string, task: CodexTask) {
    const response = (await this.request("turn/start", {
      threadId,
      approvalPolicy: "never",
      input: [
        {
          type: "text",
          text: buildCodexTaskMessage(task),
          text_elements: [],
        },
      ],
    })) as {
      turn?: {
        id?: string
      }
    }
    const turnId = response.turn?.id
    if (!turnId) throw new Error("Codex app-server 没有返回 turnId")
    return { id: turnId }
  }

  waitForTurnCompleted(timeoutMs: number) {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.turnCompletedResolver === resolve) {
          this.turnCompletedResolver = null
        }
        resolve()
      }, timeoutMs)

      this.turnCompletedResolver = () => {
        clearTimeout(timeout)
        this.turnCompletedResolver = null
        resolve()
      }
    })
  }

  private request(method: string, params: unknown) {
    const id = this.nextId++
    const payload = { method, id, params }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new Error(
            `Codex app-server 请求超时：${method}${
              this.stderrChunks.length ? `；日志：${this.stderrChunks.slice(-3).join(" | ")}` : ""
            }`
          )
        )
      }, 15_000)

      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
    })
  }

  private notify(method: string, params: unknown) {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`)
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk
    let newlineIndex = this.buffer.indexOf("\n")

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (line) this.handleMessage(line)
      newlineIndex = this.buffer.indexOf("\n")
    }
  }

  private handleMessage(line: string) {
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line) as JsonRpcMessage
    } catch {
      return
    }

    if (typeof message.id === "number" && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(`Codex app-server ${pending.method} 失败：${message.error.message}`))
        return
      }
      pending.resolve(message.result)
      return
    }

    if (message.method) {
      this.notifications.push(message.method)
      if (message.method === "turn/completed") {
        this.turnCompletedResolver?.()
      }
    }
  }
}
