import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"

const SERVER_NAME = "ASUI Canvas Card MCP"
const SERVER_VERSION = "0.1.0"
const WIDGET_URI = "ui://asui-canvas/task-card.html"
const RESOURCE_MIME_TYPE = "text/html+skybridge"
const TOOL_OPEN_CARD = "open_asui_canvas_card"
const TOOL_LIST_TASKS = "list_asui_canvas_tasks"
const TASK_ROOT = ".asui-codex"
const TASK_STATUSES = ["queued", "received", "processing", "done", "failed"]
const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
}

const rootDir = process.cwd()
const widgetPath = path.join(rootDir, "public", "asui-codex-task-card.html")

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } })
}

async function readWidgetHtml() {
  return readFile(widgetPath, "utf8")
}

async function readTaskFile(status, fileName) {
  const taskPath = path.join(rootDir, TASK_ROOT, "tasks", status, fileName)
  const raw = await readFile(taskPath, "utf8")
  return {
    task: JSON.parse(raw),
    file: {
      fileName,
      path: taskPath,
      relativePath: `${TASK_ROOT}/tasks/${status}/${fileName}`,
    },
  }
}

async function listTaskFiles(status) {
  const dir = path.join(rootDir, TASK_ROOT, "tasks", status)
  try {
    const fileNames = await readdir(dir)
    return fileNames.filter((fileName) => fileName.endsWith(".json")).sort()
  } catch {
    return []
  }
}

async function findTask(taskId) {
  if (!taskId) return null
  const fileName = taskId.endsWith(".json") ? taskId : `${taskId}.json`
  for (const status of TASK_STATUSES) {
    try {
      return await readTaskFile(status, fileName)
    } catch {
      // Keep scanning statuses.
    }
  }
  return null
}

async function listRecentTasks(limit = 8) {
  const tasks = []
  for (const status of TASK_STATUSES) {
    const fileNames = await listTaskFiles(status)
    for (const fileName of fileNames) {
      try {
        tasks.push(await readTaskFile(status, fileName))
      } catch {
        // Ignore partially written or invalid task files.
      }
    }
  }

  return tasks
    .sort((a, b) => String(b.task.createdAt || "").localeCompare(String(a.task.createdAt || "")))
    .slice(0, Math.max(1, Math.min(limit, 20)))
}

function normalizeCardInput(args, taskResult) {
  const task = taskResult?.task
  const context = task?.canvasContext ?? {}
  const mode = args.mode || (task?.type === "image-generation" ? "image" : "image")
  const selectedShapeIds = Array.isArray(args.selectedShapeIds)
    ? args.selectedShapeIds
    : Array.isArray(context.selectedShapeIds)
      ? context.selectedShapeIds
      : []
  const annotationIds = Array.isArray(args.annotationIds)
    ? args.annotationIds
    : Array.isArray(context.annotationIds)
      ? context.annotationIds
      : []
  const feedbackItems = Array.isArray(context.feedbackItems) ? context.feedbackItems : []
  const prompt = args.prompt || context.prompt || task?.instruction || ""
  const width = Number(args.width || context.width || 0) || undefined
  const height = Number(args.height || context.height || 0) || undefined
  const sourceImageSrc = args.sourceImageSrc || context.sourceImageSrc || context.referenceImageSrc || ""

  return {
    title: args.title || (mode === "video" ? "ASUI 图生视频任务" : "ASUI 生图/改图任务"),
    mode,
    taskId: task?.id || args.taskId || "",
    status: task?.status || "draft",
    instruction: task?.instruction || args.instruction || "根据当前 ASUI 画布上下文生成结果。",
    prompt,
    selectedShapeIds,
    annotationIds,
    feedbackItems,
    width,
    height,
    sourceImageSrc,
    file: taskResult?.file,
    createdAt: task?.createdAt || new Date().toISOString(),
  }
}

