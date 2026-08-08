"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
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
  RulerIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"

import type { Bounds } from "@/lib/canvas/types"
import {
  moveSliceRect,
  resizeSliceRect,
  updateSliceRectField,
  type SliceRectField,
  type SliceResizeHandle,
} from "@/lib/canvas-slicing/candidate-editing"
import type { SliceCandidate, SliceRect } from "@/lib/canvas-slicing/schema"

export type CanvasSlicingPhase =
  | "menu"
  | "detecting"
  | "reviewing"
  | "manual"
  | "export-settings"
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
  onSupplementManual: () => void
  onAddManual: (rect: SliceRect) => void
  onUpdateCandidate: (id: string, rect: SliceRect) => void
  onDeleteCandidate: (id: string) => void
  onToggleCandidate: (id: string) => void
  onToggleCropMode: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
  onOpenExportSettings: () => void
  onCloseExportSettings: () => void
  onExport: () => void
  onCancel: () => void
}

type DragRect = { startX: number; startY: number; x: number; y: number; width: number; height: number }

type CandidateGesture = {
  candidateId: string
  handle?: SliceResizeHandle
  initial: SliceRect
  pointerId: number
  startClientX: number
  startClientY: number
  selectedAtStart: boolean
  selectedDuringDrag: boolean
}

const RESIZE_HANDLES: SliceResizeHandle[] = ["nw", "ne", "sw", "se"]
type GeometryDraft = Record<SliceRectField, string>
type GeometryDraftState = {
  candidateId: string | null
  draft: GeometryDraft | null
}

