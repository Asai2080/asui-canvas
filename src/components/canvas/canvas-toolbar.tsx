"use client"

import { useEffect, useState } from "react"
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

type ApiConfigMode = "image" | "video"

export function CanvasApiConfigDialog() {
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configMode, setConfigMode] = useState<ApiConfigMode>("image")
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

  useEffect(() => {
    const handleOpenApiConfig = () => {
      setDraftConfig(readApiConfigFromSession())
      setConfigMessage("")
      setIsConfigOpen(true)
    }
    window.addEventListener("asui:open-api-config", handleOpenApiConfig)
    return () =>
      window.removeEventListener("asui:open-api-config", handleOpenApiConfig)
  }, [])

  const saveConfig = () => {
    const trimmedBaseUrl = configMode === "image" ? draftConfig.baseUrl.trim() : draftConfig.videoBaseUrl.trim()
    if (trimmedBaseUrl && !/^https?:\/\//.test(trimmedBaseUrl)) {
      setConfigMessage("Base URL 要填接口地址，例如 https://openrouter.ai/api/v1，API Key 请填到下面一栏。")
      return
    }
    saveApiConfigToSession(draftConfig)
    setApiConfig(draftConfig)
    setConfigMessage("")
    setIsConfigOpen(false)
  }

  const removeApiConfig = () => {
    clearApiConfig()
    setApiConfig(DEFAULT_API_CONFIG)
    setDraftConfig(DEFAULT_API_CONFIG)
    setConfigMessage("")
  }

  const isImageApiReady = Boolean(apiConfig.baseUrl.trim() && apiConfig.apiKey.trim())
  const isVideoApiReady = Boolean(apiConfig.videoBaseUrl.trim() && apiConfig.videoApiKey.trim())
  const isActiveApiReady = configMode === "image" ? isImageApiReady : isVideoApiReady
  const activeBaseUrlKey = configMode === "image" ? "baseUrl" : "videoBaseUrl"
  const activeApiKeyKey = configMode === "image" ? "apiKey" : "videoApiKey"
  const activeModelKey = configMode === "image" ? "model" : "videoModel"
  const activeApiKey = configMode === "image" ? apiConfig.apiKey : apiConfig.videoApiKey
  const activeTitle = configMode === "image" ? "图片生成" : "视频生成"
  return (
    <>
      {isConfigOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-config-title"
          onPointerDown={() => setIsConfigOpen(false)}
        >
          <form
            className="canvas-modal-surface flex h-[min(550px,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              saveConfig()
            }}
          >
            <div className="shrink-0 px-5 pt-5">
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
                      <p className="mt-1 text-xs text-muted-foreground">图片生成和视频生成分别读取这里</p>
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
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              <div className="api-config-mode-tabs mb-5" role="tablist" aria-label="生成类型">
                <span
                  className={`api-config-mode-tabs__indicator ${
                    configMode === "video" ? "api-config-mode-tabs__indicator--video" : ""
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={configMode === "image"}
                  className={`api-config-mode-tabs__tab ${
                    configMode === "image" ? "api-config-mode-tabs__tab--active" : ""
                  }`}
                  onClick={() => {
                    setConfigMode("image")
                    setConfigMessage("")
                  }}
                >
                  <span>图片生成</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={configMode === "video"}
                  className={`api-config-mode-tabs__tab ${
                    configMode === "video" ? "api-config-mode-tabs__tab--active" : ""
                  }`}
                  onClick={() => {
                    setConfigMode("video")
                    setConfigMessage("")
                  }}
                >
                  <span>视频生成</span>
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="api-base-url">{activeTitle} Base URL</Label>
                  <Input
                    id="api-base-url"
                    value={draftConfig[activeBaseUrlKey]}
                    onChange={(event) => updateDraftConfig(activeBaseUrlKey, event.target.value)}
                    placeholder={configMode === "image" ? "https://openrouter.ai/api/v1" : "https://api.video-provider.com/v1"}
                    className="rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground">这里填接口地址，不填 sk- 开头的 Key。</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-key">{activeTitle} API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={draftConfig[activeApiKeyKey]}
                    onChange={(event) => updateDraftConfig(activeApiKeyKey, event.target.value)}
                    placeholder="sk-..."
                    className="rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    当前 Key：{maskApiKey(activeApiKey)}。仅保存在当前浏览器标签会话中。
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-model">{activeTitle}模型名</Label>
                  <Input
                    id="api-model"
                    value={draftConfig[activeModelKey]}
                    onChange={(event) => updateDraftConfig(activeModelKey, event.target.value)}
                    placeholder={configMode === "image" ? "gpt-image-1" : "kling-v2.1"}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {configMode === "image"
                  ? "说明：图片节点和批注生成会读取图片生成配置；未配置时使用本地演示生成器。"
                  : "说明：视频节点会读取视频生成配置；未配置时先停留在本地占位流程，后续接入真实图生视频接口。"}
                关闭标签页后 Key 自动失效，不会写入 localStorage。
              </div>
              {configMessage ? (
                <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {configMessage}
                </div>
              ) : null}

            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
              {isActiveApiReady ? (
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
