"use client"

import { useState } from "react"
import { Bot, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

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
  const [type, setType] = useState<"code-change" | "image-generation">("image-generation")
  const [instruction, setInstruction] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const submitTask = async () => {
    if (!instruction.trim()) return
    setStatus("saving")
    setMessage("")

    try {
      const response = await fetch("/api/codex-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          instruction,
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
      setMessage(payload.file?.relativePath ? `已写入 ${payload.file.relativePath}` : "任务已写入 Codex outbox")
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
              <p className="mt-1 text-xs text-muted-foreground">记录代码修改或生图协作任务，不影响画布直接生成</p>
            </div>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="关闭 Codex 任务" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <Separator className="my-5" />

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 text-sm">
          <button
            type="button"
            className={type === "image-generation" ? "rounded-xl bg-background py-2 font-medium shadow-sm" : "py-2"}
            onClick={() => setType("image-generation")}
          >
            生图任务
          </button>
          <button
            type="button"
            className={type === "code-change" ? "rounded-xl bg-background py-2 font-medium shadow-sm" : "py-2"}
            onClick={() => setType("code-change")}
          >
            代码任务
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="codex-instruction">任务说明</Label>
          <Textarea
            id="codex-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="描述你希望 Codex 根据当前画布上下文完成什么"
            className="min-h-32 resize-none rounded-2xl"
          />
        </div>

        <div className="mt-4 rounded-2xl border bg-muted/35 p-3 text-xs text-muted-foreground">
          当前上下文：{selectedShapeIds.length} 个选中节点，{annotationIds.length} 个标注，尺寸 {width} × {height}
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
          <Button type="submit" className="gap-2 rounded-xl" disabled={!instruction.trim() || status === "saving"}>
            {status === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
            写入任务
          </Button>
        </div>
      </form>
    </div>
  )
}
