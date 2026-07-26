"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"

type Dot = {
  cx: number
  cy: number
  offsetX: number
  offsetY: number
  velocityX: number
  velocityY: number
}

type Rgb = {
  r: number
  g: number
  b: number
}

type CanvasIdleDotGridProps = {
  baseColor?: string
  activeColor?: string
  dotSize?: number
  gap?: number
  proximity?: number
}

function hexToRgb(hex: string): Rgb {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!match) return { r: 63, g: 65, b: 71 }

  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  }
}

export function CanvasIdleDotGrid({
  baseColor = "#3f4147",
  activeColor = "#a3fe44",
  dotSize = 4,
  gap = 18,
  proximity = 96,
}: CanvasIdleDotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const frameRef = useRef<number | null>(null)
  const lastImpulseRef = useRef(0)
  const pointerRef = useRef({ x: -10_000, y: -10_000, inside: false, lastX: 0, lastY: 0, lastTime: 0 })
  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor])
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor])

  const buildGrid = useCallback(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas) return

    const width = Math.max(1, wrapper.clientWidth)
    const height = Math.max(1, wrapper.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    const minimumCell = dotSize + gap
    const cell = Math.max(minimumCell, Math.sqrt((width * height) / 1600))
    const columns = Math.max(1, Math.floor((width + gap) / cell))
    const rows = Math.max(1, Math.floor((height + gap) / cell))
    const gridWidth = columns * cell - gap
    const gridHeight = rows * cell - gap
    const startX = (width - gridWidth) / 2 + dotSize / 2
    const startY = (height - gridHeight) / 2 + dotSize / 2

    dotsRef.current = Array.from({ length: rows * columns }, (_, index) => ({
      cx: startX + (index % columns) * cell,
      cy: startY + Math.floor(index / columns) * cell,
      offsetX: 0,
      offsetY: 0,
      velocityX: 0,
      velocityY: 0,
    }))
  }, [dotSize, gap])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const toLocalPoint = (clientX: number, clientY: number) => {
      const rect = wrapper.getBoundingClientRect()
      const width = Math.max(1, wrapper.clientWidth)
      const height = Math.max(1, wrapper.clientHeight)
      return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * height,
        inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
      }
    }

    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const requestDraw = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(draw)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const point = toLocalPoint(event.clientX, event.clientY)
      const pointer = pointerRef.current
      const now = performance.now()
      const elapsed = Math.max(16, now - (pointer.lastTime || now - 16))
      const velocityX = ((point.x - pointer.lastX) / elapsed) * 1000
      const velocityY = ((point.y - pointer.lastY) / elapsed) * 1000
      const speed = Math.hypot(velocityX, velocityY)

      pointer.x = point.inside ? point.x : -10_000
      pointer.y = point.inside ? point.y : -10_000
      pointer.inside = point.inside
      pointer.lastX = point.x
      pointer.lastY = point.y
      pointer.lastTime = now

      requestDraw()
      if (reducedMotion || !point.inside || speed < 420 || now - lastImpulseRef.current < 42) return
      lastImpulseRef.current = now

      for (const dot of dotsRef.current) {
        const dx = dot.cx - point.x
        const dy = dot.cy - point.y
        const distance = Math.hypot(dx, dy)
        if (distance >= proximity) continue

        const falloff = 1 - distance / proximity
        dot.velocityX += (dx / Math.max(distance, 1)) * 3.2 * falloff + velocityX * 0.0018 * falloff
        dot.velocityY += (dy / Math.max(distance, 1)) * 3.2 * falloff + velocityY * 0.0018 * falloff
      }
      requestDraw()
    }

    const handleClick = (event: MouseEvent) => {
      if (reducedMotion) return
      const point = toLocalPoint(event.clientX, event.clientY)
      if (!point.inside) return

      const radius = proximity * 1.55
      for (const dot of dotsRef.current) {
        const dx = dot.cx - point.x
        const dy = dot.cy - point.y
        const distance = Math.hypot(dx, dy)
        if (distance >= radius) continue

        const falloff = 1 - distance / radius
        const force = 8 * falloff
        dot.velocityX += (dx / Math.max(distance, 1)) * force
        dot.velocityY += (dy / Math.max(distance, 1)) * force
      }
      requestDraw()
    }

    const draw = () => {
      frameRef.current = null
      const context = canvas.getContext("2d")
      if (!context) return

      const width = Math.max(1, wrapper.clientWidth)
      const height = Math.max(1, wrapper.clientHeight)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)

      const pointer = pointerRef.current
      let isMoving = false
      for (const dot of dotsRef.current) {
        if (!reducedMotion) {
          dot.velocityX += -dot.offsetX * 0.075
          dot.velocityY += -dot.offsetY * 0.075
          dot.velocityX *= 0.84
          dot.velocityY *= 0.84
          dot.offsetX += dot.velocityX
          dot.offsetY += dot.velocityY
          isMoving ||= Math.abs(dot.offsetX) > 0.04 || Math.abs(dot.offsetY) > 0.04
        }

        const distance = pointer.inside ? Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y) : proximity
        const intensity = Math.max(0, 1 - distance / proximity)
        const red = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * intensity)
        const green = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * intensity)
        const blue = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * intensity)

        context.beginPath()
        context.arc(dot.cx + dot.offsetX, dot.cy + dot.offsetY, dotSize / 2, 0, Math.PI * 2)
        context.fillStyle = `rgb(${red} ${green} ${blue})`
        context.fill()
      }

      if (!reducedMotion && isMoving) requestDraw()
    }

    const rebuild = () => {
      buildGrid()
      requestDraw()
    }

    rebuild()
    const observer = new ResizeObserver(rebuild)
    observer.observe(wrapper)

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("click", handleClick)

    return () => {
      reducedMotion = true
      observer.disconnect()
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("click", handleClick)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [activeRgb, baseRgb, buildGrid, dotSize, proximity])

  return (
    <div ref={wrapperRef} className="canvas-idle-dot-grid" aria-hidden="true">
      <canvas ref={canvasRef} className="canvas-idle-dot-grid__canvas" />
    </div>
  )
}
