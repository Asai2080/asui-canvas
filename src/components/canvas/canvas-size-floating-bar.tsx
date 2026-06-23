"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  CANVAS_SIZE_PRESETS,
  type CanvasSizePresetId,
  getCanvasSizePreset,
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
      return "h-4 w-4 rounded-[4px]"
    case "2:3":
      return "h-5 w-3.5 rounded-[4px]"
    case "9:16":
      return "h-6 w-3 rounded-[4px]"
    case "3:2":
      return "h-3.5 w-5 rounded-[4px]"
    case "16:9":
      return "h-3 w-6 rounded-[4px]"
    case "a4":
    case "web":
      return "h-4 w-5 rounded-[3px] before:absolute before:-left-1 before:-top-1 before:h-4 before:w-5 before:rounded-[3px] before:border before:border-current before:bg-background"
    default:
      return "h-4 w-5 rounded-[3px]"
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

  return (
    <div
      data-canvas-size-bar
      className="canvas-size-floating-bar"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="relative flex h-10 items-center gap-2 border-r px-3">
        <span className="text-sm text-muted-foreground">尺寸：</span>
        <Button
          type="button"
          variant="ghost"
          className="h-8 gap-1.5 rounded-lg px-2 text-sm"
          aria-expanded={isPresetOpen}
          onClick={() => setIsPresetOpen((current) => !current)}
        >
          <PresetIcon presetId={selectedPreset.id} />
          {selectedPreset.label}
          <ChevronDown className={cn("size-3.5 transition-transform", isPresetOpen && "rotate-180")} />
        </Button>

        {isPresetOpen && (
          <div className="absolute left-0 top-10 z-40 w-72 rounded-2xl bg-background p-1.5">
            {CANVAS_SIZE_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-base transition-colors hover:bg-muted",
                  preset.id === presetId && "bg-muted"
                )}
                onClick={() => {
                  onPresetChange(preset.id)
                  setIsPresetOpen(false)
                }}
              >
                <PresetIcon presetId={preset.id} />
                <span className="font-medium">{preset.label}</span>
                {preset.width && preset.height && preset.group !== "ratio" ? (
                  <span className="text-muted-foreground/70">
                    {preset.width}*{preset.height}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="flex h-10 items-center gap-2.5 px-3"
        onSubmit={(event) => {
          event.preventDefault()
          commitDraftSize()
        }}
      >
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          W
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draftSize.width}
            onChange={(event) =>
              setDraftSize((current) => ({ ...current, width: sanitizeCanvasSizeInput(event.target.value) }))
            }
            onBlur={commitDraftSize}
            className="h-8 w-16 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-0"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          H
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draftSize.height}
            onChange={(event) =>
              setDraftSize((current) => ({ ...current, height: sanitizeCanvasSizeInput(event.target.value) }))
            }
            onBlur={commitDraftSize}
            className="h-8 w-16 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-0"
          />
        </label>
      </form>
    </div>
  )
}
