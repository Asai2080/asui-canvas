"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AppendMessage } from "@assistant-ui/react"

import { writeAgentTaskToCanvas } from "@/lib/canvas-agent/canvas-commands/writeback"
import type { CanvasCommandBounds } from "@/lib/canvas-agent/canvas-commands/schema"
import type { CanvasContextSnapshot } from "@/lib/canvas-agent/context/schema"
import type { AgentTask } from "@/lib/canvas-agent/task-schema"
import { readApiConfigFromSession } from "@/lib/canvas/api-config"

import { selectForegroundTask } from "./agent-view-model"

export type AgentCanvasContext = {
  snapshot: CanvasContextSnapshot
  sourceBounds?: CanvasCommandBounds
  viewportBounds: CanvasCommandBounds
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
  onBusyChange,
  onForegroundTaskChange,
}: UseAgentTasksOptions) {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const boundsByTaskRef = useRef(
    new Map<
      string,
      Pick<AgentCanvasContext, "sourceBounds" | "viewportBounds">
    >()
  )
  const writebackRevisionRef = useRef("")
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
    if (!foregroundTask) return
    let cancelled = false

    const advance = async () => {
      try {
        if (foregroundTask.status === "writing-canvas") {
          const revisionKey = `${foregroundTask.id}:${foregroundTask.revision}`
          if (writebackRevisionRef.current === revisionKey) return
          writebackRevisionRef.current = revisionKey
          const fallback = getCanvasContext()
          const bounds = boundsByTaskRef.current.get(foregroundTask.id)
          const next = await writeAgentTaskToCanvas({
            task: foregroundTask,
            sourceBounds: bounds?.sourceBounds ?? fallback.sourceBounds,
            viewportBounds: bounds?.viewportBounds ?? fallback.viewportBounds,
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
              textCredentials: {
                baseUrl: config.textBaseUrl,
                apiKey: config.textApiKey,
                model: config.textModel,
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
  }, [foregroundTask, getCanvasContext, upsertTask])

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
          selectedCanvasId: context.snapshot.selectedNodeId,
          skillId: selectedSkillId || undefined,
          contextSnapshot: context.snapshot,
        }),
      })
      const created = await readTaskResponse(response)
      boundsByTaskRef.current.set(created.id, {
        sourceBounds: context.sourceBounds,
        viewportBounds: context.viewportBounds,
      })
      upsertTask(created)
    },
    [getCanvasContext, selectedSkillId, upsertTask]
  )

  const performTaskAction = useCallback(
    async (taskId: string, action: "cancel" | "retry") => {
      setError("")
      const response = await fetch(
        `/api/agent/tasks/${encodeURIComponent(taskId)}/${action}`,
        { method: "POST" }
      )
      upsertTask(await readTaskResponse(response))
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
    retryTask: (taskId: string) => performTaskAction(taskId, "retry"),
  }
}
