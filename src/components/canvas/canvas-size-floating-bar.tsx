"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

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
}

const presetIconClass = (presetId: CanvasSizePresetId) => {
  switch (presetId) {
    case "1:1":
      return "h-4 w-4 rounded-[3px]"
    case "2:3":
      return "h-4 w-3 rounded-[3px]"
    case "3:4":
      return "h-4 w-3 rounded-[3px]"
    case "9:16":
      return "h-4 w-2.5 rounded-[3px]"
    case "3:2":
      return "h-3 w-4 rounded-[3px]"
    case "16:9":
      return "h-2.5 w-4 rounded-[3px]"
    case "a4":
    case "web":
      return "h-3.5 w-4 rounded-[3px] before:absolute before:-left-0.5 before:-top-0.5 before:h-3.5 before:w-4 before:rounded-[3px] before:border before:border-current before:bg-white"
    default:
      return "h-4 w-4 rounded-[3px]"
  }
}

function PresetIcon({ presetId }: { presetId: CanvasSizePresetId }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 border border-current bg-background text-foreground",
        presetIconClass(presetId)
      )}
    />
  )
}

export function CanvasSizeFloatingBar({
  x,
  y,
  size,
  presetId,
  onPresetChange,
  onSizeChange,
}: CanvasSizeFloatingBarProps) {
  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [draftSize, setDraftSize] = useState({ width: String(size.width), height: String(size.height) })
  const selectedPreset = getCanvasSizePreset(presetId)

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
    <div
      data-canvas-size-bar
      className="canvas-size-floating-bar"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="relative flex h-8 items-center gap-1.5 border-r px-2.5">
        <span className="text-xs text-muted-foreground">尺寸：</span>
        <Button
          type="button"
          variant="ghost"
          className="h-6 gap-1 rounded-md px-1.5 text-xs"
          aria-expanded={isPresetOpen}
          onClick={() => setIsPresetOpen((current) => !current)}
        >
          <PresetIcon presetId={selectedPreset.id} />
          {selectedPreset.label}
          <ChevronDown className={cn("size-3 transition-transform", isPresetOpen && "rotate-180")} />
        </Button>

        {isPresetOpen && (
          <div className="absolute left-0 top-8 z-40 w-[166px] rounded-[12px] border border-[rgba(0,0,0,0.07)] bg-white p-[5px]">
            {CANVAS_SIZE_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] leading-5 text-[rgba(0,0,0,0.9)] transition-colors hover:bg-[rgba(0,0,0,0.06)]",
                  preset.id === presetId && "bg-[rgba(0,0,0,0.06)]"
                )}
                onClick={() => {
                  const nextSize = resolveCanvasSizePreset(preset.id, size)
                  setDraftSize({ width: String(nextSize.width), height: String(nextSize.height) })
                  onPresetChange(preset.id)
                  setIsPresetOpen(false)
                }}
              >
                <PresetIcon presetId={preset.id} />
                <span className="font-normal">{preset.label}</span>
                {preset.width && preset.height && preset.group !== "ratio" ? (
                  <span className="text-[13px] font-normal leading-5 text-[rgba(0,0,0,0.3)]">
                    {preset.width}*{preset.height}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="flex h-8 items-center gap-2 px-2.5"
        onSubmit={(event) => {
          event.preventDefault()
          commitDraftSize()
        }}
      >
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          W
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draftSize.width}
            onChange={(event) =>
              updateDraftSize({ ...draftSize, width: sanitizeCanvasSizeInput(event.target.value) })
            }
            onBlur={commitDraftSize}
            className="h-6 w-12 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-0"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          H
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draftSize.height}
            onChange={(event) =>
              updateDraftSize({ ...draftSize, height: sanitizeCanvasSizeInput(event.target.value) })
            }
            onBlur={commitDraftSize}
            className="h-6 w-12 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-0"
          />
        </label>
      </form>
    </div>
  )
}
