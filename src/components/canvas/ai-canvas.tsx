"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AssetRecordType,
  createShapeId,
  Editor,
  Tldraw,
  TLShape,
  TLShapeId,
  toRichText,
} from "tldraw"
import { LoaderCircle, Scissors, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CanvasSizeFloatingBar } from "@/components/canvas/canvas-size-floating-bar"
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar"
import { CodexTaskPanel } from "@/components/canvas/codex-task-panel"
import { GenerationPanel } from "@/components/canvas/generation-panel"
import {
  buildAnnotationFeedbackItems,
  validateSameAnnotationTarget,
  type AnnotationFeedbackItem,
  type ResolvedAnnotation,
} from "@/lib/canvas/annotations"
import { readApiConfigFromSession } from "@/lib/canvas/api-config"
import { expandBounds, findClearPlacement, intersects, normalizeBounds } from "@/lib/canvas/geometry"
import { CANVAS_PERSISTENCE_KEY, IMAGE_VERSION_STORAGE_KEY } from "@/lib/canvas/persistence"
import { generatePoster } from "@/lib/canvas/poster-generator"
import { resolveCanvasSizePreset, type CanvasSizePresetId } from "@/lib/canvas/size-presets"
import { normalizeCanvasSize } from "@/lib/canvas/size"
import type { Bounds, CanvasSelection, CanvasSize, GenerationStatus, ImageVersion } from "@/lib/canvas/types"

const DEFAULT_HOLDER_SIZE: CanvasSize = { width: 360, height: 480 }
const ANNOTATION_TYPES = new Set(["arrow", "draw", "text", "highlight", "geo"])
const ASUI_META_VERSION = 1
const MAX_REFERENCE_IMAGE_BYTES = 18 * 1024 * 1024
const MAX_REFERENCE_IMAGE_EDGE = 1800
const QIAOMU_FONT_URL = "/fonts/PingFangQiaoMuTi.ttf"
const TLDRAW_ASSET_URLS = {
  fonts: {
    tldraw_draw: QIAOMU_FONT_URL,
    tldraw_draw_bold: QIAOMU_FONT_URL,
    tldraw_draw_italic: QIAOMU_FONT_URL,
    tldraw_draw_italic_bold: QIAOMU_FONT_URL,
  },
}

const shapeMeta = (shape?: TLShape | null) => (shape?.meta ?? {}) as Record<string, unknown>
const isCanvasSizePresetId = (value: unknown): value is CanvasSizePresetId =>
  typeof value === "string" && ["custom", "1:1", "2:3", "3:4", "9:16", "3:2", "16:9", "a4", "web"].includes(value)

const toBounds = (box: { x: number; y: number; w: number; h: number }): Bounds => ({
  x: box.x,
  y: box.y,
  w: box.w,
  h: box.h,
})

function intersectionArea(a: Bounds, b: Bounds) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.w, b.x + b.w)
  const bottom = Math.min(a.y + a.h, b.y + b.h)

  return Math.max(0, right - left) * Math.max(0, bottom - top)
}

function centerDistance(a: Bounds, b: Bounds) {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2

  return Math.hypot(ax - bx, ay - by)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("图片导出失败"))
    }
    reader.onerror = () => reject(reader.error ?? new Error("图片导出失败"))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("圈选区域图片读取失败"))
    image.src = src
  })
}

async function compressReferenceBlob(blob: Blob) {
  if (blob.size <= MAX_REFERENCE_IMAGE_BYTES) return blobToDataUrl(blob)

  const image = await loadImage(URL.createObjectURL(blob))
  try {
    const scale = Math.min(1, MAX_REFERENCE_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("参考图压缩失败")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.82, 0.72, 0.62]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      const estimatedBytes = Math.ceil((dataUrl.length * 3) / 4)
      if (estimatedBytes <= MAX_REFERENCE_IMAGE_BYTES) return dataUrl
    }

    return canvas.toDataURL("image/jpeg", 0.52)
  } finally {
    URL.revokeObjectURL(image.src)
  }
}

async function cropImageRegionToDataUrl(src: string, imageBounds: Bounds, regionBounds: Bounds) {
  const image = await loadImage(src)
  const normalized = normalizeBounds(imageBounds, regionBounds)
  const sourceX = Math.max(0, Math.round(normalized.x * image.naturalWidth))
  const sourceY = Math.max(0, Math.round(normalized.y * image.naturalHeight))
  const sourceWidth = Math.max(1, Math.round(normalized.w * image.naturalWidth))
  const sourceHeight = Math.max(1, Math.round(normalized.h * image.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext("2d")
  if (!context) throw new Error("圈选区域图片裁剪失败")

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)

  return {
    src: canvas.toDataURL("image/png"),
    width: sourceWidth,
    height: sourceHeight,
  }
}

async function exportAnnotatedReferenceImage(editor: Editor, imageId: TLShapeId, annotationIds: TLShapeId[]) {
  const shapeIds = [imageId, ...annotationIds]
  const { blob } = await editor.toImage(shapeIds, {
    format: "png",
    background: true,
    padding: 0,
    pixelRatio: 1.5,
  })

  return compressReferenceBlob(blob)
}

function unionBounds(bounds: Bounds[]) {
  const first = bounds[0]
  if (!first) return null

  const left = Math.min(...bounds.map((bound) => bound.x))
  const top = Math.min(...bounds.map((bound) => bound.y))
  const right = Math.max(...bounds.map((bound) => bound.x + bound.w))
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.h))

  return { x: left, y: top, w: right - left, h: bottom - top }
}

