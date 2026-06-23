"use client"

import { useState } from "react"
import { ChevronDown, Frame, LayoutTemplate } from "lucide-react"

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
          <LayoutTemplate className="size-3.5" />
          {selectedPreset.label}
          <ChevronDown className={cn("size-3.5 transition-transform", isPresetOpen && "rotate-180")} />
        </Button>

        {isPresetOpen && (
          <div className="absolute left-3 top-10 z-40 w-60 rounded-xl border bg-background p-1.5 shadow-2xl">
            {CANVAS_SIZE_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-muted",
                  preset.id === presetId && "bg-muted"
                )}
                onClick={() => {
                  onPresetChange(preset.id)
                  setIsPresetOpen(false)
                }}
              >
                <Frame className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{preset.label}</span>
                {preset.width && preset.height && preset.group !== "ratio" ? (
                  <span className="text-muted-foreground">
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
