"use client"

import { useState } from "react"
import { Bot, Check, Copy, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

type CodexTaskPanelProps = {
  selectedShapeIds: string[]
  annotationIds: string[]
  prompt: string
  width: number
  height: number
  onClose: () => void
}

export function CodexTaskPanel({
  selectedShapeIds,
  annotationIds,
  prompt,
  width,
  height,
  onClose,
}: CodexTaskPanelProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const inferredType = annotationIds.length > 0 || prompt.trim() ? "image-generation" : "code-change"
  const inferredTitle = inferredType === "image-generation" ? "生图/改图任务" : "代码/画布协作任务"
  const inferredInstruction =
    inferredType === "image-generation"
      ? annotationIds.length > 1
        ? "根据当前画布选区和多个标注，统一生成一版修改结果。"
        : annotationIds.length === 1
          ? "根据当前画布选区和标注，生成一版修改结果。"
          : "根据当前画布选区、尺寸和提示词生成图片。"
      : "根据当前画布上下文交给 Codex 自动判断并处理代码或产品迭代任务。"
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
    "请根据这些画布上下文自动判断：如果是产品/代码改动，请修改项目；如果是生图/改图任务，请说明需要调用画布生成链路。不要影响已有画布生成路径。",
  ]
    .filter(Boolean)
    .join("\n")

  const copyCodexMessage = async () => {
    try {
      await navigator.clipboard.writeText(codexMessage)
      setStatus("success")
      setMessage("已复制到剪贴板，可以粘贴到 Codex 输入框。")
    } catch {
      setStatus("error")
      setMessage("浏览器没有剪贴板权限，请手动复制下面的任务文案。")
    }
  }

  const submitTask = async () => {
    setStatus("saving")
    setMessage("")

    try {
      const response = await fetch("/api/codex-tasks", {
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
          },
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        file?: { relativePath?: string }
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Codex 任务创建失败")
      }

      setStatus("success")
      try {
        await navigator.clipboard.writeText(codexMessage)
        setMessage(
          payload.file?.relativePath
            ? `已写入 ${payload.file.relativePath}，并复制到剪贴板。`
            : "任务已写入 Codex outbox，并复制到剪贴板。"
        )
      } catch {
        setMessage(
          payload.file?.relativePath
            ? `已写入 ${payload.file.relativePath}。浏览器没有剪贴板权限，请手动复制任务文案。`
            : "任务已写入 Codex outbox。浏览器没有剪贴板权限，请手动复制任务文案。"
        )
      }
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Codex 任务创建失败")
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
              <p className="mt-1 text-xs text-muted-foreground">Codex 会根据当前画布上下文自动识别任务</p>
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

        <div className="mt-4 rounded-2xl border bg-background">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <span className="text-xs font-semibold">将发送给 Codex 的消息</span>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg" onClick={copyCodexMessage}>
              {status === "success" && message.includes("剪贴板") ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              复制
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
          <Button type="submit" className="gap-2 rounded-xl" disabled={status === "saving"}>
            {status === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
            确认交给 Codex
          </Button>
        </div>
      </form>
    </div>
  )
}
