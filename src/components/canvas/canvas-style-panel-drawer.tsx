"use client"

import { useEffect, useState } from "react"
import { Palette } from "lucide-react"
import { DefaultStylePanel, type TLUiStylePanelProps } from "tldraw"

import { cn } from "@/lib/utils"

export function CanvasStylePanelDrawer(props: TLUiStylePanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<{
    bottom: number
    left: number
    size: number
  } | null>(null)

  useEffect(() => {
    let animationFrame = 0
    let resizeObserver: ResizeObserver | undefined

    const updatePosition = () => {
      const toolbar = document.querySelector<HTMLElement>(
        ".canvas-surface .tlui-main-toolbar__tools"
      )

      if (!toolbar) {
        animationFrame = window.requestAnimationFrame(updatePosition)
        return
      }

      const rect = toolbar.getBoundingClientRect()
      setPosition({
        bottom: Math.max(8, Math.round(window.innerHeight - rect.bottom)),
        left: Math.round(rect.right + 10),
        size: Math.round(rect.height),
      })

      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(updatePosition)
        resizeObserver.observe(toolbar)
      }
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updatePosition)
    }
  }, [])

  if (props.isMobile) {
    return <DefaultStylePanel {...props} />
  }

  return (
    <div
      className="canvas-style-drawer"
      data-open={isOpen}
      style={position ? { bottom: position.bottom, left: position.left } : undefined}
    >
      <button
        type="button"
        className={cn("canvas-style-drawer__trigger", isOpen && "canvas-style-drawer__trigger--open")}
        aria-label={isOpen ? "收起样式面板" : "展开样式面板"}
        aria-expanded={isOpen}
        title={isOpen ? "收起样式" : "样式"}
        style={position ? { height: position.size, width: position.size } : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Palette className="size-5" aria-hidden="true" />
        <span className="sr-only">样式</span>
      </button>

      <div className="canvas-style-drawer__panel" aria-hidden={!isOpen}>
        <DefaultStylePanel {...props} />
      </div>
    </div>
  )
}
