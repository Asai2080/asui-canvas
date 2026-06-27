"use client"

/* eslint-disable @next/next/no-img-element */

import { useState } from "react"
import { KeyRound, X } from "lucide-react"

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

const toolbarHolderIcon = "https://www.figma.com/api/mcp/asset/417f4ded-c27a-4bf6-b25b-5c7b11e8a4aa"
const toolbarBrandIcon = "https://www.figma.com/api/mcp/asset/22fa355e-41c6-4d96-ab86-14a9e10c1c25"
const toolbarCodexIcon = "https://www.figma.com/api/mcp/asset/8c5a88a0-2640-42a0-a55e-1e47c08bb8e5"

type CanvasToolbarProps = {
  onCreateHolder: () => void
  onOpenCodexTask: () => void
}

export function CanvasToolbar({ onCreateHolder, onOpenCodexTask }: CanvasToolbarProps) {
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [cacheMessage, setCacheMessage] = useState("")
  const [configMessage, setConfigMessage] = useState("")
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    return readApiConfigFromSession()
  })
  const [draftConfig, setDraftConfig] = useState<ApiConfig>(() => {
    return readApiConfigFromSession()
  })

  const updateDraftConfig = (key: keyof ApiConfig, value: string) => {
    setConfigMessage("")
    setDraftConfig((current) => ({ ...current, [key]: value }))
  }

  const openConfig = () => {
    setDraftConfig(apiConfig)
    setConfigMessage("")
    setIsConfigOpen(true)
  }

  const saveConfig = () => {
    const trimmedBaseUrl = draftConfig.baseUrl.trim()
    if (trimmedBaseUrl && !/^https?:\/\//.test(trimmedBaseUrl)) {
      setConfigMessage("Base URL 要填接口地址，例如 https://openrouter.ai/api/v1，API Key 请填到下面一栏。")
      return
    }
    saveApiConfigToSession(draftConfig)
    setApiConfig(draftConfig)
    setCacheMessage("")
    setConfigMessage("")
    setIsConfigOpen(false)
  }

  const removeApiConfig = () => {
    clearApiConfig()
    setApiConfig(DEFAULT_API_CONFIG)
    setDraftConfig(DEFAULT_API_CONFIG)
    setCacheMessage("")
    setConfigMessage("")
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
          className="absolute inset-y-0 left-0 w-[100px] rounded-l-[12px] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
          onClick={openConfig}
          aria-label="打开 API 配置"
        >
          <img src={toolbarBrandIcon} alt="" className="absolute left-4 top-3 size-4" />
          <span className="absolute left-9 top-[11px] whitespace-nowrap text-xs leading-normal text-white">
            阿水画布
          </span>
        </button>
        <div className="absolute left-[100px] top-0 h-10 w-px bg-[#5a5a5a]" />
        <button
          type="button"
          onClick={onCreateHolder}
          className="absolute inset-y-0 left-[101px] w-[124px] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
        >
          <img src={toolbarHolderIcon} alt="" className="absolute left-4 top-3 size-4" />
          <span className="absolute left-9 top-[11px] whitespace-nowrap text-xs leading-normal text-white">
            新增生图节点
          </span>
        </button>
        <div className="absolute left-[225px] top-0 h-10 w-px bg-[#5a5a5a]" />
        <button
          type="button"
          onClick={onOpenCodexTask}
          className="absolute inset-y-0 left-[226px] w-[110px] rounded-r-[12px] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
        >
          <img src={toolbarCodexIcon} alt="" className="absolute left-4 top-3 size-4" />
          <span className="absolute left-9 top-[11px] whitespace-nowrap text-xs leading-normal text-white">
            交给codex
          </span>
        </button>
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
                  placeholder="https://openrouter.ai/api/v1"
                  className="rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">这里填接口地址，不填 sk- 开头的 Key。</p>
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
            {configMessage ? (
              <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {configMessage}
              </div>
            ) : null}

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
