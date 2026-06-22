"use client"

import { useState } from "react"
import { ImagePlus, KeyRound, MousePointer2, PenLine, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  clearApiConfig,
  DEFAULT_API_CONFIG,
  maskApiKey,
  readApiConfigFromSession,
  saveApiConfigToSession,
  type ApiConfig,
} from "@/lib/canvas/api-config"
import { IMAGE_VERSION_STORAGE_KEY } from "@/lib/canvas/persistence"

type CanvasToolbarProps = {
  onCreateHolder: () => void
  onCreateAnnotation: () => void
}

export function CanvasToolbar({ onCreateHolder, onCreateAnnotation }: CanvasToolbarProps) {
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [cacheMessage, setCacheMessage] = useState("")
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    return readApiConfigFromSession()
  })
  const [draftConfig, setDraftConfig] = useState<ApiConfig>(() => {
    return readApiConfigFromSession()
  })

  const updateDraftConfig = (key: keyof ApiConfig, value: string) => {
    setDraftConfig((current) => ({ ...current, [key]: value }))
  }

  const openConfig = () => {
    setDraftConfig(apiConfig)
    setIsConfigOpen(true)
  }

  const saveConfig = () => {
    saveApiConfigToSession(draftConfig)
    setApiConfig(draftConfig)
    setCacheMessage("")
    setIsConfigOpen(false)
  }

  const removeApiConfig = () => {
    clearApiConfig()
    setApiConfig(DEFAULT_API_CONFIG)
    setDraftConfig(DEFAULT_API_CONFIG)
    setCacheMessage("")
  }

  const clearLegacyImageCache = () => {
    window.localStorage.removeItem(IMAGE_VERSION_STORAGE_KEY)
    setCacheMessage("已清理旧图片版本缓存，画布内容不会被删除。")
  }

  const isApiReady = Boolean(apiConfig.baseUrl.trim() && apiConfig.apiKey.trim())
  const isDraftApiReady = Boolean(draftConfig.baseUrl.trim() && draftConfig.apiKey.trim())

  return (
    <>
      <div className="canvas-toolbar">
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={openConfig}
          aria-label="打开 API 配置"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">阿水画布</p>
            <p className="mt-1 text-[11px] text-muted-foreground">AI IMAGE WORKSPACE</p>
          </div>
        </button>
        <div className="mx-2 h-8 w-px bg-border" />
        <Button size="sm" onClick={onCreateHolder} className="gap-2 rounded-xl">
          <ImagePlus className="size-4" />
          新建生图节点
        </Button>
        <Button size="sm" variant="outline" onClick={onCreateAnnotation} className="gap-2 rounded-xl">
          <PenLine className="size-4" />
          AI 标注
        </Button>
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <MousePointer2 className="size-3.5" />
          选中图片后点 AI 标注，输入要求后点标注旁“生成”
        </div>
      </div>

      {isConfigOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-config-title"
          onPointerDown={() => setIsConfigOpen(false)}
        >
          <form
            className="w-full max-w-md rounded-3xl border bg-background p-5 shadow-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              saveConfig()
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <KeyRound className="size-4" />
                  </div>
                  <div>
                    <h2 id="api-config-title" className="text-base font-semibold leading-none">
                      API 配置
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">Fill Image Holder 与批注生成会读取这里</p>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="关闭 API 配置"
                onClick={() => setIsConfigOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <Separator className="my-5" />

            <div className="mb-5 grid gap-2 rounded-2xl border bg-muted/35 p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">当前生图模式</span>
                <span className="font-semibold">{isApiReady ? "API 生图" : "本地演示"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">保存后模式</span>
                <span className="font-semibold">{isDraftApiReady ? "API 生图" : "本地演示"}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="api-base-url">Base URL</Label>
                <Input
                  id="api-base-url"
                  value={draftConfig.baseUrl}
                  onChange={(event) => updateDraftConfig("baseUrl", event.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={draftConfig.apiKey}
                  onChange={(event) => updateDraftConfig("apiKey", event.target.value)}
                  placeholder="sk-..."
                  className="rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">
                  当前 Key：{maskApiKey(apiConfig.apiKey)}。仅保存在当前浏览器标签会话中。
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-model">模型名</Label>
                <Input
                  id="api-model"
                  value={draftConfig.model}
                  onChange={(event) => updateDraftConfig("model", event.target.value)}
                  placeholder="gpt-image-1"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              说明：保存 Base URL + API Key 后，Fill Image Holder 和批注旁的生成按钮会调用
              /api/images/generate；未配置时使用本地演示生成器。关闭标签页后 Key 自动失效，不会写入
              localStorage。
            </div>

            <div className="mt-4 rounded-2xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">旧图片缓存</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">只清理历史生成版本缓存，不删除画布节点。</p>
                </div>
                <Button type="button" variant="outline" className="rounded-xl" onClick={clearLegacyImageCache}>
                  清理
                </Button>
              </div>
              {cacheMessage ? <p className="mt-2 text-[11px] text-muted-foreground">{cacheMessage}</p> : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              {isApiReady ? (
                <Button type="button" variant="ghost" className="mr-auto rounded-xl" onClick={removeApiConfig}>
                  清除 API Key
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsConfigOpen(false)}>
                取消
              </Button>
              <Button type="submit" className="rounded-xl">
                保存配置
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
