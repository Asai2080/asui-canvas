import { useCallback, useEffect, useState } from "react"
import { ArrowRight, LoaderCircle, Scissors, Sparkles, WandSparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { API_CONFIG_CHANGED_EVENT, readApiConfigFromSession } from "@/lib/canvas/api-config"
import type { CanvasSelection, GenerationStatus } from "@/lib/canvas/types"

type GenerationPanelProps = {
  selection: CanvasSelection | null
  prompt: string
  status: GenerationStatus
  statusDetail: string
  versionCount: number
  onPromptChange: (value: string) => void
  onFill: () => void
}

export function GenerationPanel({
  selection,
  prompt,
  status,
  statusDetail,
  versionCount,
  onPromptChange,
  onFill,
}: GenerationPanelProps) {
  const [isApiReady, setIsApiReady] = useState(false)
  const [cutoutService, setCutoutService] = useState<{
    running: boolean
    managed: boolean
    url: string
    message?: string
    error?: string
  } | null>(null)
  const [isCutoutServiceBusy, setIsCutoutServiceBusy] = useState(false)
  const isBusy = status === "generating" || status === "editing"
  const selectedHolder = selection?.kind === "holder"

  useEffect(() => {
    const syncApiMode = () => {
      const config = readApiConfigFromSession()
      setIsApiReady(Boolean(config.baseUrl.trim() && config.apiKey.trim()))
    }

    syncApiMode()
    window.addEventListener(API_CONFIG_CHANGED_EVENT, syncApiMode)
    return () => window.removeEventListener(API_CONFIG_CHANGED_EVENT, syncApiMode)
  }, [])

  const syncCutoutService = useCallback(async () => {
    const response = await fetch("/api/cutout/service")
    const payload = (await response.json().catch(() => null)) as typeof cutoutService
    setCutoutService(payload)
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void syncCutoutService(), 0)
    const interval = window.setInterval(() => void syncCutoutService(), 5000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [syncCutoutService])

  const toggleCutoutService = async () => {
    setIsCutoutServiceBusy(true)
    try {
      const response = await fetch("/api/cutout/service", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: cutoutService?.running ? "stop" : "start" }),
      })
      const payload = (await response.json().catch(() => null)) as typeof cutoutService
      setCutoutService(
        response.ok
          ? payload
          : {
              running: false,
              managed: false,
              url: cutoutService?.url ?? "",
              error: payload?.error ?? "抠图服务操作失败",
            }
      )
    } finally {
      setIsCutoutServiceBusy(false)
      window.setTimeout(() => void syncCutoutService(), 1200)
    }
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
          {isApiReady ? "API 生图" : "本地演示"}
        </Badge>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="generation-prompt">图片提示词</Label>
        <Textarea
          id="generation-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="请填写提示词"
          className="h-28 field-sizing-fixed resize-none overflow-y-auto rounded-xl bg-background"
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
        {statusDetail && (
          <p className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
            {statusDetail}
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

      <div className="mt-3 rounded-xl border border-dashed p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Scissors className="size-3.5" />
            抠图服务
          </span>
          <Button
            type="button"
            size="sm"
            variant={cutoutService?.running ? "outline" : "secondary"}
            className="h-7 rounded-full px-3 text-xs"
            disabled={isCutoutServiceBusy}
            onClick={() => void toggleCutoutService()}
          >
            {isCutoutServiceBusy ? <LoaderCircle className="size-3 animate-spin" /> : null}
            {cutoutService?.running ? "关闭" : "启动"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {cutoutService?.running ? "BiRefNet HR 已启动" : "BiRefNet HR 未启动"}
          {cutoutService?.url ? ` · ${cutoutService.url}` : ""}
        </p>
        {(cutoutService?.message || cutoutService?.error) && (
          <p
            className={
              cutoutService.error ? "mt-1 text-[11px] text-destructive" : "mt-1 text-[11px] text-muted-foreground"
            }
          >
            {cutoutService.error ?? cutoutService.message}
          </p>
        )}
      </div>
    </aside>
  )
}
