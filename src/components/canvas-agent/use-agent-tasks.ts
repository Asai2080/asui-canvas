"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AppendMessage } from "@assistant-ui/react"

import { writeAgentPromptToCanvas } from "@/lib/canvas-agent/canvas-commands/prompt-writeback"
import { writeAgentTaskToCanvas } from "@/lib/canvas-agent/canvas-commands/writeback"
import type {
  CanvasCommandBounds,
  CanvasOccupiedBounds,
} from "@/lib/canvas-agent/canvas-commands/schema"
import type { CanvasContextSnapshot } from "@/lib/canvas-agent/context/schema"
import type {
  AgentExecutionMode,
  AgentTask,
} from "@/lib/canvas-agent/task-schema"
import { readApiConfigFromSession } from "@/lib/canvas/api-config"

import {
  selectForegroundTask,
  tasksToConversationHistory,
} from "./agent-view-model"

export type AgentCanvasContext = {
  snapshot: CanvasContextSnapshot
  sourceBounds?: CanvasCommandBounds
  viewportBounds: CanvasCommandBounds
  occupiedBounds: CanvasOccupiedBounds[]
  selectionPreviews: AgentCanvasSelectionPreview[]
}

export type AgentCanvasSelectionPreview = {
  selectionId: string
  nodeId: string
  label: string
  mediaType?: "image" | "video"
  src?: string
}

type UseAgentTasksOptions = {
  getCanvasContext: () => AgentCanvasContext
  selectedSkillId?: string
  selectedTextModel?: string
  requestedOutputCount?: number
  executionMode: AgentExecutionMode
  conversationStartedAt?: string
  onBusyChange?: (busy: boolean) => void
  onForegroundTaskChange?: (task?: AgentTask) => void
}

type TaskPayload = { task?: AgentTask; error?: string }

function messageText(message: AppendMessage) {
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()
}

async function readTaskResponse(response: Response) {
  const payload = (await response.json()) as TaskPayload
  if (!response.ok || !payload.task) {
    throw new Error(payload.error ?? "Canvas Agent 请求失败")
  }
  return payload.task
}

