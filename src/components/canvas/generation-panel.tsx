import { useState } from "react"
import { ArrowRight, LoaderCircle, Sparkles, WandSparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { resolveDraftCanvasSize, sanitizeCanvasSizeInput } from "@/lib/canvas/size"
import type { CanvasSelection, CanvasSize, GenerationStatus } from "@/lib/canvas/types"

type GenerationPanelProps = {
  selection: CanvasSelection | null
  holderSize: CanvasSize
  prompt: string
  status: GenerationStatus
  statusDetail: string
  versionCount: number
  onHolderSizeChange: (size: CanvasSize) => void
  onPromptChange: (value: string) => void
  onFill: () => void
}

const statusCopy: Record<GenerationStatus, string> = {
  idle: "等待操作",
  generating: "正在生成",
  editing: "正在根据标注改图",
  success: "新版本已加入画布",
  error: "生成失败，请重试",
}

export function GenerationPanel({
  selection,
  holderSize,
  prompt,
  status,
  statusDetail,
  versionCount,
  onHolderSizeChange,
  onPromptChange,
  onFill,
}: GenerationPanelProps) {
  const isBusy = status === "generating" || status === "editing"
  const selectedHolder = selection?.kind === "holder"
  const selectedImage = selection?.kind === "image"
  const [draftSize, setDraftSize] = useState<{ width: string; height: string } | null>(null)
  const displayedSize = draftSize ?? {
    width: String(holderSize.width),
    height: String(holderSize.height),
  }

  const applyDraftSize = () => {
    onHolderSizeChange(resolveDraftCanvasSize(displayedSize, holderSize))
    setDraftSize(null)
  }

  return (
    <aside className="generation-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <WandSparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">AI 创作面板</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">从生图到区域标注改图</p>
        </div>
        <Badge variant="secondary" className="rounded-full text-[10px]">
          本地演示模型
        </Badge>
      </div>

      <div className="mt-5 rounded-xl border bg-muted/45 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">当前选择</span>
          <span className="font-medium">
            {selectedHolder ? "图片占位节点" : selectedImage ? "已生成图片" : "未选择目标"}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">生成状态</span>
          <span className="flex items-center gap-1.5 font-medium">
            {isBusy && <LoaderCircle className="size-3 animate-spin" />}
            {statusCopy[status]}
          </span>
        </div>
        {statusDetail && (
          <p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
            {statusDetail}
          </p>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <Label>画幅尺寸</Label>
          <Badge variant="outline" className="rounded-full text-[10px]">
            {holderSize.width} × {holderSize.height}
          </Badge>
        </div>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            applyDraftSize()
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="holder-width" className="text-xs text-muted-foreground">
                宽度
              </Label>
              <Input
                id="holder-width"
                inputMode="numeric"
                pattern="[0-9]*"
                value={displayedSize.width}
                onFocus={() => setDraftSize(displayedSize)}
                onChange={(event) => {
                  setDraftSize((current) => ({
                    ...(current ?? displayedSize),
                    width: sanitizeCanvasSizeInput(event.target.value),
                  }))
                }}
                className="rounded-xl bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holder-height" className="text-xs text-muted-foreground">
                高度
              </Label>
              <Input
                id="holder-height"
                inputMode="numeric"
                pattern="[0-9]*"
                value={displayedSize.height}
                onFocus={() => setDraftSize(displayedSize)}
                onChange={(event) => {
                  setDraftSize((current) => ({
                    ...(current ?? displayedSize),
                    height: sanitizeCanvasSizeInput(event.target.value),
                  }))
                }}
                className="rounded-xl bg-background"
              />
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full rounded-xl">
            应用尺寸
          </Button>
        </form>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          输入后按 Enter 或点击“应用尺寸”生效；若当前选中占位框，会同步到画布。
        </p>
      </div>

      <Separator className="my-5" />

      <div className="mt-5 space-y-2">
        <Label htmlFor="generation-prompt">图片提示词</Label>
        <Textarea
          id="generation-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="请填写提示词"
          className="min-h-24 resize-none rounded-xl bg-background"
        />
        <Button
          className="w-full gap-2 rounded-xl"
          onClick={onFill}
          disabled={!selectedHolder || !prompt.trim() || isBusy}
        >
          {status === "generating" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Fill Image Holder
        </Button>
        {!selectedHolder && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            先点击“新建生图节点”，并保持该节点处于选中状态。
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-dashed p-3 text-xs">
        <span className="text-muted-foreground">画布版本</span>
        <span className="flex items-center gap-2 font-medium">
          {versionCount} 个图片节点
          <ArrowRight className="size-3.5" />
        </span>
      </div>
    </aside>
  )
}
