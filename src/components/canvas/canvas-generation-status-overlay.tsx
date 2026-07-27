"use client"

import { useEffect, useState } from "react"
import { ThinkingOrb, type OrbState } from "thinking-orbs"

import { Aurora } from "@/components/canvas/aurora"
import type { Bounds } from "@/lib/canvas/types"

type CanvasGenerationStatusOverlayProps = {
  bounds: Bounds
  label: string
  state?: OrbState
  effect?: "orb" | "aurora"
}

const AURORA_COLOR_STOPS: [string, string, string] = [
  "#7cff67",
  "#B497CF",
  "#5227FF",
]

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
        effect === "aurora" ? "is-aurora" : ""
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
      {effect === "aurora" && (
        <Aurora
          colorStops={AURORA_COLOR_STOPS}
          blend={0.5}
          amplitude={1}
          speed={1}
          paused={paused}
        />
      )}
      <div
        className={`canvas-generation-status-overlay__content ${
          compact ? "is-compact" : ""
        } ${effect === "aurora" ? "is-aurora" : ""}`}
      >
        {effect === "orb" && (
          <ThinkingOrb
            state={state}
            size={compact ? 20 : 64}
            speed={0.4}
            theme="dark"
            paused={paused}
            aria-label={label}
          />
        )}
        <span>{label}</span>
      </div>
    </div>
  )
}
