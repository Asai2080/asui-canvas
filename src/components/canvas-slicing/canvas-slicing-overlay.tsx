"use client"

import { useState, type PointerEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkSquare02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  CursorAddSelection01Icon,
  CursorMagicSelection01Icon,
  CursorRectangleSelection01Icon,
  Delete02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

import type { Bounds } from "@/lib/canvas/types"
import type { SliceCandidate, SliceRect } from "@/lib/canvas-slicing/schema"

export type CanvasSlicingPhase =
  | "menu"
  | "detecting"
  | "reviewing"
  | "manual"
  | "exporting"

type CanvasSlicingOverlayProps = {
  bounds: Bounds
  sourceWidth: number
  sourceHeight: number
  phase: CanvasSlicingPhase
  candidates: SliceCandidate[]
  selectedIds: Set<string>
  onAutomatic: () => void
  onManual: () => void
  onAddManual: (rect: SliceRect) => void
  onToggleCandidate: (id: string) => void
  onToggleCropMode: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
  onExport: () => void
  onCancel: () => void
}

type DragRect = { startX: number; startY: number; x: number; y: number; width: number; height: number }

function candidateStyle(candidate: SliceCandidate, sourceWidth: number, sourceHeight: number) {
  return {
    left: `${(candidate.x / sourceWidth) * 100}%`,
    top: `${(candidate.y / sourceHeight) * 100}%`,
    width: `${(candidate.width / sourceWidth) * 100}%`,
    height: `${(candidate.height / sourceHeight) * 100}%`,
  }
}

export function CanvasSlicingOverlay({
  bounds,
  sourceWidth,
  sourceHeight,
  phase,
  candidates,
  selectedIds,
  onAutomatic,
  onManual,
  onAddManual,
  onToggleCandidate,
  onToggleCropMode,
  onSelectAll,
  onClear,
  onExport,
  onCancel,
}: CanvasSlicingOverlayProps) {
  const [drag, setDrag] = useState<DragRect | null>(null)

  const pointInImage = (event: PointerEvent<HTMLDivElement>) => ({
    x: Math.max(0, Math.min(bounds.w, event.clientX - bounds.x)),
    y: Math.max(0, Math.min(bounds.h, event.clientY - bounds.y)),
  })

  const startManualSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "manual" || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointInImage(event)
    setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y, width: 0, height: 0 })
  }

  const updateManualSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || phase !== "manual") return
    event.preventDefault()
    event.stopPropagation()
    const point = pointInImage(event)
    setDrag((current) => current ? {
      ...current,
      x: Math.min(current.startX, point.x),
      y: Math.min(current.startY, point.y),
      width: Math.abs(point.x - current.startX),
      height: Math.abs(point.y - current.startY),
    } : null)
  }

  const finishManualSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || phase !== "manual") return
    event.preventDefault()
    event.stopPropagation()
    if (drag.width >= 6 && drag.height >= 6) {
      onAddManual({
        x: Math.round((drag.x / bounds.w) * sourceWidth),
        y: Math.round((drag.y / bounds.h) * sourceHeight),
        width: Math.max(1, Math.round((drag.width / bounds.w) * sourceWidth)),
        height: Math.max(1, Math.round((drag.height / bounds.h) * sourceHeight)),
      })
    }
    setDrag(null)
  }

  const busy = phase === "detecting" || phase === "exporting"
  const selectionCount = selectedIds.size
  const reviewCandidates = phase === "reviewing" || phase === "manual"

  return (
    <div className="canvas-slicing-layer" aria-label="切图模式">
      <div
        className={`canvas-slicing-image-overlay${phase === "manual" ? " is-manual" : ""}`}
        style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
        onPointerDown={startManualSelection}
        onPointerMove={updateManualSelection}
        onPointerUp={finishManualSelection}
        onPointerCancel={() => setDrag(null)}
      >
        {candidates.map((candidate, index) => {
          const selected = selectedIds.has(candidate.id)
          return (
            <div
              key={candidate.id}
              className={`canvas-slicing-candidate${selected ? " is-selected" : ""}${!candidate.recommended ? " is-skipped" : ""}`}
              style={candidateStyle(candidate, sourceWidth, sourceHeight)}
              aria-label={`${selected ? "取消" : "选择"}${candidate.name}`}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCandidate(candidate.id)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onToggleCandidate(candidate.id)
                }
              }}
            >
              <span>{index + 1}</span>
              <small>{candidate.recommended ? "建议切出" : "建议跳过"} · {candidate.elementType}</small>
              {candidate.reason && <em>{candidate.reason}</em>}
            </div>
          )
        })}
        {drag && (
          <div
            className="canvas-slicing-draft"
            style={{ left: drag.x, top: drag.y, width: drag.width, height: drag.height }}
          />
        )}
      </div>

      {reviewCandidates && candidates.length > 0 && (
        <section
          className="canvas-slicing-review"
          aria-label="切图导出设置"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <strong>切图导出设置</strong>
              <span>默认保留背景，可逐项改为透明 PNG</span>
            </div>
            <span>{selectionCount}/{candidates.length}</span>
          </header>
          <div className="canvas-slicing-review__list">
            {candidates.map((candidate, index) => {
              const selected = selectedIds.has(candidate.id)
              return (
                <div key={candidate.id} className={`canvas-slicing-review__item${selected ? " is-selected" : ""}`}>
                  <button
                    type="button"
                    className="canvas-slicing-review__select"
                    aria-pressed={selected}
                    onClick={() => onToggleCandidate(candidate.id)}
                  >
                    <HugeiconsIcon icon={CheckmarkSquare02Icon} size={17} strokeWidth={1.7} />
                    <span>
                      <strong>{index + 1}. {candidate.name}</strong>
                      <small>{candidate.elementType ?? candidate.assetType}</small>
                    </span>
                  </button>
                  <div className="canvas-slicing-review__modes" role="group" aria-label={`${candidate.name} 背景设置`}>
                    <button
                      type="button"
                      className={candidate.cropMode === "rectangle" ? "is-active" : ""}
                      onClick={() => candidate.cropMode !== "rectangle" && onToggleCropMode(candidate.id)}
                    >
                      保留背景
                    </button>
                    <button
                      type="button"
                      className={candidate.cropMode === "transparent" ? "is-active" : ""}
                      onClick={() => candidate.cropMode !== "transparent" && onToggleCropMode(candidate.id)}
                    >
                      透明 PNG
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div
        className="canvas-slicing-controls"
        style={{
          left: Math.max(16, bounds.x + bounds.w / 2),
          top: Math.max(16, bounds.y - 56),
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {phase === "menu" && (
          <>
            <button type="button" onClick={onAutomatic}>
              <HugeiconsIcon icon={CursorMagicSelection01Icon} size={16} strokeWidth={1.7} />
              一键切图
            </button>
            <button type="button" onClick={onManual}>
              <HugeiconsIcon icon={CursorRectangleSelection01Icon} size={16} strokeWidth={1.7} />
              手动切图
            </button>
          </>
        )}

        {busy && (
          <div className="canvas-slicing-controls__status" role="status">
            <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.7} className="animate-spin" />
            {phase === "detecting" ? "正在识别可切素材" : "正在生成切图"}
          </div>
        )}

        {(phase === "reviewing" || phase === "manual") && (
          <>
            <div className="canvas-slicing-controls__count">已选 {selectionCount} 项</div>
            <button type="button" className="is-icon" title="全选" aria-label="全选" onClick={onSelectAll}>
              <HugeiconsIcon icon={CursorAddSelection01Icon} size={16} strokeWidth={1.7} />
            </button>
            <button type="button" className="is-icon" title="清空" aria-label="清空" onClick={onClear}>
              <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.7} />
            </button>
            <button type="button" className="is-primary" disabled={selectionCount === 0} onClick={onExport}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.7} />
              完成切图
            </button>
          </>
        )}

        <button type="button" className="is-icon" title="退出切图" aria-label="退出切图" onClick={onCancel}>
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}
