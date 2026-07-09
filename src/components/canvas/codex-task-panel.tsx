"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bot, Check, Copy, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { AnnotationFeedbackItem } from "@/lib/canvas/annotations"
import type { ImageVersion } from "@/lib/canvas/types"

export type ResolvedCodexCanvasContext = {
  sourceShapeId?: string
  versionId?: string
  annotationIds?: string[]
  sourceImageSrc?: string
  referenceImageSrc?: string
  feedbackItems?: AnnotationFeedbackItem[]
  prompt?: string
  width?: number
  height?: number
}

type CodexTaskPanelProps = {
  selectedShapeIds: string[]
  annotationIds: string[]
  prompt: string
  width: number
  height: number
  resolveCanvasContext: () => Promise<ResolvedCodexCanvasContext>
  onInsertResult: (version: ImageVersion) => Promise<void>
  onTaskQueued?: (taskId: string, context: ResolvedCodexCanvasContext) => void
  onClose: () => void
}

export function CodexTaskPanel({
  selectedShapeIds,
  annotationIds,
  prompt,
  width,
  height,
  resolveCanvasContext,
  onInsertResult,
  onTaskQueued,
  onClose,
}: CodexTaskPanelProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "waiting" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [bridgeDetail, setBridgeDetail] = useState("")
  const [threadId, setThreadId] = useState("")
  const [taskId, setTaskId] = useState("")
  const [previewContext, setPreviewContext] = useState<ResolvedCodexCanvasContext | null>(null)
  const [isResolvingPreview, setIsResolvingPreview] = useState(false)
  const pollingTaskRef = useRef("")
  const effectiveAnnotationIds = previewContext?.annotationIds ?? annotationIds
  const effectiveWidth = previewContext?.width ?? width
  const effectiveHeight = previewContext?.height ?? height
  const effectivePrompt = previewContext?.prompt ?? prompt
  const inferredType = "image-generation"
  const inferredTitle = "生图/改图任务"
  const inferredInstruction =
    effectiveAnnotationIds.length > 1
      ? "根据当前画布选区和多个标注，统一生成一版修改结果。"
      : effectiveAnnotationIds.length === 1
        ? "根据当前画布选区和标注，生成一版修改结果。"
        : "根据当前画布选区、尺寸和提示词生成图片。"
  const codexMessage = [
    taskId
      ? `请读取本地画布任务 ${taskId}，只处理生图/改图，不执行代码修改。`
      : "来自 ASUI 画布的任务：",
    inferredInstruction,
    "",
    `当前上下文：${selectedShapeIds.length} 个选中节点，${effectiveAnnotationIds.length} 个标注，尺寸 ${effectiveWidth} × ${effectiveHeight}${
      effectivePrompt.trim() ? "，包含当前提示词" : ""
    }。`,
    effectivePrompt.trim() ? `提示词：${effectivePrompt.trim()}` : "",
    selectedShapeIds.length ? `选中节点：${selectedShapeIds.join(", ")}` : "",
    effectiveAnnotationIds.length ? `标注节点：${effectiveAnnotationIds.join(", ")}` : "",
    "",
    "请只作为生图/改图任务处理：围绕当前画布选区和标注生成结果，不执行代码修改。",
  ]
    .filter(Boolean)
    .join("\n")

  const copyCodexMessage = async () => {
    try {
      await navigator.clipboard.writeText(codexMessage)
      setStatus("success")
      setMessage("已复制到剪贴板，作为 Codex Bridge 失败时的备用方案。")
    } catch {
      setStatus("error")
      setMessage("浏览器没有剪贴板权限，请手动复制下面的任务文案。")
    }
  }

  const resolvePreviewContextWithTimeout = useCallback(async () => {
    return await Promise.race<ResolvedCodexCanvasContext>([
      resolveCanvasContext(),
      new Promise((resolve) => window.setTimeout(() => resolve({}), 3000)),
    ])
  }, [resolveCanvasContext])

  const waitForTaskResult = useCallback(async (taskId: string) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const response = await fetch(`/api/codex-tasks?taskId=${encodeURIComponent(taskId)}`)
      if (!response.ok) continue
      const payload = (await response.json()) as {
        task?: {
          status?: string
          receiver?: string
          error?: string
          result?: {
            message?: string
            version?: ImageVersion
          }
        }
        file?: { relativePath?: string }
      }
      if (payload.task?.status === "received") {
        setStatus("waiting")
        setBridgeDetail("")
        setMessage(
          `本地 Codex 接收器已读取任务：${payload.file?.relativePath ?? taskId}${
            payload.task.receiver ? `，接收器 ${payload.task.receiver}` : ""
          }。任务不会出现在 Codex 输入框里，结果完成后会自动写回画布。`
        )
        continue
      }
      if (payload.task?.status === "processing") {
        setStatus("waiting")
        setBridgeDetail("")
        setMessage("本地 Codex 接收器正在生成图片，完成后会自动插回画布。")
        continue
      }
      if (payload.task?.status === "done") {
        if (payload.task.result?.version) {
          try {
            await onInsertResult(payload.task.result.version)
            setBridgeDetail("")
            setStatus("success")
            setMessage(payload.task.result.message ?? "Codex 图片任务已完成，结果已插回无限画布。")
          } catch (error) {
            setBridgeDetail("")
            setStatus("error")
            setMessage(error instanceof Error ? `Codex 已生成结果，但插入画布失败：${error.message}` : "Codex 已生成结果，但插入画布失败。")
          }
        } else {
          setBridgeDetail("")
          setStatus("error")
          setMessage("Codex 图片任务已完成，但没有返回可插入的图片结果。")
        }
        return
      }
      if (payload.task?.status === "failed") {
        setBridgeDetail("")
        setStatus("error")
        setMessage(payload.task.error ?? "Codex 图片任务处理失败。")
        return
      }
    }
    setStatus("waiting")
    setMessage("任务仍在本地队列中；请确认 codex:image-runner 正在运行，页面保持打开即可继续等待结果。")
  }, [onInsertResult])

  useEffect(() => {
    let isMounted = true

    void Promise.resolve()
      .then(() => {
        if (!isMounted) return null
        setIsResolvingPreview(true)
        return resolvePreviewContextWithTimeout()
      })
      .then((resolvedContext) => {
        if (!isMounted || !resolvedContext) return
        setPreviewContext(resolvedContext)
      })
      .catch(() => {
        if (!isMounted) return
        setPreviewContext(null)
      })
      .finally(() => {
        if (!isMounted) return
        setIsResolvingPreview(false)
      })

    return () => {
      isMounted = false
    }
  }, [resolvePreviewContextWithTimeout])

  useEffect(() => {
    if (onTaskQueued || !taskId || status !== "waiting" || pollingTaskRef.current === taskId) return

    pollingTaskRef.current = taskId
    void waitForTaskResult(taskId).finally(() => {
      if (pollingTaskRef.current === taskId) {
        pollingTaskRef.current = ""
      }
    })
  }, [onTaskQueued, status, taskId, waitForTaskResult])

  const submitTask = async () => {
    setStatus("sending")
    setMessage("")
    setBridgeDetail("")
    setThreadId("")
    setTaskId("")

    try {
      const resolvedContext = previewContext ?? (await resolvePreviewContextWithTimeout())
      const response = await fetch("/api/codex-bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: inferredType,
          instruction: inferredInstruction,
          canvasContext: {
            selectedShapeIds,
            annotationIds,
            prompt: prompt || undefined,
            width,
            height,
            ...resolvedContext,
          },
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        task?: { id?: string }
        file?: { relativePath?: string }
        codex?: {
          threadId?: string
          turnId?: string
          visible?: boolean
          mode?: string
          bridgeError?: string
          cardTool?: { name?: string; taskId?: string }
        }
        message?: string
        error?: string
      }

      if (!response.ok) {
        const backupText = payload.file?.relativePath ? `；任务已备份到 ${payload.file.relativePath}` : ""
        throw new Error(`${payload.error ?? "Codex Bridge 发送失败"}${backupText}`)
      }

      setThreadId(payload.codex?.threadId ?? "")
      setTaskId(payload.task?.id ?? "")
      if (payload.task?.id) {
        onTaskQueued?.(payload.task.id, resolvedContext)
      }
      if (payload.codex?.threadId) {
        setStatus("success")
        setMessage(
          `已创建 Codex 会话 ${payload.codex.threadId}，并提交画布任务 ${
            payload.task?.id ?? ""
          }${payload.file?.relativePath ? `；任务备份在 ${payload.file.relativePath}` : ""}。`
        )
      } else if (payload.codex?.mode === "queue") {
        setStatus("waiting")
        setMessage("任务已进入本地 Codex 队列；不会出现在 Codex 输入框里，接收器会在后台读取并写回结果。")
        setBridgeDetail(
          [
            payload.codex.bridgeError,
            payload.task?.id ? `taskId: ${payload.task.id}` : payload.file?.relativePath,
            "当前桌面桥接未提供把网页任务直接塞进 Codex 当前输入框的通道；这里走本地队列和接收器闭环。",
          ]
            .filter(Boolean)
            .join("\n")
        )
      } else {
        setStatus("waiting")
        setMessage(
          payload.file?.relativePath
            ? `任务已写入本地队列 ${payload.file.relativePath}，等待本地 Codex 接收器处理。`
            : "画布任务已创建，等待本地 Codex 接收器处理。"
        )
      }
      if (payload.task?.id && !payload.codex?.threadId) {
        setStatus("waiting")
      }
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Codex Bridge 发送失败")
      setBridgeDetail("")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-center bg-background/45 px-4 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="codex-task-title"
      onPointerDown={onClose}
    >
      <form
        className="flex max-h-[min(720px,calc(100vh-5rem))] w-full max-w-lg flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void submitTask()
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-5 pb-0">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </div>
            <div>
              <h2 id="codex-task-title" className="text-base font-semibold leading-none">
                交给 Codex
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">写入本地任务队列，由 Codex 接收器生成并回写</p>
            </div>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="关闭 Codex 任务" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <Separator className="mx-5 my-5 shrink-0" />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="rounded-2xl border bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">自动识别为</span>
              <span className="font-semibold">{inferredTitle}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{inferredInstruction}</p>
          </div>

          <div className="mt-4 rounded-2xl border bg-muted/35 p-3 text-xs text-muted-foreground">
            当前上下文：{selectedShapeIds.length} 个选中节点，{effectiveAnnotationIds.length} 个标注，尺寸{" "}
            {effectiveWidth} × {effectiveHeight}
            {effectivePrompt.trim() ? "，包含当前提示词" : ""}
            {isResolvingPreview ? "，正在识别画布标注" : ""}
          </div>

          <div className="mt-4 rounded-2xl border border-dashed bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Bot className="size-3.5" />
              本地 Codex 任务
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              点击确认后，任务会进入本地队列，由 codex:image-runner 读取处理；当前不会在 Codex 输入框里显示消息。
            </p>
            {taskId ? <p className="mt-2 break-all text-[11px] text-muted-foreground">task: {taskId}</p> : null}
            {threadId ? <p className="mt-2 break-all text-[11px] text-muted-foreground">thread: {threadId}</p> : null}
          </div>

          <div className="mt-4 rounded-2xl border bg-background">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <span className="text-xs font-semibold">任务内容预览</span>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg" onClick={copyCodexMessage}>
                {status === "success" && message.includes("剪贴板") ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                备用复制
              </Button>
            </div>
            <textarea
              readOnly
              value={codexMessage}
              className="h-32 w-full resize-none bg-transparent p-3 text-xs leading-relaxed outline-none"
            />
          </div>

          {message ? (
            <div
              className={
                status === "error"
                  ? "mt-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
                  : "mt-3 rounded-2xl border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground"
              }
            >
              <p>{message}</p>
              {bridgeDetail ? <pre className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[11px] opacity-80">{bridgeDetail}</pre> : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-background p-5">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="gap-2 rounded-xl" disabled={status === "sending" || status === "waiting"}>
            {status === "sending" || status === "waiting" ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
            发送到 Codex
          </Button>
        </div>
      </form>
    </div>
  )
}
