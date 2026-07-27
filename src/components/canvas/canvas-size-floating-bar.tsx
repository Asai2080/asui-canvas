"use client"

import { useEffect, useRef, useState, type FocusEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AiEraserIcon,
  AspectRatioIcon,
  ArrowDown01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  CANVAS_SIZE_PRESETS,
  type CanvasSizePresetId,
  getCanvasSizePreset,
  resolveCanvasSizePreset,
} from "@/lib/canvas/size-presets"
import { resolveDraftCanvasSize, sanitizeCanvasSizeInput } from "@/lib/canvas/size"
import type { CanvasSize } from "@/lib/canvas/types"
import { cn } from "@/lib/utils"

type CanvasSizeFloatingBarProps = {
  x: number
  y: number
  size: CanvasSize
  presetId: CanvasSizePresetId
  onPresetChange: (presetId: CanvasSizePresetId) => void
  onSizeChange: (size: CanvasSize) => void
  showCutout?: boolean
  isCuttingOut?: boolean
  onCutout?: () => void
}

export function CanvasSizeFloatingBar({
  x,
  y,
  size,
  presetId,
  onPresetChange,
  onSizeChange,
  showCutout = false,
  isCuttingOut = false,
  onCutout,
}: CanvasSizeFloatingBarProps) {
  const reduceMotion = useReducedMotion()
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [draftSize, setDraftSize] = useState({ width: String(size.width), height: String(size.height) })
  const selectedPreset = getCanvasSizePreset(presetId)

  useEffect(
    () => () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current)
      }
    },
    []
  )

  const expand = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
    setIsExpanded(true)
  }

  const collapse = () => {
    if (isPresetOpen) return

    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
    }
    collapseTimerRef.current = setTimeout(() => setIsExpanded(false), 120)
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      collapse()
    }
  }

  const commitDraftSize = () => {
    onSizeChange(resolveDraftCanvasSize(draftSize, size))
  }

  const updateDraftSize = (nextDraftSize: { width: string; height: string }) => {
    setDraftSize(nextDraftSize)

    if (nextDraftSize.width && nextDraftSize.height) {
      onSizeChange(resolveDraftCanvasSize(nextDraftSize, size))
    }
  }

  return (
    <motion.div
      layout="size"
      data-canvas-size-bar
      className={cn("canvas-size-floating-bar", isExpanded && "is-expanded")}
      style={{ left: x, top: y }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 460, damping: 34, mass: 0.62 }
      }
      onMouseEnter={expand}
      onMouseLeave={collapse}
      onFocusCapture={expand}
      onBlurCapture={handleBlur}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="relative flex h-9 items-center">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "canvas-size-floating-bar__preset h-8 min-w-8 gap-1.5 rounded-[10px] px-2 text-xs",
            isExpanded && "is-active"
          )}
          aria-expanded={isPresetOpen}
          aria-label={isExpanded ? `选择画布尺寸，当前为${selectedPreset.label}` : "展开画布尺寸"}
          title={isExpanded ? "选择尺寸预设" : `${draftSize.width} × ${draftSize.height}`}
          onClick={() => {
            if (!isExpanded) {
              expand()
              return
            }
            setIsPresetOpen((current) => !current)
          }}
        >
          <HugeiconsIcon icon={AspectRatioIcon} size={15} strokeWidth={1.8} />
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={isExpanded ? "preset" : "size"}
              initial={reduceMotion ? false : { opacity: 0, y: -8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 8, filter: "blur(3px)" }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="whitespace-nowrap"
            >
              {isExpanded ? selectedPreset.label : `${draftSize.width} × ${draftSize.height}`}
            </motion.span>
          </AnimatePresence>
          {isExpanded && (
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={13}
              strokeWidth={1.8}
              className={cn("transition-transform", isPresetOpen && "rotate-180")}
            />
          )}
        </Button>

        {isPresetOpen && (
          <div
            className="absolute left-0 top-10 z-40 w-[176px] rounded-[14px] border bg-popover p-[5px] text-popover-foreground shadow-xl"
            onMouseEnter={expand}
          >
            {CANVAS_SIZE_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="ghost"
                className={cn(
                  "flex h-8 w-full items-center justify-start gap-2 rounded-[8px] px-2 text-left text-[13px] leading-5 text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  preset.id === presetId && "bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground"
                )}
                onClick={() => {
                  const nextSize = resolveCanvasSizePreset(preset.id, size)
                  setDraftSize({ width: String(nextSize.width), height: String(nextSize.height) })
                  onPresetChange(preset.id)
                  setIsPresetOpen(false)
                }}
              >
                <HugeiconsIcon icon={AspectRatioIcon} size={15} strokeWidth={1.8} />
                <span className="font-normal">{preset.label}</span>
                {preset.width && preset.height && preset.group !== "ratio" ? (
                  <span className="text-[13px] font-normal leading-5 opacity-45">
                    {preset.width}*{preset.height}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={reduceMotion ? undefined : { opacity: 0, width: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="flex h-9 items-center overflow-hidden"
          >
            <form
              className="canvas-size-floating-bar__dimensions flex h-9 items-center gap-1.5 border-l px-2"
              onSubmit={(event) => {
                event.preventDefault()
                commitDraftSize()
              }}
            >
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                W
                <Input
                  aria-label="画布宽度"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={draftSize.width}
                  onChange={(event) =>
                    updateDraftSize({ ...draftSize, width: sanitizeCanvasSizeInput(event.target.value) })
                  }
                  onBlur={commitDraftSize}
                  className="h-7 w-[52px] rounded-[9px] border-0 bg-background/55 px-2 text-xs font-medium shadow-none focus-visible:ring-1 focus-visible:ring-primary/65"
                />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                H
                <Input
                  aria-label="画布高度"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={draftSize.height}
                  onChange={(event) =>
                    updateDraftSize({ ...draftSize, height: sanitizeCanvasSizeInput(event.target.value) })
                  }
                  onBlur={commitDraftSize}
                  className="h-7 w-[52px] rounded-[9px] border-0 bg-background/55 px-2 text-xs font-medium shadow-none focus-visible:ring-1 focus-visible:ring-primary/65"
                />
              </label>
            </form>
            {showCutout && (
              <div className="canvas-size-floating-bar__action flex h-9 items-center border-l pl-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 gap-1.5 rounded-[10px] px-2.5 text-xs text-[#b8b8c0] hover:bg-white/[0.07] hover:text-[#f2f2f4]"
                  disabled={isCuttingOut || !onCutout}
                  aria-label={isCuttingOut ? "正在抠图" : "抠图"}
                  title="抠图"
                  onClick={onCutout}
                >
                  <HugeiconsIcon
                    icon={isCuttingOut ? Loading03Icon : AiEraserIcon}
                    size={15}
                    strokeWidth={1.8}
                    className={cn(isCuttingOut && "animate-spin")}
                  />
                  <span>{isCuttingOut ? "抠图中" : "抠图"}</span>
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
