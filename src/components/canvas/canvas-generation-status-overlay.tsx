"use client"

import { useEffect, useState } from "react"
import { ThinkingOrb, type OrbState } from "thinking-orbs"

import type { Bounds } from "@/lib/canvas/types"

type CanvasGenerationStatusOverlayProps = {
  bounds: Bounds
  label: string
  state?: OrbState
  effect?: "orb" | "scan-light"
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
        effect === "scan-light" ? "is-scan-light" : ""
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
      {effect === "scan-light" && (
        <div
          className={`canvas-generation-status-scan-light ${paused ? "is-paused" : ""}`}
          aria-hidden="true"
        />
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
