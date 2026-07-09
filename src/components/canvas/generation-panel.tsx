import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp, LoaderCircle, Plus, Video, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { API_CONFIG_CHANGED_EVENT, readApiConfigFromSession } from "@/lib/canvas/api-config"
import type { CanvasSelection, GenerationStatus, ReferenceImage } from "@/lib/canvas/types"

const MAX_REFERENCE_IMAGES = 20
const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p", "4K"] as const

export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

type GenerationPanelProps = {
  selection: CanvasSelection | null
  mode?: "image" | "video"
  x: number
  y: number
  prompt: string
  status: GenerationStatus
  statusDetail: string
  referenceImages: ReferenceImage[]
  lockedReferenceImages?: ReferenceImage[]
  videoDurationSeconds?: number
  videoResolution?: VideoResolution
  onPromptChange: (value: string) => void
  onReferenceImagesChange: (images: ReferenceImage[]) => void
  onVideoDurationChange?: (value: number) => void
  onVideoResolutionChange?: (value: VideoResolution) => void
  onFill: () => void
}

function CutoutServiceIcon({ className, filled }: { className?: string; filled: boolean }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M24 0v24H0V0zM12.594 23.258l-.012.002-.071.035-.02.004-.014-.004-.071-.036c-.01-.003-.019 0-.024.006l-.004.01-.017.428.005.02.01.013.104.074.015.004.012-.004.104-.074.012-.016.004-.017-.017-.427c-.002-.01-.009-.017-.016-.018m.264-.113-.014.002-.184.093-.01.01-.003.011.018.43.005.012.008.008.201.092c.012.004.023 0 .029-.008l.004-.014-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014-.034.614c0 .012.007.02.017.024l.015-.002.201-.093.01-.008.003-.011.018-.43-.003-.012-.01-.01z"
      />
      <path
        fill="currentColor"
        d={
          filled
            ? "M20 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a1 1 0 1 1 2 0v2.1l4.995-4.994a1.25 1.25 0 0 1 1.768 0l4.065 4.066 1.238-1.238a1.25 1.25 0 0 1 1.768 0L20 15.101V5h-8a1 1 0 1 1 0-2zM5 2a1 1 0 0 1 .898.56l.048.117.13.378a3 3 0 0 0 1.684 1.8l.185.07.378.129a1 1 0 0 1 .117 1.844l-.117.048-.378.13a3 3 0 0 0-1.8 1.684l-.07.185-.129.378a1 1 0 0 1-1.844.117l-.048-.117-.13-.378a3 3 0 0 0-1.684-1.8l-.185-.07-.378-.129a1 1 0 0 1-.117-1.844l.117-.048.378-.13a3 3 0 0 0 1.8-1.684l.07-.185.129-.378A1 1 0 0 1 5 2m10.5 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3"
            : "M20 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a1 1 0 1 1 2 0v2.1l4.995-4.994a1.25 1.25 0 0 1 1.768 0l4.065 4.066 1.238-1.238a1.25 1.25 0 0 1 1.768 0L20 15.101V5h-8a1 1 0 1 1 0-2zM9.879 12.05 4 17.93V19h16v-1.071l-3.05-3.05-.707.707.207.207a1 1 0 0 1-1.414 1.414zM5 2a1 1 0 0 1 .898.56l.048.117.13.378a3 3 0 0 0 1.684 1.8l.185.07.378.129a1 1 0 0 1 .117 1.844l-.117.048-.378.13a3 3 0 0 0-1.8 1.684l-.07.185-.129.378a1 1 0 0 1-1.844.117l-.048-.117-.13-.378a3 3 0 0 0-1.684-1.8l-.185-.07-.378-.129a1 1 0 0 1-.117-1.844l.117-.048.378-.13a3 3 0 0 0 1.8-1.684l.07-.185.129-.378A1 1 0 0 1 5 2m10.5 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M5 5.196A5.004 5.004 0 0 1 4.196 6c.298.236.568.506.804.804.236-.298.506-.568.804-.804A5.004 5.004 0 0 1 5 5.196"
        }
      />
    </svg>
  )
}