export function useAgentTasks({
  getCanvasContext,
  selectedSkillId,
  selectedTextModel,
  requestedOutputCount,
  executionMode,
  conversationStartedAt,
  onBusyChange,
  onForegroundTaskChange,
}: UseAgentTasksOptions) {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const boundsByTaskRef = useRef(
    new Map<
      string,
      Pick<
        AgentCanvasContext,
        "sourceBounds" | "viewportBounds" | "occupiedBounds"
      >
    >()
  )
  const writebackRevisionRef = useRef("")
  const advanceRevisionRef = useRef("")
  const promptWritebackTaskIdsRef = useRef(new Set<string>())
  const textModelByTaskRef = useRef(new Map<string, string>())
  const foregroundTask = useMemo(() => selectForegroundTask(tasks), [tasks])

  const upsertTask = useCallback((task: AgentTask) => {
    setTasks((current) => [task, ...current.filter(({ id }) => id !== task.id)])
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/agent/tasks", { cache: "no-store" })
        const payload = (await response.json()) as {
          tasks?: AgentTask[]
          error?: string
        }
        if (!response.ok || !payload.tasks) {
          throw new Error(payload.error ?? "无法读取 Agent 任务")
        }
        if (active) setTasks(payload.tasks)
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "无法读取 Agent 任务")
        }
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    onBusyChange?.(Boolean(foregroundTask))
    onForegroundTaskChange?.(foregroundTask)
  }, [foregroundTask, onBusyChange, onForegroundTaskChange])

  useEffect(() => {
    const promptTask = tasks.find(
      (task) =>
        Boolean(task.compiledPrompt) &&
        [
          "awaiting-confirmation",
          "planning",
          "executing",
          "writing-canvas",
        ].includes(task.status) &&
        !promptWritebackTaskIdsRef.current.has(task.id)
    )
    if (!promptTask) return

    let cancelled = false
    promptWritebackTaskIdsRef.current.add(promptTask.id)
    const writePrompt = async () => {
      try {
        const fallback = getCanvasContext()
        const bounds = boundsByTaskRef.current.get(promptTask.id)
        await writeAgentPromptToCanvas({
          task: promptTask,
          sourceBounds: bounds?.sourceBounds ?? fallback.sourceBounds,
          viewportBounds: bounds?.viewportBounds ?? fallback.viewportBounds,
          occupiedBounds:
            bounds?.occupiedBounds ?? fallback.occupiedBounds,
        })
      } catch (reason) {
        promptWritebackTaskIdsRef.current.delete(promptTask.id)
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "提示词画板写入失败"
          )
        }
      }
    }
    void writePrompt()

    return () => {
      cancelled = true
    }
  }, [getCanvasContext, tasks])

  useEffect(() => {
    if (!foregroundTask) return
    let cancelled = false
    const revisionKey = `${foregroundTask.id}:${foregroundTask.revision}:${foregroundTask.status}`

    const advance = async () => {
      if (advanceRevisionRef.current === revisionKey) return
      advanceRevisionRef.current = revisionKey
      try {
        if (foregroundTask.status === "writing-canvas") {
          const writebackKey = `${foregroundTask.id}:${foregroundTask.revision}`
          if (writebackRevisionRef.current === writebackKey) return
          writebackRevisionRef.current = writebackKey
          const fallback = getCanvasContext()
          const bounds = boundsByTaskRef.current.get(foregroundTask.id)
          const next = await writeAgentTaskToCanvas({
            task: foregroundTask,
            sourceBounds: bounds?.sourceBounds ?? fallback.sourceBounds,
            viewportBounds: bounds?.viewportBounds ?? fallback.viewportBounds,
            occupiedBounds: fallback.occupiedBounds,
          })
          if (!cancelled) upsertTask(next)
          return
        }

        const config = readApiConfigFromSession()
        const response = await fetch(
          `/api/agent/tasks/${encodeURIComponent(foregroundTask.id)}/run`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              conversationHistory: tasksToConversationHistory(
                conversationStartedAt
                  ? tasks.filter(
                      (task) => task.createdAt >= conversationStartedAt
                    )
                  : tasks,
                foregroundTask.id
              ),
              textCredentials: {
                baseUrl: config.textBaseUrl,
                apiKey: config.textApiKey,
                model:
                  textModelByTaskRef.current.get(foregroundTask.id) ||
                  config.textModel,
              },
              imageCredentials: {
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                model: config.model,
              },
              videoCredentials: {
                videoBaseUrl: config.videoBaseUrl,
                videoApiKey: config.videoApiKey,
                videoModel: config.videoModel,
              },
            }),
          }
        )
        const next = await readTaskResponse(response)
        if (!cancelled) upsertTask(next)
      } catch (reason) {
        writebackRevisionRef.current = ""
        if (advanceRevisionRef.current === revisionKey) {
          advanceRevisionRef.current = ""
        }
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Agent 任务推进失败")
        }
      }
    }

    const timer = window.setTimeout(() => void advance(), 750)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    conversationStartedAt,
    foregroundTask,
    getCanvasContext,
    tasks,
    upsertTask,
  ])

  const submitMessage = useCallback(
    async (message: AppendMessage) => {
      const userInstruction = messageText(message)
      if (!userInstruction) return
      setError("")
      const context = getCanvasContext()
      const response = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userInstruction,
          executionMode,
          requestedOutputCount,
          selectedCanvasId: context.snapshot.selectedNodeId,
          skillId: selectedSkillId || undefined,
          contextSnapshot: context.snapshot,
        }),
      })
      const created = await readTaskResponse(response)
      boundsByTaskRef.current.set(created.id, {
        sourceBounds: context.sourceBounds,
        viewportBounds: context.viewportBounds,
        occupiedBounds: context.occupiedBounds,
      })
      const textModel = selectedTextModel?.trim()
      if (textModel) textModelByTaskRef.current.set(created.id, textModel)
      upsertTask(created)
    },
    [
      executionMode,
      getCanvasContext,
      requestedOutputCount,
      selectedSkillId,
      selectedTextModel,
      upsertTask,
    ]
  )

  const performTaskAction = useCallback(
    async (
      taskId: string,
      action: "cancel" | "confirm" | "retry",
      input?: { width: number; height: number }
    ) => {
      setError("")
      try {
        const response = await fetch(
          `/api/agent/tasks/${encodeURIComponent(taskId)}/${action}`,
          {
            method: "POST",
            headers: input ? { "content-type": "application/json" } : undefined,
            body: input ? JSON.stringify(input) : undefined,
          }
        )
        upsertTask(await readTaskResponse(response))
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Agent 任务操作失败"
        )
        throw reason
      }
    },
    [upsertTask]
  )

  return {
    tasks,
    foregroundTask,
    isLoading,
    error,
    clearError: () => setError(""),
    submitMessage,
    cancelTask: (taskId: string) => performTaskAction(taskId, "cancel"),
    confirmTask: (
      taskId: string,
      dimensions?: { width: number; height: number }
    ) => performTaskAction(taskId, "confirm", dimensions),
    retryTask: (taskId: string) => performTaskAction(taskId, "retry"),
  }
}