function getRelatedAnnotationIdsForReference(editor: Editor, imageId: TLShapeId, primaryIds: TLShapeId[]) {
  const primaryBounds = primaryIds
    .map((id) => editor.getShapePageBounds(id))
    .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
    .map(toBounds)
  const searchArea = unionBounds(primaryBounds)
  const expandedSearchArea = searchArea ? expandBounds(searchArea, 80) : null
  const ids = new Set<TLShapeId>(primaryIds)

  if (!expandedSearchArea) return Array.from(ids)

  for (const shape of editor.getCurrentPageShapes()) {
    if (!ANNOTATION_TYPES.has(shape.type)) continue
    const target = getGeneratedImageTargetForAnnotation(editor, shape.id as TLShapeId)
    if (!target || target.imageId !== imageId) continue
    const bounds = editor.getShapePageBounds(shape.id)
    if (bounds && intersects(expandedSearchArea, toBounds(bounds))) {
      ids.add(shape.id as TLShapeId)
    }
  }

  return Array.from(ids)
}

function getFeedbackFromAnnotationGroup(editor: Editor, primaryId: TLShapeId, relatedIds: TLShapeId[]) {
  const primaryText = getAnnotationText(editor, primaryId)
  if (primaryText) return primaryText

  const nearbyTexts = relatedIds
    .filter((id) => id !== primaryId)
    .map((id) => getAnnotationText(editor, id))
    .filter(Boolean)

  return nearbyTexts[0] ?? getAnnotationFeedback(editor, primaryId)
}

function getCutoutRegionBounds(editor: Editor, imageId: TLShapeId, annotationId: TLShapeId) {
  const relatedIds = getRelatedAnnotationIdsForReference(editor, imageId, [annotationId])
  const regionBounds = relatedIds
    .filter((id) => !getAnnotationText(editor, id))
    .map((id) => editor.getShapePageBounds(id))
    .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
    .map(toBounds)
  const annotationBounds = editor.getShapePageBounds(annotationId)

  return unionBounds(regionBounds) ?? (annotationBounds ? toBounds(annotationBounds) : null)
}

function classifyAnnotationInstruction(text: string): AnnotationFeedbackItem["taskType"] {
  if (/颜色|色彩|色调|红色|蓝色|绿色|黄色|黑色|白色|紫色|橙色|改红|变红|换色|上色/.test(text)) {
    return "color edit"
  }
  if (/文字|标题|文案|字体|改字|替换文字|改成.*字|改为.*字/.test(text)) {
    return "text replacement"
  }
  if (/改为|修改为|替换为|换成|变成/.test(text)) {
    return "object replacement"
  }
  return "localized edit"
}

function buildUnderstoodAnnotationFeedbackItems(
  editor: Editor,
  imageId: TLShapeId,
  annotations: ResolvedAnnotation[]
): AnnotationFeedbackItem[] {
  const sourceBounds = editor.getShapePageBounds(imageId)
  if (!sourceBounds) return buildAnnotationFeedbackItems(annotations)
  const source = toBounds(sourceBounds)

  return annotations
    .map((annotation, index) => {
      const relatedIds = getRelatedAnnotationIdsForReference(editor, imageId, [annotation.annotationId as TLShapeId])
      const regionBounds = relatedIds
        .filter((id) => id !== annotation.annotationId && !getAnnotationText(editor, id))
        .map((id) => editor.getShapePageBounds(id))
        .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
        .map(toBounds)
      const targetBounds = unionBounds(regionBounds) ?? editor.getShapePageBounds(annotation.annotationId as TLShapeId)
      const normalizedBounds = targetBounds ? normalizeBounds(source, toBounds(targetBounds)) : annotation.bounds
      const label = targetBounds ? getAnnotationLocationLabel(toBounds(targetBounds), source) : annotation.label?.trim() || `标注 ${index + 1}`
      const taskType = classifyAnnotationInstruction(annotation.text)
      const hasExplicitRegion = regionBounds.length > 0

      return {
        label,
        text: annotation.text.trim(),
        bounds: normalizedBounds,
        taskType,
        targetHint: hasExplicitRegion
          ? "目标区域来自用户画出的圈/框/画笔区域，旁边手写文字只是修改指令"
          : "目标区域来自该文字标注所在位置",
      }
    })
    .filter((item) => item.text)
}

