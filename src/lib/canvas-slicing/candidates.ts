import type {
  SliceAssetType,
  SliceCandidate,
  SliceCropMode,
} from "./schema"

const ASSET_TYPES = new Set<SliceAssetType>([
  "icon",
  "logo",
  "avatar",
  "illustration",
  "banner",
  "decoration",
  "region",
])

const NON_EXTRACTABLE_TYPES = new Set([
  "text",
  "background",
  "button",
  "card",
  "input",
  "system-control",
])

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function safeName(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9\u4e00-\u9fff_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return (normalized || fallback).slice(0, 120)
}

function normalizeAssetType(value: unknown): SliceAssetType {
  const raw = String(value || "").toLowerCase()
  if (ASSET_TYPES.has(raw as SliceAssetType)) return raw as SliceAssetType
  if (/mascot|product|hero|image|graphic/.test(raw)) return "illustration"
  if (/badge|standalone_icon|pill_icon/.test(raw)) return "icon"
  if (/decorative/.test(raw)) return "decoration"
  return "region"
}

function normalizeCropMode(value: unknown): SliceCropMode {
  // Background handling is a user decision made during review. The model
  // must never silently trigger a potentially expensive cutout operation.
  void value
  return "rectangle"
}

export function normalizeSliceCandidate(
  input: Record<string, unknown>,
  index: number,
  imageWidth: number,
  imageHeight: number
): SliceCandidate | null {
  const requestedWidth = Math.round(Number(input.width))
  const requestedHeight = Math.round(Number(input.height))
  if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight)) return null

  const width = clamp(requestedWidth, 8, imageWidth)
  const height = clamp(requestedHeight, 8, imageHeight)
  const x = clamp(Math.round(Number(input.x) || 0), 0, Math.max(0, imageWidth - width))
  const y = clamp(Math.round(Number(input.y) || 0), 0, Math.max(0, imageHeight - height))
  const confidence = clamp(Number(input.confidence) || 0.5, 0, 1)
  const assetType = normalizeAssetType(input.assetType ?? input.type ?? input.sliceKind)
  const elementType = String(input.elementType ?? input.semanticType ?? input.type ?? "unknown")
    .trim()
    .toLowerCase()
  const decision = input.decision === "skip" || input.recommended === false || NON_EXTRACTABLE_TYPES.has(elementType)
    ? "skip"
    : "extract"
  const fallbackName = `slice-${String(index + 1).padStart(2, "0")}`

  return {
    id: safeName(input.id, `candidate-${String(index + 1).padStart(3, "0")}`),
    name: safeName(input.name, fallbackName),
    assetType,
    elementType: [
      "icon", "logo", "avatar", "product", "illustration", "banner", "decoration",
      "text", "background", "button", "card", "input", "system-control", "unknown",
    ].includes(elementType) ? elementType as SliceCandidate["elementType"] : "unknown",
    decision,
    cropMode: normalizeCropMode(input.cropMode),
    x,
    y,
    width,
    height,
    confidence,
    recommended: decision === "extract" && confidence >= 0.5,
    reason: input.reason ? String(input.reason).slice(0, 240) : undefined,
  }
}

function intersectionArea(left: SliceCandidate, right: SliceCandidate) {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - x)
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - y)
  return width * height
}

function shouldMerge(left: SliceCandidate, right: SliceCandidate) {
  // A text/background exclusion can overlap a real image asset. Keep both so
  // the review UI can explain the exclusion instead of hiding the asset.
  if (left.recommended !== right.recommended) return false
  const intersection = intersectionArea(left, right)
  if (intersection === 0) return false
  const leftArea = left.width * left.height
  const rightArea = right.width * right.height
  const containment = intersection / Math.min(leftArea, rightArea)
  const union = leftArea + rightArea - intersection
  return containment >= 0.82 || intersection / union >= 0.68
}

