"use client"

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Image01Icon,
  PauseIcon,
  PlayIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons"

export type Canvas3dPreviewSource = {
  shapeId: string
  src: string
}

type Canvas3dPreviewProps = {
  title: string
  sources: Canvas3dPreviewSource[]
  onActivate?: () => void
}

const VIEW_LABELS = ["前侧三分之四", "正侧面", "后侧三分之四", "顶部与结构细节"]
const AUTO_ADVANCE_MS = 2400

export function Canvas3dPreview({
  title,
  sources,
  onActivate,
}: Canvas3dPreviewProps) {
  const dragStartRef = useRef<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [loadedSourceIds, setLoadedSourceIds] = useState<Set<string>>(
    () => new Set()
  )
  const activeIndex =
    sources.length === 0 ? 0 : selectedIndex % sources.length
  const loadedCount = sources.filter((source) =>
    loadedSourceIds.has(source.shapeId)
  ).length

  useEffect(() => {
    if (!autoAdvance || sources.length < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const timer = window.setInterval(() => {
      setSelectedIndex((current) => (current + 1) % sources.length)
    }, AUTO_ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [autoAdvance, sources.length])

  const showPrevious = () => {
    if (sources.length === 0) return
    setSelectedIndex(
      (current) => (current - 1 + sources.length) % sources.length
    )
  }

  const showNext = () => {
    if (sources.length === 0) return
    setSelectedIndex((current) => (current + 1) % sources.length)
  }

  const activeLabel = VIEW_LABELS[activeIndex] ?? `参考视角 ${activeIndex + 1}`
  const displayTitle =
    title === "3D 多视角代理" ? "多视角参考预览" : title

  return (
    <div className="canvas-3d-preview" onPointerDown={onActivate}>
      <div className="canvas-3d-preview__chrome">
        <div className="canvas-3d-preview__title">
          <HugeiconsIcon icon={Image01Icon} size={17} strokeWidth={1.7} />
          <span>{displayTitle}</span>
        </div>
        <span className="canvas-3d-preview__badge">
          多视角参考 · 非 3D 模型
        </span>
      </div>
      <div
        className="canvas-3d-preview__stage"
        aria-label={`${displayTitle}，可左右拖动切换参考视角`}
        onPointerDown={(event) => {
          dragStartRef.current = event.clientX
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={(event) => {
          const start = dragStartRef.current
          dragStartRef.current = null
          if (start === null) return
          const delta = event.clientX - start
          if (Math.abs(delta) < 36) return
          if (delta > 0) showPrevious()
          else showNext()
        }}
        onPointerCancel={() => {
          dragStartRef.current = null
        }}
      >
        {sources.map((source, index) => (
          // Canvas assets may be data URLs, local blobs, or configured remote URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={source.shapeId}
            className="canvas-3d-preview__image"
            src={source.src}
            alt={VIEW_LABELS[index] ?? `参考视角 ${index + 1}`}
            data-active={index === activeIndex}
            draggable={false}
            onLoad={() => {
              setLoadedSourceIds((current) => {
                if (current.has(source.shapeId)) return current
                const next = new Set(current)
                next.add(source.shapeId)
                return next
              })
            }}
          />
        ))}
        {sources.length < 2 && (
          <div className="canvas-3d-preview__empty">
            至少需要 2 张仍在画布中的参考图
          </div>
        )}
        {sources.length > 1 && (
          <div className="canvas-3d-preview__pagination" aria-hidden="true">
            {sources.map((source, index) => (
              <span
                key={source.shapeId}
                data-active={index === activeIndex}
              />
            ))}
          </div>
        )}
      </div>
      <div className="canvas-3d-preview__footer">
        <span>
          {activeLabel} · {loadedCount}/{sources.length} 张参考已加载
        </span>
        <div className="canvas-3d-preview__actions">
          <button
            type="button"
            title="上一视角"
            aria-label="上一视角"
            onClick={(event) => {
              event.stopPropagation()
              showPrevious()
            }}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            title={autoAdvance ? "暂停轮播" : "自动轮播"}
            aria-label={autoAdvance ? "暂停轮播" : "自动轮播"}
            aria-pressed={autoAdvance}
            onClick={(event) => {
              event.stopPropagation()
              setAutoAdvance((current) => !current)
            }}
          >
            <HugeiconsIcon
              icon={autoAdvance ? PauseIcon : PlayIcon}
              size={16}
              strokeWidth={1.8}
            />
          </button>
          <button
            type="button"
            title="下一视角"
            aria-label="下一视角"
            onClick={(event) => {
              event.stopPropagation()
              showNext()
            }}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            title="回到第一视角"
            aria-label="回到第一视角"
            onClick={(event) => {
              event.stopPropagation()
              setSelectedIndex(0)
            }}
          >
            <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
