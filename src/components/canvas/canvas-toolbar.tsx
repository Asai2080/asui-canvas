"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Key01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  maskApiKey,
  readApiConfigFromSession,
  saveApiConfigToSession,
  type ApiConfig,
} from "@/lib/canvas/api-config"

type ApiConfigMode = "text" | "image" | "video"

const CANVAS_AGENT_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED ?? "").trim().toLowerCase()
)

const API_CONFIG_MODES = {
  text: {
    title: "Agent 文字",
    baseUrlKey: "textBaseUrl",
    apiKeyKey: "textApiKey",
    modelKey: "textModel",
    baseUrlPlaceholder: "https://openrouter.ai/api/v1",
    modelPlaceholder: "gpt-4.1-mini",
  },
  image: {
    title: "图片生成",
    baseUrlKey: "baseUrl",
    apiKeyKey: "apiKey",
    modelKey: "model",
    baseUrlPlaceholder: "https://openrouter.ai/api/v1",
    modelPlaceholder: "gpt-image-1",
  },
  video: {
    title: "视频生成",
    baseUrlKey: "videoBaseUrl",
    apiKeyKey: "videoApiKey",
    modelKey: "videoModel",
    baseUrlPlaceholder: "https://api.video-provider.com/v1",
    modelPlaceholder: "kling-v2.1",
  },
} as const satisfies Record<
  ApiConfigMode,
  {
    title: string
    baseUrlKey: keyof ApiConfig
    apiKeyKey: keyof ApiConfig
    modelKey: keyof ApiConfig
    baseUrlPlaceholder: string
    modelPlaceholder: string
  }
>

export function CanvasApiConfigDialog() {
  const agentEnabled = CANVAS_AGENT_ENABLED
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configMode, setConfigMode] = useState<ApiConfigMode>(
    agentEnabled ? "text" : "image"
  )
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
    const activeMode = API_CONFIG_MODES[configMode]
    const trimmedBaseUrl = draftConfig[activeMode.baseUrlKey].trim()
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
    const apiKeyKey = API_CONFIG_MODES[configMode].apiKeyKey
    const nextConfig = { ...apiConfig, [apiKeyKey]: "" }
    saveApiConfigToSession(nextConfig)
    setApiConfig(nextConfig)
    setDraftConfig(nextConfig)
    setConfigMessage("")
  }

  const isImageApiReady = Boolean(apiConfig.baseUrl.trim() && apiConfig.apiKey.trim())
  const isVideoApiReady = Boolean(apiConfig.videoBaseUrl.trim() && apiConfig.videoApiKey.trim())
  const isTextApiReady = Boolean(apiConfig.textBaseUrl.trim() && apiConfig.textApiKey.trim())
  const isActiveApiReady =
    configMode === "text"
      ? isTextApiReady
      : configMode === "image"
        ? isImageApiReady
        : isVideoApiReady
  const activeMode = API_CONFIG_MODES[configMode]
  const activeApiKey = apiConfig[activeMode.apiKeyKey]
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
                      <HugeiconsIcon icon={Key01Icon} size={16} strokeWidth={1.7} />
                    </div>
                    <div>
                      <h2 id="api-config-title" className="text-base font-semibold leading-none">
                        API 配置
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">对话理解、图片和视频分别读取这里</p>
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
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.7} />
                </Button>
              </div>
              <Separator className="my-5" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              <div
                className={`api-config-mode-tabs mb-5 ${agentEnabled ? "is-agent-enabled" : ""}`}
                role="tablist"
                aria-label="生成类型"
              >
                <span
                  className={`api-config-mode-tabs__indicator api-config-mode-tabs__indicator--${configMode}`}
                  aria-hidden="true"
                />
                {agentEnabled ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={configMode === "text"}
                    className={`api-config-mode-tabs__tab ${
                      configMode === "text" ? "api-config-mode-tabs__tab--active" : ""
                    }`}
                    onClick={() => {
                      setConfigMode("text")
                      setConfigMessage("")
                    }}
                  >
                    <span>Agent 对话</span>
                  </button>
                ) : null}
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
                  <Label htmlFor="api-base-url">{activeMode.title} Base URL</Label>
                  <Input
                    id="api-base-url"
                    value={draftConfig[activeMode.baseUrlKey]}
                    onChange={(event) => updateDraftConfig(activeMode.baseUrlKey, event.target.value)}
                    placeholder={activeMode.baseUrlPlaceholder}
                    className="rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground">这里填接口地址，不填 sk- 开头的 Key。</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-key">{activeMode.title} API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={draftConfig[activeMode.apiKeyKey]}
                    onChange={(event) => updateDraftConfig(activeMode.apiKeyKey, event.target.value)}
                    placeholder="sk-..."
                    className="rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    当前 Key：{maskApiKey(activeApiKey)}。仅保存在当前浏览器标签会话中。
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-model">{activeMode.title}模型名</Label>
                  <Input
                    id="api-model"
                    value={draftConfig[activeMode.modelKey]}
                    onChange={(event) => updateDraftConfig(activeMode.modelKey, event.target.value)}
                    placeholder={activeMode.modelPlaceholder}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {configMode === "text"
                  ? "说明：文字模型负责理解目标、结构化规划和对话回复；未配置或失败时自动使用本地规则。界面只展示可审计摘要，不展示隐藏思维链。"
                  : configMode === "image"
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
