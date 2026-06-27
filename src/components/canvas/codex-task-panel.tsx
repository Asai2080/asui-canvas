"use client"

import { useState } from "react"
import { Bot, Check, Copy, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { AnnotationFeedbackItem } from "@/lib/canvas/annotations"
import type { ImageVersion } from "@/lib/canvas/types"

type ResolvedCodexCanvasContext = {
  sourceShapeId?: string
  versionId?: string
  sourceImageSrc?: string
  referenceImageSrc?: string
  feedbackItems?: AnnotationFeedbackItem[]
}

type CodexTaskPanelProps = {
  selectedShapeIds: string[]
  annotationIds: string[]
  prompt: string
  width: number
  height: number
  resolveCanvasContext: () => Promise<ResolvedCodexCanvasContext>
  onInsertResult: (version: ImageVersion) => Promise<void>
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
  onClose,
}: CodexTaskPanelProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [threadId, setThreadId] = useState("")
  const inferredType = "image-generation"
  const inferredTitle = "生图/改图任务"
  const inferredInstruction =
    annotationIds.length > 1
      ? "根据当前画布选区和多个标注，统一生成一版修改结果。"
      : annotationIds.length === 1
        ? "根据当前画布选区和标注，生成一版修改结果。"
        : "根据当前画布选区、尺寸和提示词生成图片。"
  const codexMessage = [
    "来自阿水画布的任务：",
    inferredInstruction,
    "",
    `当前上下文：${selectedShapeIds.length} 个选中节点，${annotationIds.length} 个标注，尺寸 ${width} × ${height}${
      prompt.trim() ? "，包含当前提示词" : ""
    }。`,
    prompt.trim() ? `提示词：${prompt.trim()}` : "",
    selectedShapeIds.length ? `选中节点：${selectedShapeIds.join(", ")}` : "",
    annotationIds.length ? `标注节点：${annotationIds.join(", ")}` : "",
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

  const waitForTaskResult = async (taskId: string) => {
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
        setMessage(
          `Codex 接收器已接收任务：${payload.file?.relativePath ?? taskId}${
            payload.task.receiver ? `，接收器 ${payload.task.receiver}` : ""
          }。等待 Codex 生成结果，不会调用网页 API 生图。`
        )
        continue
      }
      if (payload.task?.status === "processing") {
        setMessage("Codex 正在处理图片任务，等待生成结果写回。")
        continue
      }
      if (payload.task?.status === "done") {
        if (payload.task.result?.version) {
          await onInsertResult(payload.task.result.version)
          setMessage(payload.task.result.message ?? "Codex 图片任务已完成，结果已插回无限画布。")
        } else {
          setMessage("Codex 图片任务已完成，但没有返回可插入的图片结果。")
        }
        return
      }
      if (payload.task?.status === "failed") {
        setStatus("error")
        setMessage(payload.task.error ?? "Codex 图片任务处理失败。")
        return
      }
    }
    setMessage("任务已发送给 Codex，但还没有检测到生成结果；保持页面打开后可继续等待。")
  }

  const submitTask = async () => {
    setStatus("sending")
    setMessage("")
    setThreadId("")

    try {
      const resolvedContext = await resolveCanvasContext()
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
            ...resolvedContext,
            prompt: prompt || undefined,
            width,
            height,
          },
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        task?: { id?: string }
        file?: { relativePath?: string }
        codex?: { threadId?: string; turnId?: string; visible?: boolean; mode?: string; bridgeError?: string }
        message?: string
        error?: string
      }

      if (!response.ok) {
        const backupText = payload.file?.relativePath ? `；任务已备份到 ${payload.file.relativePath}` : ""
        throw new Error(`${payload.error ?? "Codex Bridge 发送失败"}${backupText}`)
      }

      setStatus("success")
      setThreadId(payload.codex?.threadId ?? "")
      setMessage(
        payload.codex?.threadId
          ? `已创建 Codex 可见会话 ${payload.codex.threadId}${payload.file?.relativePath ? `，并备份到 ${payload.file.relativePath}` : ""}。请在 Codex 会话列表查看“ASUI 画布任务”。`
          : payload.codex?.mode === "queue" && payload.file?.relativePath
            ? `已加入 Codex 本地队列：${payload.file.relativePath}，等待接收器确认。`
          : payload.file?.relativePath
            ? `已写入 ${payload.file.relativePath}，但未返回 Codex threadId。`
            : "任务已发送到 Codex。"
      )
      if (payload.task?.id && !payload.codex?.threadId) {
        void waitForTaskResult(payload.task.id)
      }
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Codex Bridge 发送失败")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="codex-task-title"
      onPointerDown={onClose}
    >
      <form
        className="w-full max-w-lg rounded-3xl border bg-background p-5 shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void submitTask()
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </div>
            <div>
              <h2 id="codex-task-title" className="text-base font-semibold leading-none">
                交给 Codex
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">通过 Codex Bridge 发送当前画布任务</p>
            </div>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="关闭 Codex 任务" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <Separator className="my-5" />

        <div className="rounded-2xl border bg-muted/35 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">自动识别为</span>
            <span className="font-semibold">{inferredTitle}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{inferredInstruction}</p>
        </div>

        <div className="mt-4 rounded-2xl border bg-muted/35 p-3 text-xs text-muted-foreground">
          当前上下文：{selectedShapeIds.length} 个选中节点，{annotationIds.length} 个标注，尺寸 {width} × {height}
          {prompt.trim() ? "，包含当前提示词" : ""}
        </div>

        <div className="mt-4 rounded-2xl border border-dashed bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Bot className="size-3.5" />
            ASUI 画布任务卡片
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            点击确认后，只会发送到 Codex 任务队列，不会走当前网页的 API 生图模型。
          </p>
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
            className="h-36 w-full resize-none bg-transparent p-3 text-xs leading-relaxed outline-none"
          />
        </div>

        {message ? (
          <p className={status === "error" ? "mt-3 text-xs text-destructive" : "mt-3 text-xs text-muted-foreground"}>
            {message}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" className="gap-2 rounded-xl" disabled={status === "sending"}>
            {status === "sending" ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
            发送到 Codex
          </Button>
        </div>
      </form>
    </div>
  )
}