export function dedupeSliceCandidates(candidates: SliceCandidate[]) {
  const sorted = [...candidates].sort((left, right) => Number(right.recommended) - Number(left.recommended) || right.confidence - left.confidence)
  const result: SliceCandidate[] = []

  for (const candidate of sorted) {
    const duplicateIndex = result.findIndex((existing) => shouldMerge(existing, candidate))
    if (duplicateIndex < 0) {
      result.push(candidate)
      continue
    }

    const existing = result[duplicateIndex]
    if (candidate.confidence > existing.confidence) result[duplicateIndex] = candidate
  }

  return result
}

export function normalizeSliceCandidates(
  inputs: Array<Record<string, unknown>>,
  imageWidth: number,
  imageHeight: number,
  limit = 48
) {
  const imageArea = imageWidth * imageHeight
  const candidates = inputs
    .map((input, index) => normalizeSliceCandidate(input, index, imageWidth, imageHeight))
    .filter((candidate): candidate is SliceCandidate => Boolean(candidate))
    .filter((candidate) => {
      const area = candidate.width * candidate.height
      if (area < 64 || area > imageArea * 0.8) return false
      if (candidate.confidence < 0.45) return false
      return true
    })

  return dedupeSliceCandidates(candidates).slice(0, limit).map((candidate, index) => ({
    ...candidate,
    id: `candidate-${String(index + 1).padStart(3, "0")}`,
  }))
}

export function buildSliceCandidatePrompt(width: number, height: number, detectorHints = "") {
  return [
    "你是专业的视觉资产拆解与切图审核助手，不是 OCR 工具，也不是把所有可见区域都框出来的检测器。",
    "先判断图片类型（UI 截图、海报、社交卡片、电商图、产品图、插画或混合构图），再按从整体到局部的顺序盘点视觉元素。",
    "只有脱离原图后仍然完整、有明确边界、可被再次设计或复用的视觉资产，才允许 decision=extract。宁可少切，也不要把文字和页面结构栅格化。",
    "建议 extract：图标、Logo、头像、商品图、人物、主视觉插画、吉祥物、Banner 中的独立图片主体、独立装饰图形。",
    "必须 skip：文字、标题、价格、说明文案、纯色或渐变背景、按钮底色、输入框、卡片容器、整张页面、分割线、系统状态栏和通用控件。",
    "不要因为一个元素有边框或颜色就建议切出；只有在脱离原页面后仍然有复用价值、边界完整且不会带走旁边文字时才 extract。",
    "不要返回系统状态栏、电量、WiFi、信号、滑块、开关、复选框、返回箭头等通用 UI 控件。",
    "组合主视觉必须作为一个整体区域，不要拆成内部零件。图标旁的文字和按钮背景不能包含在图标区域中。",
    `原图像素坐标系为 ${width} x ${height}。所有 x、y、width、height 必须使用该像素坐标系。`,
    detectorHints,
    "每个框必须是紧贴元素边界的最小矩形：不带相邻文字、不带按钮底色、不带无意义留白；组合主体作为一个整体，不要拆成零件，也不要把同一资产重复框选。",
    "assetType 只能是 icon、logo、avatar、illustration、banner、decoration、region；elementType 用于表达真实元素类型。skip 项也必须有合法矩形和 reason，但不会默认选中。cropMode 目前统一返回 rectangle。",
    "只输出 JSON，不要 Markdown。",
    '{"isUiDesign":true,"confidence":0.95,"assets":[{"name":"home-icon","assetType":"icon","elementType":"icon","decision":"extract","cropMode":"rectangle","x":42,"y":790,"width":28,"height":28,"confidence":0.92,"reason":"脱离导航文字后仍可作为独立图标复用"},{"name":"hero-title","assetType":"region","elementType":"text","decision":"skip","cropMode":"rectangle","x":80,"y":120,"width":420,"height":64,"confidence":0.98,"reason":"文字内容应保持可编辑，不应栅格化切图"}]}',
  ].join("\n")
}
