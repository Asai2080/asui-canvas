"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Lottie, { type LottieRefCurrentProps } from "lottie-react"

import loadingAnimationSource from "@/assets/animations/loading-v2.json"

const THEME_GREEN = [163 / 255, 254 / 255, 68 / 255, 1]

function colorizeLottieFills(value: unknown) {
  if (!value || typeof value !== "object") return

  const node = value as Record<string, unknown>
  if (node.ty === "fl") {
    const color = node.c as { k?: unknown } | undefined
    if (color && Array.isArray(color.k)) color.k = [...THEME_GREEN]
  }

  Object.values(node).forEach(colorizeLottieFills)
}

const loadingAnimation = structuredClone(loadingAnimationSource)
colorizeLottieFills(loadingAnimation)

export function ThinkingAnimationIcon({ active }: { active: boolean }) {
  const lottieRef = useRef<LottieRefCurrentProps | null>(null)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setReduceMotion(media.matches)
    updatePreference()
    media.addEventListener("change", updatePreference)
    return () => media.removeEventListener("change", updatePreference)
  }, [])

  const syncPlayback = useCallback(() => {
    if (active && !reduceMotion) {
      lottieRef.current?.setSpeed(1)
      lottieRef.current?.play()
      return
    }

    lottieRef.current?.goToAndStop(20, true)
  }, [active, reduceMotion])

  useEffect(() => {
    syncPlayback()
  }, [syncPlayback])

  return (
    <Lottie
      className="agent-thinking-animation"
      animationData={loadingAnimation}
      autoplay={active && !reduceMotion}
      loop={active && !reduceMotion}
      lottieRef={lottieRef}
      onDOMLoaded={syncPlayback}
      rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
      style={{ width: 18, height: 18, flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}
