import { normalizeCanvasSize } from "./size"
import type { CanvasSize } from "./types"

export type CanvasSizePresetId = "custom" | "1:1" | "2:3" | "3:4" | "9:16" | "3:2" | "16:9" | "a4" | "web"

export type CanvasSizePreset = {
  id: CanvasSizePresetId
  label: string
  group: "custom" | "ratio" | "document" | "web"
  width?: number
  height?: number
}

export const CANVAS_SIZE_PRESETS: CanvasSizePreset[] = [
  { id: "custom", label: "自定义", group: "custom" },
  { id: "1:1", label: "1:1", group: "ratio", width: 1, height: 1 },
  { id: "2:3", label: "2:3", group: "ratio", width: 2, height: 3 },
  { id: "3:4", label: "3:4", group: "ratio", width: 3, height: 4 },
  { id: "9:16", label: "9:16", group: "ratio", width: 9, height: 16 },
  { id: "3:2", label: "3:2", group: "ratio", width: 3, height: 2 },
  { id: "16:9", label: "16:9", group: "ratio", width: 16, height: 9 },
  { id: "a4", label: "A4", group: "document", width: 1024, height: 1754 },
  { id: "web", label: "网页", group: "web", width: 1366, height: 768 },
]

export function getCanvasSizePreset(id: CanvasSizePresetId) {
  return CANVAS_SIZE_PRESETS.find((preset) => preset.id === id) ?? CANVAS_SIZE_PRESETS[0]
}

export function resolveCanvasSizePreset(id: CanvasSizePresetId, currentSize: CanvasSize): CanvasSize {
  const preset = getCanvasSizePreset(id)

  if (preset.id === "custom" || !preset.width || !preset.height) {
    return normalizeCanvasSize(currentSize)
  }

  if (preset.group !== "ratio") {
    return normalizeCanvasSize({ width: preset.width, height: preset.height })
  }

  const longestEdge = Math.max(currentSize.width, currentSize.height)
  const scale = longestEdge / preset.width

  return normalizeCanvasSize({
    width: preset.width * scale,
    height: preset.height * scale,
  })
}