function toolSchemas() {
  return [
    {
      name: TOOL_OPEN_CARD,
      title: "Open ASUI Canvas Task Card",
      description:
        "Render an ASUI Canvas image or video generation task as a native Codex card. Use this for ASUI canvas generation tasks, not code edits.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Optional ASUI task id from .asui-codex/tasks.",
          },
          title: {
            type: "string",
            description: "Optional card title.",
          },
          mode: {
            type: "string",
            enum: ["image", "video"],
            description: "Task mode. Defaults to image.",
          },
          instruction: {
            type: "string",
            description: "Task instruction when taskId is not provided.",
          },
          prompt: {
            type: "string",
            description: "Prompt text from the canvas composer.",
          },
          selectedShapeIds: {
            type: "array",
            items: { type: "string" },
          },
          annotationIds: {
            type: "array",
            items: { type: "string" },
          },
          width: {
            type: "number",
          },
          height: {
            type: "number",
          },
          sourceImageSrc: {
            type: "string",
            description: "Optional data URL or URL for the source image thumbnail.",
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/toolInvocation/invoking": "打开 ASUI 任务卡片",
        "openai/toolInvocation/invoked": "ASUI 任务卡片已打开",
      },
    },
    {
      name: TOOL_LIST_TASKS,
      title: "List ASUI Canvas Tasks",
      description: "List recent ASUI Canvas task queue entries from the local workspace.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of tasks to return, capped at 20.",
            default: 8,
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ]
}

async function handleOpenCard(id, args) {
  const taskResult = args.taskId ? await findTask(args.taskId) : null
  if (args.taskId && !taskResult) {
    sendError(id, JsonRpcError.INVALID_PARAMS, `ASUI task not found: ${args.taskId}`)
    return
  }

  const card = normalizeCardInput(args, taskResult)
  const summary = [
    `${card.title}`,
    `模式：${card.mode === "video" ? "图生视频" : "生图/改图"}`,
    `上下文：${card.selectedShapeIds.length} 个选中节点，${card.annotationIds.length} 个标注`,
    card.width && card.height ? `尺寸：${card.width} × ${card.height}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  sendResult(id, {
    content: [
      {
        type: "text",
        text: `已渲染 ASUI 画布任务卡片。\n${summary}`,
      },
    ],
    structuredContent: {
      card,
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
    },
  })
}

async function handleListTasks(id, args) {
  const limit = Number(args.limit || 8)
  const results = await listRecentTasks(limit)

  sendResult(id, {
    content: [
      {
        type: "text",
        text: results.length
          ? `找到 ${results.length} 个 ASUI 画布任务。`
          : "当前没有 ASUI 画布任务。",
      },
    ],
    structuredContent: {
      tasks: results.map(({ task, file }) => ({
        id: task.id,
        status: task.status,
        type: task.type,
        instruction: task.instruction,
        createdAt: task.createdAt,
        relativePath: file.relativePath,
      })),
    },
  })
}

async function handleToolCall(id, params) {
  const args = params?.arguments ?? {}
  if (params?.name === TOOL_OPEN_CARD) {
    await handleOpenCard(id, args)
    return
  }
  if (params?.name === TOOL_LIST_TASKS) {
    await handleListTasks(id, args)
    return
  }
  sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown tool: ${params?.name ?? ""}`)
}

async function handleRequest(message) {
  const { id, method, params } = message

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: params?.protocolVersion ?? "2025-11-25",
      capabilities: {
        tools: {},
        resources: {},
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      instructions:
        "Use open_asui_canvas_card only for ASUI Canvas image or video generation tasks. Do not use it for code-change tasks.",
    })
    return
  }

  if (method === "ping") {
    sendResult(id, {})
    return
  }

  if (method === "tools/list") {
    sendResult(id, { tools: toolSchemas() })
    return
  }

  if (method === "tools/call") {
    try {
      await handleToolCall(id, params)
    } catch (error) {
      sendError(id, JsonRpcError.INTERNAL_ERROR, error instanceof Error ? error.message : String(error))
    }
    return
  }

  if (method === "resources/list") {
    sendResult(id, {
      resources: [
        {
          uri: WIDGET_URI,
          name: "ASUI Canvas Task Card",
          mimeType: RESOURCE_MIME_TYPE,
          description: "Native card UI for ASUI Canvas generation tasks.",
        },
      ],
    })
    return
  }

  if (method === "resources/read") {
    if (params?.uri !== WIDGET_URI) {
      sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown resource: ${params?.uri ?? ""}`)
      return
    }
    const html = await readWidgetHtml()
    sendResult(id, {
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
            "openai/widgetDescription":
              "ASUI Canvas task card for image, annotation, and image-to-video generation workflows.",
          },
        },
      ],
    })
    return
  }

  if (id !== undefined) {
    sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}

const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

lines.on("line", (line) => {
  if (!line.trim()) return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  void handleRequest(message)
})
