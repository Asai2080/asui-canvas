import type { Bounds } from "@/lib/canvas/types"

type CanvasGenerationStatusOverlayProps = {
  bounds: Bounds
  label: string
}

export function CanvasGenerationStatusOverlay({ bounds, label }: CanvasGenerationStatusOverlayProps) {
  return (
    <div
      className="canvas-generation-status-overlay"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
      }}
      aria-live="polite"
      aria-label={label}
    >
      <div className="canvas-generation-status-overlay__field" aria-hidden="true" />
      <div className="canvas-generation-status-overlay__content">
        <span>{label}</span>
      </div>
    </div>
  )
}