export function GenerationPanel({
  selection,
  mode = "image",
  x,
  y,
  prompt,
  status,
  statusDetail,
  referenceImages,
  lockedReferenceImages = [],
  videoDurationSeconds = 4,
  videoResolution = "720p",
  onPromptChange,
  onReferenceImagesChange,
  onVideoDurationChange,
  onVideoResolutionChange,
  onFill,
}: GenerationPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [modelLabel, setModelLabel] = useState("本地生图")
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
  const isVideoMode = mode === "video"
  const visibleReferenceImages = [...lockedReferenceImages, ...referenceImages]
  const serviceText = cutoutService?.running ? "抠图已启用" : "抠图未启动"

  const readReferenceFile = (file: File) =>
    new Promise<ReferenceImage>((resolve, reject) => {
      const mediaType = file.type.startsWith("video/") ? "video" : "image"
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("参考素材读取失败"))
          return
        }

        resolve({
          id: globalThis.crypto.randomUUID(),
          name: file.name,
          src: reader.result,
          mediaType,
          mimeType: file.type,
        })
      }
      reader.onerror = () => reject(reader.error ?? new Error("参考素材读取失败"))
      reader.readAsDataURL(file)
    })

  useEffect(() => {
    const syncApiMode = () => {
      const config = readApiConfigFromSession()
      if (isVideoMode) {
        setModelLabel(config.videoBaseUrl.trim() && config.videoApiKey.trim() ? config.videoModel : "视频未配置")
        return
      }
      setModelLabel(config.baseUrl.trim() && config.apiKey.trim() ? config.model : "本地生图")
    }

    syncApiMode()
    window.addEventListener(API_CONFIG_CHANGED_EVENT, syncApiMode)
    return () => window.removeEventListener(API_CONFIG_CHANGED_EVENT, syncApiMode)
  }, [isVideoMode])

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

  const handleReferenceFiles = async (files: FileList | null) => {
    if (!files?.length) return

    const availableSlots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length - lockedReferenceImages.length)
    if (availableSlots === 0) return

    const acceptedPrefix = isVideoMode ? /^(image|video)\// : /^image\//
    const nextFiles = Array.from(files)
      .filter((file) => acceptedPrefix.test(file.type))
      .slice(0, availableSlots)
    const nextImages = await Promise.all(nextFiles.map(readReferenceFile))
    onReferenceImagesChange([...referenceImages, ...nextImages].slice(0, MAX_REFERENCE_IMAGES))
  }

  const removeReferenceImage = (id: string) => {
    onReferenceImagesChange(referenceImages.filter((image) => image.id !== id))
  }

  return (
    <aside
      className="generation-panel"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="generation-panel-tools-row">
        <input
          ref={fileInputRef}
          type="file"
          accept={isVideoMode ? "image/*,video/*" : "image/*"}
          multiple
          className="hidden"
          onChange={(event) => {
            void handleReferenceFiles(event.target.files)
            event.target.value = ""
          }}
        />
        <button
          type="button"
          className="generation-panel-tool"
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus className="size-5" />
          <span>参考</span>
        </button>
        {visibleReferenceImages.length > 0 && (
          <div className="generation-panel-reference-strip" aria-label="参考图">
            {visibleReferenceImages.map((image, index) => (
              <div className="generation-panel-reference-thumb" key={image.id} title={image.name}>
                {image.mediaType === "video" ? (
                  <>
                    <video src={image.src} muted playsInline preload="metadata" />
                    <span className="generation-panel-reference-type">
                      <Video className="size-3" />
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image.src} alt={`参考图 ${index + 1}`} />
                )}
                <span className="generation-panel-reference-badge">{index + 1}</span>
                {!lockedReferenceImages.some((locked) => locked.id === image.id) && (
                  <button
                    type="button"
                    className="generation-panel-reference-remove"
                    aria-label={`移除参考图 ${index + 1}`}
                    onClick={() => removeReferenceImage(image.id)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="generation-panel-prompt-wrap">
        <Textarea
          id="generation-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={isVideoMode ? "描述图片要如何运动，例如：镜头缓慢推进，人物轻微转头，光影流动" : "可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜"}
          className="generation-panel-prompt field-sizing-fixed"
        />
        {!selectedHolder && !isVideoMode && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            先点击“新建生图节点”，并保持该节点处于选中状态。
          </p>
        )}
        {statusDetail && status !== "error" && !isVideoMode && (
          <p className="generation-panel-status-message bg-muted text-muted-foreground">{statusDetail}</p>
        )}
      </div>

      <div className="generation-panel-footer">
        <div className="generation-panel-bottom-item generation-panel-model-item font-medium">
          <span>{isVideoMode && statusDetail && status !== "error" ? statusDetail : modelLabel}</span>
        </div>
        {isVideoMode && (
          <div className="generation-panel-video-options" aria-label="视频生成参数">
            <label className="generation-panel-video-duration">
              <span>时长</span>
              <input
                type="number"
                min={4}
                max={15}
                value={videoDurationSeconds}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  if (!Number.isFinite(nextValue)) return
                  onVideoDurationChange?.(Math.min(15, Math.max(4, Math.round(nextValue))))
                }}
              />
              <span>秒</span>
            </label>
            <div className="generation-panel-video-resolution" role="group" aria-label="清晰度">
              <span>清晰度</span>
              {VIDEO_RESOLUTIONS.map((resolution) => (
                <button
                  type="button"
                  key={resolution}
                  className={resolution === videoResolution ? "is-active" : ""}
                  onClick={() => onVideoResolutionChange?.(resolution)}
                >
                  {resolution}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isVideoMode && (
          <button
            type="button"
            className="generation-panel-bottom-item"
            disabled={isCutoutServiceBusy}
            onClick={() => void toggleCutoutService()}
            title={cutoutService?.url ? `${serviceText} · ${cutoutService.url}` : serviceText}
          >
            {isCutoutServiceBusy ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <CutoutServiceIcon className="size-5" filled={Boolean(cutoutService?.running)} />
            )}
            <span>{serviceText}</span>
          </button>
        )}
        <Button
          type="button"
          size="icon"
          className="generation-panel-send-button"
          onClick={onFill}
          disabled={(!selectedHolder && !isVideoMode) || !prompt.trim() || isBusy}
          aria-label={isVideoMode ? "生成视频" : "生成图片"}
        >
          {status === "generating" ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </Button>
      </div>
    </aside>
  )
}
