"use client"

import { useEffect, useState } from "react"
import { BorderBeam } from "border-beam"
import { ThinkingOrb, type OrbState } from "thinking-orbs"

import type { Bounds } from "@/lib/canvas/types"

type CanvasGenerationStatusOverlayProps = {
  bounds: Bounds
  label: string
  state?: OrbState
  effect?: "orb" | "border-beam"
}

export function CanvasGenerationStatusOverlay({
  bounds,
  label,
  state = "working",
  effect = "orb",
}: CanvasGenerationStatusOverlayProps) {
  const compact = bounds.w < 220 || bounds.h < 160
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setPaused(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return (
    <div
      className={`canvas-generation-status-overlay ${
        effect === "border-beam" ? "is-border-beam" : ""
      }`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
      }}
      aria-live="polite"
      aria-label={label}
    >
      {effect === "border-beam" && (
        <BorderBeam
          size="md"
          colorVariant="mono"
          staticColors
          strength={1}
          brightness={3}
          saturation={0}
          duration={1.8}
          borderRadius={30}
          className="canvas-generation-status-border-beam"
        >
          <div className="canvas-generation-status-border-beam__surface" />
        </BorderBeam>
      )}
      {effect === "orb" && (
        <div
          className={`canvas-generation-status-overlay__content ${
            compact ? "is-compact" : ""
          }`}
        >
          <ThinkingOrb
            state={state}
            size={compact ? 20 : 64}
            speed={0.4}
            theme="dark"
            paused={paused}
            aria-label={label}
          />
          <span>{label}</span>
        </div>
      )}
    </div>
  )
}