function resolveEditRequestSize(source: ImageVersion | undefined, sourceBounds: { w: number; h: number }): CanvasSize {
  const width = source?.width ?? sourceBounds.w
  const height = source?.height ?? sourceBounds.h
  const longEdge = Math.max(width, height)

  if (longEdge >= 1024) {
    return { width, height }
  }

  const scale = 1024 / longEdge
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

function getSelection(editor: Editor): CanvasSelection | null {
  const shape = editor.getOnlySelectedShape()
  if (!shape) return null
  const meta = shapeMeta(shape)

  if (meta.kind === "image-holder" || meta.asuiNode === "image-holder" || shape.type === "frame") {
    return { shapeId: shape.id, kind: "holder" }
  }

  if (shape.type === "image" && (meta.kind === "generated-image" || meta.asuiNode === "generated-image")) {
    return {
      shapeId: shape.id,
      versionId: typeof meta.versionId === "string" ? meta.versionId : undefined,
      kind: "image",
    }
  }

  return { shapeId: shape.id, kind: "other" }
}

function getGeneratedImageTargetForAnnotation(editor: Editor, annotationId: TLShapeId) {
  const annotationShape = editor.getShape(annotationId)
  const annotationMeta = shapeMeta(annotationShape)
  const sourceShapeId =
    typeof annotationMeta.sourceShapeId === "string" ? (annotationMeta.sourceShapeId as TLShapeId) : null

  if (sourceShapeId) {
    const sourceShape = editor.getShape(sourceShapeId)
    const sourceMeta = shapeMeta(sourceShape)
    const annotationBounds = editor.getShapePageBounds(annotationId)
    if (
      sourceShape?.type === "image" &&
      annotationBounds &&
      (sourceMeta.kind === "generated-image" || sourceMeta.asuiNode === "generated-image") &&
      typeof sourceMeta.versionId === "string"
    ) {
      return {
        imageId: sourceShape.id as TLShapeId,
        versionId: sourceMeta.versionId,
        annotationBounds: toBounds(annotationBounds),
      }
    }
  }

  const annotationBounds = editor.getShapePageBounds(annotationId)
  if (!annotationBounds) return null
  const searchArea = expandBounds(toBounds(annotationBounds), 120)

  const imageCandidates = editor
    .getCurrentPageShapes()
    .map((shape) => {
      const meta = shapeMeta(shape)
      if (shape.type !== "image" || (meta.kind !== "generated-image" && meta.asuiNode !== "generated-image")) return null
      const imageBounds = editor.getShapePageBounds(shape.id)
      if (!imageBounds) return null
      const bounds = toBounds(imageBounds)
      if (!intersects(searchArea, bounds)) return null

      return {
        shape,
        bounds,
        overlap: intersectionArea(searchArea, bounds),
        distance: centerDistance(toBounds(annotationBounds), bounds),
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => {
      const overlapDifference = b.overlap - a.overlap
      if (Math.abs(overlapDifference) > 1) return overlapDifference
      return a.distance - b.distance
    })

  const image = imageCandidates[0]?.shape

  if (!image) return null
  const meta = shapeMeta(image)
  const versionId = typeof meta.versionId === "string" ? meta.versionId : undefined
  if (!versionId) return null

  return {
    imageId: image.id as TLShapeId,
    versionId,
    annotationBounds: toBounds(annotationBounds),
  }
}

function getAnnotationText(editor: Editor, annotationId: TLShapeId) {
  const shape = editor.getShape(annotationId)
  if (!shape) return ""

  const text = editor.getShapeUtil(shape).getText(shape)?.trim()
  return text || ""
}

function getAnnotationFeedback(editor: Editor, annotationId: TLShapeId) {
  return getAnnotationText(editor, annotationId) || "根据画布标注区域优化图片"
}

function getAnnotationLocationLabel(annotationBounds: Bounds, sourceBounds: Bounds) {
  const centerX = annotationBounds.x + annotationBounds.w / 2
  const centerY = annotationBounds.y + annotationBounds.h / 2
  const horizontal =
    centerX < sourceBounds.x + sourceBounds.w / 3
      ? "左"
      : centerX > sourceBounds.x + (sourceBounds.w * 2) / 3
        ? "右"
        : "中"
  const vertical =
    centerY < sourceBounds.y + sourceBounds.h / 3
      ? "上"
      : centerY > sourceBounds.y + (sourceBounds.h * 2) / 3
        ? "下"
        : "中"

  if (horizontal === "中" && vertical === "中") return "中间区域"
  if (horizontal === "中") return `${vertical}方区域`
  if (vertical === "中") return `${horizontal}侧区域`
  return `${vertical}${horizontal}区域`
}

function resolveAnnotationForGeneration(editor: Editor, annotationId: TLShapeId): ResolvedAnnotation | null {
  const target = getGeneratedImageTargetForAnnotation(editor, annotationId)
  if (!target) return null
  const sourceBounds = editor.getShapePageBounds(target.imageId)
  if (!sourceBounds) return null

  return {
    annotationId,
    imageId: target.imageId,
    versionId: target.versionId,
    text: getAnnotationText(editor, annotationId),
    label: getAnnotationLocationLabel(target.annotationBounds, toBounds(sourceBounds)),
    bounds: normalizeBounds(toBounds(sourceBounds), target.annotationBounds),
  }
}

function getImageAnnotationsForGeneration(editor: Editor, imageId: TLShapeId) {
  return editor
    .getCurrentPageShapes()
    .filter((shape) => ANNOTATION_TYPES.has(shape.type))
    .map((shape) => resolveAnnotationForGeneration(editor, shape.id as TLShapeId))
    .filter((annotation): annotation is ResolvedAnnotation => {
      return annotation !== null && annotation.imageId === imageId && annotation.text.trim().length > 0
    })
}

const extensionFromSrc = (src: string) => {
  if (src.startsWith("data:image/svg+xml") || src.endsWith(".svg")) return "svg"
  if (src.startsWith("data:image/webp") || src.endsWith(".webp")) return "webp"
  if (src.startsWith("data:image/jpeg") || src.endsWith(".jpg") || src.endsWith(".jpeg")) return "jpg"
  return "png"
}

const mimeFromSrc = (src: string) => {
  if (src.startsWith("data:image/svg+xml") || src.endsWith(".svg")) return "image/svg+xml"
  if (src.startsWith("data:image/webp") || src.endsWith(".webp")) return "image/webp"
  if (src.startsWith("data:image/jpeg") || src.endsWith(".jpg") || src.endsWith(".jpeg")) return "image/jpeg"
  return "image/png"
}

function createImageShape(
  editor: Editor,
  version: ImageVersion,
  bounds: Bounds,
  options: {
    parentId?: TLShapeId
  } = {}
) {
  const assetId = AssetRecordType.createId()
  const shapeId = createShapeId()
  const extension = extensionFromSrc(version.src)

  editor.createAssets([
    {
      id: assetId,
      typeName: "asset",
      type: "image",
      props: {
        w: version.width,
        h: version.height,
        name: `${version.versionId}.${extension}`,
        isAnimated: false,
        mimeType: mimeFromSrc(version.src),
        src: version.src,
      },
      meta: {
        asuiNode: "image-asset",
        asuiMetaVersion: ASUI_META_VERSION,
        versionId: version.versionId,
      },
    },
  ])

  editor.createShape({
    id: shapeId,
    type: "image",
    x: bounds.x,
    y: bounds.y,
    parentId: options.parentId,
    props: {
      w: bounds.w,
      h: bounds.h,
      playing: false,
      url: "",
      assetId,
      crop: null,
      flipX: false,
      flipY: false,
      altText: version.prompt,
    },
    meta: {
      kind: "generated-image",
      asuiNode: "generated-image",
      asuiMetaVersion: ASUI_META_VERSION,
      versionId: version.versionId,
      parentVersionId: version.parentVersionId ?? null,
    },
  })

  return shapeId
}

async function persistImageVersion(version: ImageVersion) {
  const response = await fetch("/api/canvas-assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version }),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    version?: ImageVersion
    error?: string
  }

  if (!response.ok || !payload.version) {
    throw new Error(payload.error ?? "图片资产保存失败")
  }

  return payload.version
}

async function generateImageVersion({
  prompt,
  feedback,
  feedbackItems,
  parentVersionId,
  bounds,
  requestSize,
  sourceImageSrc,
}: {
  prompt: string
  feedback?: string
  feedbackItems?: AnnotationFeedbackItem[]
  parentVersionId?: string
  bounds: Bounds
  requestSize?: CanvasSize
  sourceImageSrc?: string
}) {
  const apiConfig = readApiConfigFromSession()

  if (!apiConfig.baseUrl.trim() || !apiConfig.apiKey.trim()) {
    const localFeedback = feedbackItems?.length
      ? feedbackItems.map((item, index) => `${index + 1}. ${item.label}: ${item.text}`).join("\n")
      : feedback
    return generatePoster({ prompt, feedback: localFeedback, parentVersionId })
  }

  const response = await fetch("/api/images/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...apiConfig,
      prompt,
      feedback,
      feedbackItems,
      parentVersionId,
      sourceImageSrc,
      width: requestSize?.width ?? bounds.w,
      height: requestSize?.height ?? bounds.h,
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    version?: ImageVersion
    error?: string
    debug?: {
      model?: string
      hasSourceImage?: boolean
      promptPreview?: string
      feedbackPreview?: string
    }
  }

  if (!response.ok || !payload.version) {
    const debugHints = payload.debug
      ? [
          `模型：${payload.debug.model ?? "未知"}`,
          `参考图：${payload.debug.hasSourceImage ? "已发送" : "未发送"}`,
          payload.debug.feedbackPreview ? `标注摘要：${payload.debug.feedbackPreview}` : "",
        ]
          .filter(Boolean)
          .join("；")
      : ""
    throw new Error(`${payload.error ?? "图片生成失败"}${debugHints ? `\n诊断：${debugHints}` : ""}`)
  }

  return payload.version
}

async function generateCutoutVersion({
  imageSrc,
  width,
  height,
}: {
  imageSrc: string
  width: number
  height: number
}) {
  const response = await fetch("/api/cutout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageSrc,
      width,
      height,
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    version?: ImageVersion
    error?: string
  }

  if (!response.ok || !payload.version) {
    throw new Error(payload.error ?? "抠图失败")
  }

  return payload.version
}

function getImageShapeSource(editor: Editor, shapeId: TLShapeId) {
  const shape = editor.getShape(shapeId)
  if (!shape || shape.type !== "image") return null

  const assetId = shape.props.assetId
  if (!assetId) return null

  const asset = editor.getAsset(assetId)
  return asset?.type === "image" ? asset.props.src : null
}

export function AiCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const [selection, setSelection] = useState<CanvasSelection | null>(null)
  const [annotationAction, setAnnotationAction] = useState<{
    annotationId: TLShapeId
    imageId: TLShapeId
    versionId: string
    x: number
    y: number
  } | null>(null)
  const [multiAnnotationAction, setMultiAnnotationAction] = useState<{
    imageId: TLShapeId
    versionId: string
    annotations: ResolvedAnnotation[]
    x: number
    y: number
  } | null>(null)
  const [sizeBar, setSizeBar] = useState<{
    x: number
    y: number
    presetId: CanvasSizePresetId
  } | null>(null)
  const [holderSize, setHolderSize] = useState<CanvasSize>(DEFAULT_HOLDER_SIZE)
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([])
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([])
  const [isCodexTaskOpen, setIsCodexTaskOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [status, setStatus] = useState<GenerationStatus>("idle")
  const [statusDetail, setStatusDetail] = useState("")
  const [versions, setVersions] = useState<ImageVersion[]>([])

  useEffect(() => {
    return () => unlistenRef.current?.()
  }, [])

  useEffect(() => {
    const closeSizeBar = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-canvas-size-bar]")) return
      setSizeBar(null)
    }

    window.addEventListener("pointerdown", closeSizeBar, { capture: true })
    return () => window.removeEventListener("pointerdown", closeSizeBar, { capture: true })
  }, [])

  useEffect(() => {
    window.localStorage.removeItem(IMAGE_VERSION_STORAGE_KEY)
  }, [])

  const syncSelection = useCallback((editor: Editor) => {
    const nextSelection = getSelection(editor)
    const nextSelectedShapeIds = editor.getSelectedShapeIds()
    setSelectedShapeIds(nextSelectedShapeIds)
    setSelectedAnnotationIds(
      nextSelectedShapeIds.filter((id) => {
        const shape = editor.getShape(id)
        return Boolean(shape && ANNOTATION_TYPES.has(shape.type))
      })
    )
    setSelection(nextSelection)

    if (nextSelection?.kind === "holder") {
      const bounds = editor.getShapePageBounds(nextSelection.shapeId as TLShapeId)
      if (bounds) {
        const normalizedSize = normalizeCanvasSize({ width: bounds.w, height: bounds.h })
        const shape = editor.getShape(nextSelection.shapeId as TLShapeId)
        const meta = shapeMeta(shape)
        const anchor = editor.pageToViewport({ x: bounds.x, y: bounds.y })
        setHolderSize(normalizedSize)
        setSizeBar({
          x: Math.max(16, anchor.x),
          y: Math.max(16, anchor.y - 64),
          presetId: isCanvasSizePresetId(meta.sizePreset) ? meta.sizePreset : "custom",
        })
      }
    }

    const selectedShape = editor.getOnlySelectedShape()
    const selectedMeta = shapeMeta(selectedShape)

    if (
      selectedShape &&
      ANNOTATION_TYPES.has(selectedShape.type) &&
      selectedMeta.kind !== "image-holder" &&
      selectedMeta.kind !== "version-link"
    ) {
      const target = getGeneratedImageTargetForAnnotation(editor, selectedShape.id as TLShapeId)
      if (target) {
        const anchor = editor.pageToViewport({
          x: target.annotationBounds.x + target.annotationBounds.w,
          y: target.annotationBounds.y,
        })
        setAnnotationAction({
          annotationId: selectedShape.id as TLShapeId,
          imageId: target.imageId,
          versionId: target.versionId,
          x: anchor.x + 8,
          y: anchor.y - 4,
        })
        setMultiAnnotationAction(null)
        return
      }
    }

    setAnnotationAction(null)

    if (
      selectedShape?.type === "image" &&
      (selectedMeta.kind === "generated-image" || selectedMeta.asuiNode === "generated-image") &&
      typeof selectedMeta.versionId === "string"
    ) {
      const annotations = getImageAnnotationsForGeneration(editor, selectedShape.id as TLShapeId)
      const imageBounds = editor.getShapePageBounds(selectedShape.id)
      if (annotations.length >= 2 && imageBounds) {
        const anchor = editor.pageToViewport({ x: imageBounds.x + imageBounds.w, y: imageBounds.y })
        setMultiAnnotationAction({
          imageId: selectedShape.id as TLShapeId,
          versionId: selectedMeta.versionId,
          annotations,
          x: anchor.x + 8,
          y: anchor.y + 36,
        })
        return
      }
    }

    if (nextSelectedShapeIds.length >= 2) {
      const annotations = nextSelectedShapeIds
        .map((id) => resolveAnnotationForGeneration(editor, id as TLShapeId))
        .filter((annotation): annotation is ResolvedAnnotation => Boolean(annotation) && annotation.text.trim().length > 0)
      const target = validateSameAnnotationTarget(annotations)
      if (target && annotations.length >= 2) {
        const firstBounds = editor.getShapePageBounds(annotations[0].annotationId as TLShapeId)
        const anchor = firstBounds ? editor.pageToViewport({ x: firstBounds.x + firstBounds.w, y: firstBounds.y }) : { x: 120, y: 120 }
        setMultiAnnotationAction({
          imageId: target.imageId as TLShapeId,
          versionId: target.versionId,
          annotations,
          x: anchor.x + 8,
          y: anchor.y + 36,
        })
        return
      }
    }

    setMultiAnnotationAction(null)
  }, [])

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      syncSelection(editor)
      unlistenRef.current?.()
      unlistenRef.current = editor.store.listen(() => syncSelection(editor), {
        source: "all",
        scope: "all",
      })
    },
    [syncSelection]
  )

  const updateHolderSize = useCallback(
    (nextSize: CanvasSize, nextPreset: CanvasSizePresetId = "custom") => {
      const normalizedSize = normalizeCanvasSize(nextSize)
      setHolderSize(normalizedSize)

      const editor = editorRef.current
      if (!editor || selection?.kind !== "holder") return

      const holderId = selection.shapeId as TLShapeId
      const holderShape = editor.getShape(holderId)
      if (!holderShape || (holderShape.type !== "frame" && holderShape.type !== "geo")) return

      const bounds = editor.getShapePageBounds(holderId)
      if (!bounds) return

      const nextX = bounds.x + bounds.w / 2 - normalizedSize.width / 2
      const nextY = bounds.y + bounds.h / 2 - normalizedSize.height / 2

      if (holderShape.type === "frame") {
        editor.updateShape({
          id: holderId,
          type: "frame",
          x: nextX,
          y: nextY,
          props: {
            w: normalizedSize.width,
            h: normalizedSize.height,
            name: "AI Image Holder",
          },
          meta: {
            ...holderShape.meta,
            kind: "image-holder",
            asuiNode: "image-holder",
            asuiMetaVersion: ASUI_META_VERSION,
            size: normalizedSize,
            sizePreset: nextPreset,
            layoutMode: "manual",
          },
        })
        return
      }

      editor.updateShape({
        id: holderId,
        type: "geo",
        x: nextX,
        y: nextY,
        props: {
          w: normalizedSize.width,
          h: normalizedSize.height,
        },
        meta: {
          ...holderShape.meta,
          kind: "image-holder",
          asuiNode: "image-holder",
          asuiMetaVersion: ASUI_META_VERSION,
          size: normalizedSize,
          sizePreset: nextPreset,
          layoutMode: "manual",
        },
      })
    },
    [selection]
  )

  const applyHolderPreset = useCallback(
    (presetId: CanvasSizePresetId) => {
      updateHolderSize(resolveCanvasSizePreset(presetId, holderSize), presetId)
    },
    [holderSize, updateHolderSize]
  )

  const createHolder = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const center = editor.getViewportPageBounds().center
    const id = createShapeId()

    editor.createShape({
      id,
      type: "frame",
      x: center.x - holderSize.width / 2,
      y: center.y - holderSize.height / 2,
      props: {
        w: holderSize.width,
        h: holderSize.height,
        name: `AI Image Holder · ${holderSize.width}×${holderSize.height}`,
        color: "blue",
      },
      meta: {
        kind: "image-holder",
        asuiNode: "image-holder",
        asuiMetaVersion: ASUI_META_VERSION,
        size: holderSize,
        sizePreset: "custom",
        layoutMode: "manual",
      },
    })
    editor.select(id)
    editor.zoomToSelection({ animation: { duration: 220 } })
    setStatus("idle")
    setStatusDetail("")
  }, [holderSize])

  const fillHolder = useCallback(async (options: { rethrow?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor || selection?.kind !== "holder") return
    const holderId = selection.shapeId as TLShapeId
    const bounds = editor.getShapePageBounds(holderId)
    if (!bounds) return

    setStatus("generating")
    setStatusDetail("")
    try {
      const imageBounds = toBounds(bounds)
      const version = await persistImageVersion(await generateImageVersion({ prompt, bounds: imageBounds }))
      const holderShape = editor.getShape(holderId)
      const imageId =
        holderShape?.type === "frame"
          ? createImageShape(
              editor,
              version,
              {
                x: 0,
                y: 0,
                w: imageBounds.w,
                h: imageBounds.h,
              },
              { parentId: holderId }
            )
          : createImageShape(editor, version, imageBounds)
      if (holderShape) {
        editor.updateShape({
          id: holderId,
          type: holderShape.type,
          meta: {
            ...holderShape.meta,
            kind: "image-holder",
            asuiNode: "image-holder",
            asuiMetaVersion: ASUI_META_VERSION,
            latestImageShapeId: imageId,
            latestVersionId: version.versionId,
          },
        })
      }
      editor.select(imageId)
      setVersions((current) => [...current, version])
      setStatus("success")
    } catch (error) {
      console.error("Failed to fill image holder", error)
      editor.select(holderId)
      setStatus("error")
      setStatusDetail(error instanceof Error ? error.message : "图片生成失败")
      if (options.rethrow) throw error
    }
  }, [prompt, selection])

  const editFromAnnotation = useCallback(async (options: { rethrow?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor || !annotationAction) return
    const sourceBounds = editor.getShapePageBounds(annotationAction.imageId)
    if (!sourceBounds) return
    const source = versions.find((version) => version.versionId === annotationAction.versionId)

    setStatus("editing")
    setStatusDetail("")
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      const obstacles = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.id !== annotationAction.imageId)
        .map((shape) => editor.getShapePageBounds(shape.id))
        .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
        .map(toBounds)
      const imageBounds = findClearPlacement({
        anchor: toBounds(sourceBounds),
        width: sourceBounds.w,
        height: sourceBounds.h,
        obstacles,
        margin: 190,
      })
      const relatedAnnotationIds = getRelatedAnnotationIdsForReference(editor, annotationAction.imageId, [
        annotationAction.annotationId,
      ])
      const sourceImageSrc =
        (await exportAnnotatedReferenceImage(editor, annotationAction.imageId, relatedAnnotationIds).catch((error) => {
          console.warn("Failed to export annotated reference image", error)
          return null
        })) ??
        source?.src ??
        getImageShapeSource(editor, annotationAction.imageId) ??
        undefined
      const version = await persistImageVersion(await generateImageVersion({
        prompt: source?.prompt ?? prompt,
        feedbackItems: buildUnderstoodAnnotationFeedbackItems(editor, annotationAction.imageId, [
          {
            annotationId: annotationAction.annotationId,
            imageId: annotationAction.imageId,
            versionId: annotationAction.versionId,
            text: getFeedbackFromAnnotationGroup(editor, annotationAction.annotationId, relatedAnnotationIds),
          },
        ]),
        parentVersionId: annotationAction.versionId,
        bounds: imageBounds,
        requestSize: resolveEditRequestSize(source, sourceBounds),
        sourceImageSrc,
      }))
      const imageId = createImageShape(editor, version, imageBounds)
      const arrowId = createShapeId()
      editor.createShape({
        id: arrowId,
        type: "arrow",
        x: sourceBounds.x + sourceBounds.w + 24,
        y: sourceBounds.y + sourceBounds.h / 2,
        props: {
          start: { x: 0, y: 0 },
          end: { x: Math.max(80, imageBounds.x - sourceBounds.x - sourceBounds.w - 48), y: 0 },
          color: "red",
          dash: "dashed",
          size: "m",
          arrowheadEnd: "arrow",
          richText: toRichText("AI 新版本"),
        },
        meta: {
          kind: "version-link",
          asuiNode: "version-link",
          asuiMetaVersion: ASUI_META_VERSION,
          sourceShapeId: annotationAction.imageId,
          targetShapeId: imageId,
        },
      })
      editor.select(imageId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, version])
      setStatus("success")
    } catch (error) {
      console.error("Failed to generate from annotation", error)
      setStatus("error")
      setStatusDetail(error instanceof Error ? error.message : "图片生成失败")
      if (options.rethrow) throw error
    }
  }, [annotationAction, prompt, versions])

  const cutoutFromAnnotation = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || !annotationAction) return
    const sourceBounds = editor.getShapePageBounds(annotationAction.imageId)
    if (!sourceBounds) return
    const sourceImageSrc = getImageShapeSource(editor, annotationAction.imageId)
    const regionBounds = getCutoutRegionBounds(editor, annotationAction.imageId, annotationAction.annotationId)
    if (!sourceImageSrc || !regionBounds) return

    setStatus("editing")
    setStatusDetail("正在抠取圈选区域主体")
    try {
      const cropped = await cropImageRegionToDataUrl(sourceImageSrc, toBounds(sourceBounds), regionBounds)
      const version = await persistImageVersion(
        await generateCutoutVersion({
          imageSrc: cropped.src,
          width: cropped.width,
          height: cropped.height,
        })
      )
      const obstacles = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.id !== annotationAction.imageId)
        .map((shape) => editor.getShapePageBounds(shape.id))
        .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
        .map(toBounds)
      const maxDisplayWidth = 320
      const displayScale = Math.min(1, maxDisplayWidth / Math.max(1, regionBounds.w))
      const imageBounds = findClearPlacement({
        anchor: regionBounds,
        width: Math.max(80, regionBounds.w * displayScale),
        height: Math.max(80, regionBounds.h * displayScale),
        obstacles,
        margin: 80,
      })
      const imageId = createImageShape(editor, version, imageBounds)
      editor.select(imageId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, version])
      setStatus("success")
      setStatusDetail("")
    } catch (error) {
      console.error("Failed to cut out annotation region", error)
      setStatus("error")
      setStatusDetail(error instanceof Error ? error.message : "抠图失败")
    }
  }, [annotationAction])

  const editFromAllAnnotations = useCallback(async (options: { rethrow?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor || !multiAnnotationAction) return
    const sourceBounds = editor.getShapePageBounds(multiAnnotationAction.imageId)
    if (!sourceBounds) return
    const source = versions.find((version) => version.versionId === multiAnnotationAction.versionId)

    setStatus("editing")
    setStatusDetail("")
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      const obstacles = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.id !== multiAnnotationAction.imageId)
        .map((shape) => editor.getShapePageBounds(shape.id))
        .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
        .map(toBounds)
      const imageBounds = findClearPlacement({
        anchor: toBounds(sourceBounds),
        width: sourceBounds.w,
        height: sourceBounds.h,
        obstacles,
        margin: 190,
      })
      const relatedAnnotationIds = getRelatedAnnotationIdsForReference(
        editor,
        multiAnnotationAction.imageId,
        multiAnnotationAction.annotations.map((annotation) => annotation.annotationId as TLShapeId)
      )
      const sourceImageSrc =
        (await exportAnnotatedReferenceImage(editor, multiAnnotationAction.imageId, relatedAnnotationIds).catch((error) => {
          console.warn("Failed to export annotated reference image", error)
          return null
        })) ??
        source?.src ??
        getImageShapeSource(editor, multiAnnotationAction.imageId) ??
        undefined
      console.info("[asui-canvas] multi annotation edit", {
        imageId: multiAnnotationAction.imageId,
        versionId: multiAnnotationAction.versionId,
        annotationCount: multiAnnotationAction.annotations.length,
        relatedAnnotationCount: relatedAnnotationIds.length,
        annotations: multiAnnotationAction.annotations.map((annotation) => annotation.text),
      })
      setStatusDetail("正在整合多个标注")
      const feedbackItems = buildUnderstoodAnnotationFeedbackItems(
        editor,
        multiAnnotationAction.imageId,
        multiAnnotationAction.annotations
      )
      const version = await persistImageVersion(
        await generateImageVersion({
          prompt: source?.prompt ?? prompt,
          feedbackItems,
          parentVersionId: multiAnnotationAction.versionId,
          bounds: imageBounds,
          requestSize: resolveEditRequestSize(source, sourceBounds),
          sourceImageSrc,
        })
      )
      const imageId = createImageShape(editor, version, imageBounds)
      const arrowId = createShapeId()
      editor.createShape({
        id: arrowId,
        type: "arrow",
        x: sourceBounds.x + sourceBounds.w + 24,
        y: sourceBounds.y + sourceBounds.h / 2,
        props: {
          start: { x: 0, y: 0 },
          end: { x: Math.max(80, imageBounds.x - sourceBounds.x - sourceBounds.w - 48), y: 0 },
          color: "red",
          dash: "dashed",
          size: "m",
          arrowheadEnd: "arrow",
          richText: toRichText("AI 合并新版本"),
        },
        meta: {
          kind: "version-link",
          asuiNode: "version-link",
          asuiMetaVersion: ASUI_META_VERSION,
          sourceShapeId: multiAnnotationAction.imageId,
          targetShapeId: imageId,
          sourceAnnotationIds: multiAnnotationAction.annotations.map((annotation) => annotation.annotationId),
        },
      })
      editor.select(imageId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, version])
      setStatus("success")
    } catch (error) {
      console.error("Failed to generate from annotations", error)
      setStatus("error")
      setStatusDetail(error instanceof Error ? error.message : "图片生成失败")
      if (options.rethrow) throw error
    }
  }, [multiAnnotationAction, prompt, versions])

  const insertCodexResultVersion = useCallback(
    async (version: ImageVersion) => {
      const editor = editorRef.current
      if (!editor) return

      const savedVersion = await persistImageVersion(version)
      const sourceImageId = multiAnnotationAction?.imageId ?? annotationAction?.imageId
      const sourceBounds = sourceImageId ? editor.getShapePageBounds(sourceImageId) : null

      if (sourceImageId && sourceBounds) {
        const obstacles = editor
          .getCurrentPageShapes()
          .filter((shape) => shape.id !== sourceImageId)
          .map((shape) => editor.getShapePageBounds(shape.id))
          .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
          .map(toBounds)
        const imageBounds = findClearPlacement({
          anchor: toBounds(sourceBounds),
          width: sourceBounds.w,
          height: sourceBounds.h,
          obstacles,
          margin: 190,
        })
        const imageId = createImageShape(editor, savedVersion, imageBounds)
        const arrowId = createShapeId()
        editor.createShape({
          id: arrowId,
          type: "arrow",
          x: sourceBounds.x + sourceBounds.w + 24,
          y: sourceBounds.y + sourceBounds.h / 2,
          props: {
            start: { x: 0, y: 0 },
            end: { x: Math.max(80, imageBounds.x - sourceBounds.x - sourceBounds.w - 48), y: 0 },
            color: "red",
            dash: "dashed",
            size: "m",
            arrowheadEnd: "arrow",
            richText: toRichText(multiAnnotationAction ? "Codex 合并新版本" : "Codex 新版本"),
          },
          meta: {
            kind: "version-link",
            asuiNode: "version-link",
            asuiMetaVersion: ASUI_META_VERSION,
            sourceShapeId: sourceImageId,
            targetShapeId: imageId,
            sourceAnnotationIds: multiAnnotationAction?.annotations.map((annotation) => annotation.annotationId),
          },
        })
        editor.select(imageId)
        editor.zoomToSelection({ animation: { duration: 240 } })
        setVersions((current) => [...current, savedVersion])
        setStatus("success")
        setStatusDetail("")
        return
      }

      if (selection?.kind === "holder") {
        const holderId = selection.shapeId as TLShapeId
        const holderBounds = editor.getShapePageBounds(holderId)
        if (holderBounds) {
          const imageBounds = toBounds(holderBounds)
          const holderShape = editor.getShape(holderId)
          const imageId =
            holderShape?.type === "frame"
              ? createImageShape(
                  editor,
                  savedVersion,
                  { x: 0, y: 0, w: imageBounds.w, h: imageBounds.h },
                  { parentId: holderId }
                )
              : createImageShape(editor, savedVersion, imageBounds)
          if (holderShape) {
            editor.updateShape({
              id: holderId,
              type: holderShape.type,
              meta: {
                ...holderShape.meta,
                kind: "image-holder",
                asuiNode: "image-holder",
                asuiMetaVersion: ASUI_META_VERSION,
                latestImageShapeId: imageId,
                latestVersionId: savedVersion.versionId,
              },
            })
          }
          editor.select(imageId)
          setVersions((current) => [...current, savedVersion])
          setStatus("success")
          setStatusDetail("")
          return
        }
      }

      const viewport = editor.getViewportPageBounds()
      const width = Math.min(savedVersion.width, Math.max(240, viewport.w * 0.4))
      const height = Math.max(120, width * (savedVersion.height / Math.max(1, savedVersion.width)))
      const imageId = createImageShape(editor, savedVersion, {
        x: viewport.x + viewport.w / 2 - width / 2,
        y: viewport.y + viewport.h / 2 - height / 2,
        w: width,
        h: height,
      })
      editor.select(imageId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, savedVersion])
      setStatus("success")
      setStatusDetail("")
    },
    [annotationAction, multiAnnotationAction, selection]
  )

  const resolveCodexCanvasContext = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return {}

    if (multiAnnotationAction) {
      const relatedAnnotationIds = getRelatedAnnotationIdsForReference(
        editor,
        multiAnnotationAction.imageId,
        multiAnnotationAction.annotations.map((annotation) => annotation.annotationId as TLShapeId)
      )
      const referenceImageSrc = await exportAnnotatedReferenceImage(
        editor,
        multiAnnotationAction.imageId,
        relatedAnnotationIds
      ).catch(() => null)

      return {
        sourceShapeId: multiAnnotationAction.imageId,
        versionId: multiAnnotationAction.versionId,
        sourceImageSrc: getImageShapeSource(editor, multiAnnotationAction.imageId) ?? undefined,
        referenceImageSrc: referenceImageSrc ?? undefined,
        feedbackItems: buildUnderstoodAnnotationFeedbackItems(
          editor,
          multiAnnotationAction.imageId,
          multiAnnotationAction.annotations
        ),
      }
    }

    if (annotationAction) {
      const relatedAnnotationIds = getRelatedAnnotationIdsForReference(editor, annotationAction.imageId, [
        annotationAction.annotationId,
      ])
      const referenceImageSrc = await exportAnnotatedReferenceImage(
        editor,
        annotationAction.imageId,
        relatedAnnotationIds
      ).catch(() => null)

      return {
        sourceShapeId: annotationAction.imageId,
        versionId: annotationAction.versionId,
        sourceImageSrc: getImageShapeSource(editor, annotationAction.imageId) ?? undefined,
        referenceImageSrc: referenceImageSrc ?? undefined,
        feedbackItems: buildUnderstoodAnnotationFeedbackItems(editor, annotationAction.imageId, [
          {
            annotationId: annotationAction.annotationId,
            imageId: annotationAction.imageId,
            versionId: annotationAction.versionId,
            text: getFeedbackFromAnnotationGroup(editor, annotationAction.annotationId, relatedAnnotationIds),
          },
        ]),
      }
    }

    if (selection?.kind === "image") {
      return {
        sourceShapeId: selection.shapeId,
        versionId: selection.versionId,
        sourceImageSrc: getImageShapeSource(editor, selection.shapeId as TLShapeId) ?? undefined,
      }
    }

    return {}
  }, [annotationAction, multiAnnotationAction, selection])

  const canGenerateFromAnnotation = Boolean(annotationAction) && status !== "editing"
  const canGenerateFromAllAnnotations = Boolean(multiAnnotationAction) && status !== "editing"
  const canCutoutFromAnnotation = Boolean(annotationAction) && status !== "editing"

  return (
    <main className="canvas-app-shell">
      <div className="canvas-surface">
        <Tldraw
          persistenceKey={CANVAS_PERSISTENCE_KEY}
          assetUrls={TLDRAW_ASSET_URLS}
          onMount={handleMount}
        />
      </div>
      {annotationAction && (
        <div
          className="absolute z-30 flex gap-2"
          style={{
            left: annotationAction.x,
            top: annotationAction.y,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-xl"
            disabled={!canGenerateFromAnnotation}
            onClick={(event) => {
              event.stopPropagation()
              void editFromAnnotation()
            }}
          >
            {status === "editing" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            生成
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-xl"
            disabled={!canCutoutFromAnnotation}
            onClick={(event) => {
              event.stopPropagation()
              void cutoutFromAnnotation()
            }}
          >
            {status === "editing" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Scissors className="size-3.5" />
            )}
            抠图
          </Button>
        </div>
      )}
      {selection?.kind === "holder" && sizeBar && (
        <CanvasSizeFloatingBar
          key={selection.shapeId}
          x={sizeBar.x}
          y={sizeBar.y}
          size={holderSize}
          presetId={sizeBar.presetId}
          onPresetChange={applyHolderPreset}
          onSizeChange={(nextSize) => updateHolderSize(nextSize, "custom")}
        />
      )}
      {multiAnnotationAction && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute z-30 h-8 gap-1.5 rounded-full px-3 text-xs shadow-xl"
          style={{
            left: multiAnnotationAction.x,
            top: multiAnnotationAction.y,
          }}
          disabled={!canGenerateFromAllAnnotations}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            void editFromAllAnnotations()
          }}
        >
          {status === "editing" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          全部标注生成
        </Button>
      )}
      {isCodexTaskOpen && (
        <CodexTaskPanel
          selectedShapeIds={selectedShapeIds}
          annotationIds={selectedAnnotationIds}
          prompt={prompt}
          width={holderSize.width}
          height={holderSize.height}
          resolveCanvasContext={resolveCodexCanvasContext}
          onInsertResult={insertCodexResultVersion}
          onClose={() => setIsCodexTaskOpen(false)}
        />
      )}
      <CanvasToolbar
        onCreateHolder={createHolder}
        onOpenCodexTask={() => setIsCodexTaskOpen(true)}
      />
      <GenerationPanel
        selection={selection}
        prompt={prompt}
        status={status}
        statusDetail={statusDetail}
        versionCount={versions.length}
        onPromptChange={setPrompt}
        onFill={fillHolder}
      />
    </main>
  )
}