function geometryDraftFromCandidate(candidate: SliceCandidate): GeometryDraft {
  return {
    x: String(candidate.x),
    y: String(candidate.y),
    width: String(candidate.width),
    height: String(candidate.height),
  }
}

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
  onSupplementManual,
  onAddManual,
  onUpdateCandidate,
  onDeleteCandidate,
  onToggleCandidate,
  onToggleCropMode,
  onSelectAll,
  onClear,
  onOpenExportSettings,
  onCloseExportSettings,
  onExport,
  onCancel,
}: CanvasSlicingOverlayProps) {
  const [drag, setDrag] = useState<DragRect | null>(null)
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null)
  const [geometryOpen, setGeometryOpen] = useState(false)
  const [geometryDraftState, setGeometryDraftState] = useState<GeometryDraftState>({
    candidateId: null,
    draft: null,
  })
  const candidateGestureRef = useRef<CandidateGesture | null>(null)

  const editable = phase === "reviewing" || phase === "manual"
  const activeCandidate = candidates.find((candidate) => candidate.id === activeCandidateId)
  const geometryDraft =
    activeCandidate &&
    geometryDraftState.candidateId === activeCandidate.id &&
    geometryDraftState.draft
      ? geometryDraftState.draft
      : activeCandidate
        ? geometryDraftFromCandidate(activeCandidate)
        : null

  const pointInImage = (event: PointerEvent<HTMLDivElement>) => ({
    x: Math.max(0, Math.min(bounds.w, event.clientX - bounds.x)),
    y: Math.max(0, Math.min(bounds.h, event.clientY - bounds.y)),
  })

  const startManualSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (candidateGestureRef.current || phase !== "manual" || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointInImage(event)
    setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y, width: 0, height: 0 })
  }

  const startCandidateGesture = (
    event: PointerEvent<HTMLElement>,
    candidate: SliceCandidate,
    handle?: SliceResizeHandle
  ) => {
    if (!editable || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveCandidateId(candidate.id)
    setGeometryOpen(true)
    candidateGestureRef.current = {
      candidateId: candidate.id,
      handle,
      initial: {
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
      },
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      selectedAtStart: selectedIds.has(candidate.id),
      selectedDuringDrag: false,
    }
    if (handle && !selectedIds.has(candidate.id)) {
      candidateGestureRef.current.selectedDuringDrag = true
      onToggleCandidate(candidate.id)
    }
  }

  const updateCandidateGesture = (event: PointerEvent<HTMLElement>) => {
    const gesture = candidateGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return false
    event.preventDefault()
    event.stopPropagation()
    const screenDeltaX = event.clientX - gesture.startClientX
    const screenDeltaY = event.clientY - gesture.startClientY
    const deltaX = (screenDeltaX / bounds.w) * sourceWidth
    const deltaY = (screenDeltaY / bounds.h) * sourceHeight
    if (
      !gesture.selectedAtStart &&
      !gesture.selectedDuringDrag &&
      Math.hypot(screenDeltaX, screenDeltaY) >= 3
    ) {
      gesture.selectedDuringDrag = true
      onToggleCandidate(gesture.candidateId)
    }
    onUpdateCandidate(
      gesture.candidateId,
      gesture.handle
        ? resizeSliceRect(
            gesture.initial,
            gesture.handle,
            deltaX,
            deltaY,
            sourceWidth,
            sourceHeight
          )
        : moveSliceRect(
            gesture.initial,
            deltaX,
            deltaY,
            sourceWidth,
            sourceHeight
          )
    )
    return true
  }

  const finishCandidateGesture = (event: PointerEvent<HTMLElement>) => {
    const gesture = candidateGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return false
    event.preventDefault()
    event.stopPropagation()
    const moved = Math.hypot(
      event.clientX - gesture.startClientX,
      event.clientY - gesture.startClientY
    )
    if (!gesture.handle && moved < 3) {
      onToggleCandidate(gesture.candidateId)
    }
    candidateGestureRef.current = null
    return true
  }

  const updateManualSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (updateCandidateGesture(event)) return
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
    if (finishCandidateGesture(event)) return
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

  const cancelPointerInteraction = () => {
    candidateGestureRef.current = null
    setDrag(null)
  }

  const handleCandidateKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    candidate: SliceCandidate
  ) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      onDeleteCandidate(candidate.id)
      setActiveCandidateId(null)
      setGeometryOpen(false)
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onToggleCandidate(candidate.id)
      return
    }
    const step = event.shiftKey ? 10 : 1
    const delta = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }[event.key]
    if (!delta) return
    event.preventDefault()
    onUpdateCandidate(
      candidate.id,
      moveSliceRect(candidate, delta.x, delta.y, sourceWidth, sourceHeight)
    )
  }

  const busy = phase === "detecting" || phase === "exporting"
  const selectionCount = selectedIds.size
  const updateActiveDraft = (field: SliceRectField, value: string) => {
    if (!activeCandidate || !/^\d*$/.test(value)) return
    const currentDraft =
      geometryDraftState.candidateId === activeCandidate.id &&
      geometryDraftState.draft
        ? geometryDraftState.draft
        : geometryDraftFromCandidate(activeCandidate)
    setGeometryDraftState({
      candidateId: activeCandidate.id,
      draft: { ...currentDraft, [field]: value },
    })
  }
  const commitActiveField = (field: SliceRectField) => {
    if (!activeCandidate || !geometryDraft) return
    const rawValue = geometryDraft[field].trim()
    if (!rawValue) {
      setGeometryDraftState({
        candidateId: activeCandidate.id,
        draft: geometryDraftFromCandidate(activeCandidate),
      })
      return
    }
    const nextRect = updateSliceRectField(
      activeCandidate,
      field,
      Number(rawValue),
      sourceWidth,
      sourceHeight
    )
    setGeometryDraftState({
      candidateId: activeCandidate.id,
      draft: geometryDraftFromCandidate({ ...activeCandidate, ...nextRect }),
    })
    onUpdateCandidate(activeCandidate.id, nextRect)
  }

  return (
    <div className="canvas-slicing-layer" aria-label="切图模式">
      <div
        className={`canvas-slicing-image-overlay${phase === "manual" ? " is-manual" : ""}`}
        style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
        onPointerDown={startManualSelection}
        onPointerMove={updateManualSelection}
        onPointerUp={finishManualSelection}
        onPointerCancel={cancelPointerInteraction}
      >
        {candidates.map((candidate, index) => {
          const selected = selectedIds.has(candidate.id)
          const active = activeCandidateId === candidate.id
          return (
            <div
              key={candidate.id}
              className={`canvas-slicing-candidate${selected ? " is-selected" : ""}${active ? " is-active" : ""}${!candidate.recommended ? " is-skipped" : ""}`}
              style={candidateStyle(candidate, sourceWidth, sourceHeight)}
              aria-label={`${candidate.name}，可拖动并缩放`}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => startCandidateGesture(event, candidate)}
              onPointerMove={updateCandidateGesture}
              onPointerUp={finishCandidateGesture}
              onPointerCancel={cancelPointerInteraction}
              onKeyDown={(event) => handleCandidateKeyDown(event, candidate)}
            >
              <span>{index + 1}</span>
              <small>{candidate.recommended ? "建议切出" : "建议跳过"} · {candidate.elementType}</small>
              {candidate.reason && <em>{candidate.reason}</em>}
              {active && editable && (
                <>
                  {RESIZE_HANDLES.map((handle) => (
                    <i
                      key={handle}
                      className={`canvas-slicing-candidate__handle is-${handle}`}
                      aria-hidden="true"
                      onPointerDown={(event) =>
                        startCandidateGesture(event, candidate, handle)
                      }
                    />
                  ))}
                  <button
                    type="button"
                    className="canvas-slicing-candidate__delete"
                    title="删除切图框"
                    aria-label={`删除 ${candidate.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteCandidate(candidate.id)
                      setActiveCandidateId(null)
                      setGeometryOpen(false)
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
                  </button>
                </>
              )}
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

      {phase === "export-settings" && candidates.length > 0 && (
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
            {phase === "reviewing" && (
              <button type="button" onClick={onSupplementManual}>
                <HugeiconsIcon icon={CursorRectangleSelection01Icon} size={16} strokeWidth={1.7} />
                补充框选
              </button>
            )}
            <button
              type="button"
              aria-pressed={geometryOpen}
              disabled={!activeCandidate}
              title={activeCandidate ? "输入位置和尺寸" : "请先选择一个切图框"}
              onClick={() => setGeometryOpen((current) => !current)}
            >
              <HugeiconsIcon icon={RulerIcon} size={16} strokeWidth={1.7} />
              尺寸
            </button>
            <button type="button" className="is-icon" title="全选" aria-label="全选" onClick={onSelectAll}>
              <HugeiconsIcon icon={CursorAddSelection01Icon} size={16} strokeWidth={1.7} />
            </button>
            <button type="button" className="is-icon" title="清空" aria-label="清空" onClick={onClear}>
              <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.7} />
            </button>
            <button type="button" className="is-primary" disabled={selectionCount === 0} onClick={onOpenExportSettings}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.7} />
              完成切图
            </button>
          </>
        )}

        {phase === "export-settings" && (
          <>
            <div className="canvas-slicing-controls__count">已选 {selectionCount} 项</div>
            <button type="button" className="is-icon" title="返回选择" aria-label="返回选择" onClick={onCloseExportSettings}>
              <HugeiconsIcon icon={CursorRectangleSelection01Icon} size={16} strokeWidth={1.7} />
            </button>
            <button type="button" className="is-primary" disabled={selectionCount === 0} onClick={onExport}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.7} />
              开始导出
            </button>
          </>
        )}

        {(phase === "reviewing" || phase === "manual") && (
          <button type="button" className="is-icon" title="导出设置" aria-label="导出设置" onClick={onOpenExportSettings}>
            <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.7} />
          </button>
        )}

        <button type="button" className="is-icon" title="退出切图" aria-label="退出切图" onClick={onCancel}>
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.7} />
        </button>
      </div>

      {editable && activeCandidate && geometryOpen && (
        <div
          className="canvas-slicing-geometry"
          style={{
            left: Math.max(16, bounds.x + bounds.w / 2),
            top: Math.max(60, bounds.y - 12),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {([
            ["x", "X"],
            ["y", "Y"],
            ["width", "W"],
            ["height", "H"],
          ] as const).map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={geometryDraft?.[field] ?? String(activeCandidate[field])}
                aria-label={`${activeCandidate.name} ${label}`}
                onChange={(event) => updateActiveDraft(field, event.target.value)}
                onBlur={() => commitActiveField(field)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setGeometryDraftState({
                      candidateId: activeCandidate.id,
                      draft: geometryDraftFromCandidate(activeCandidate),
                    })
                  }
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
