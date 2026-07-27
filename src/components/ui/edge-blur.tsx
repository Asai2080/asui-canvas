import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

const BLUR_RADII = [0.5, 1, 2, 4, 8, 16]

type EdgeBlurProps = {
  position?: "top" | "bottom"
  height?: number
  className?: string
}

function getLayerMask(position: "top" | "bottom", index: number) {
  const direction = position === "bottom" ? "to bottom" : "to top"
  const layerSize = 100 / BLUR_RADII.length
  const fadeStart = Math.max(0, (index - 1) * layerSize)
  const solidStart = index * layerSize
  const solidEnd = Math.min(100, (index + 1.25) * layerSize)
  const fadeEnd = Math.min(100, (index + 2.25) * layerSize)

  if (index === BLUR_RADII.length - 1) {
    return `linear-gradient(${direction}, transparent ${fadeStart}%, black ${solidStart}%)`
  }

  return `linear-gradient(${direction}, transparent ${fadeStart}%, black ${solidStart}%, black ${solidEnd}%, transparent ${fadeEnd}%)`
}

export function EdgeBlur({
  position = "bottom",
  height = 72,
  className,
}: EdgeBlurProps) {
  return (
    <div
      className={cn("edge-blur", className)}
      data-position={position}
      aria-hidden="true"
      style={{ height }}
    >
      {BLUR_RADII.map((radius, index) => {
        const maskImage = getLayerMask(position, index)
        const style = {
          backdropFilter: `blur(${radius}px)`,
          WebkitBackdropFilter: `blur(${radius}px)`,
          maskImage,
          WebkitMaskImage: maskImage,
        } satisfies CSSProperties

        return <span key={radius} className="edge-blur__layer" style={style} />
      })}
    </div>
  )
}
