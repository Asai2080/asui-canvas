"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AssetRecordType,
  createShapeId,
  Editor,
  startEditingShapeWithRichText,
  Tldraw,
  TLShape,
  TLShapeId,
  toRichText,
} from "tldraw"
import { LoaderCircle, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CanvasSizeFloatingBar } from "@/components/canvas/canvas-size-floating-bar"
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar"
import { GenerationPanel } from "@/components/canvas/generation-panel"
import { readApiConfigFromSession } from "@/lib/canvas/api-config"
import { expandBounds, findClearPlacement, intersects } from "@/lib/canvas/geometry"
import { CANVAS_PERSISTENCE_KEY, IMAGE_VERSION_STORAGE_KEY } from "@/lib/canvas/persistence"
import { generatePoster } from "@/lib/canvas/poster-generator"
import { resolveCanvasSizePreset, type CanvasSizePresetId } from "@/lib/canvas/size-presets"
import { normalizeCanvasSize } from "@/lib/canvas/size"
import type { Bounds, CanvasSelection, CanvasSize, GenerationStatus, ImageVersion } from "@/lib/canvas/types"

const DEFAULT_HOLDER_SIZE: CanvasSize = { width: 360, height: 480 }
const ANNOTATION_TYPES = new Set(["arrow", "draw", "text", "highlight", "geo"])
const ASUI_META_VERSION = 1

const shapeMeta = (shape?: TLShape | null) => (shape?.meta ?? {}) as Record<string, unknown>
const isCanvasSizePresetId = (value: unknown): value is CanvasSizePresetId =>
  typeof value === "string" && ["custom", "1:1", "2:3", "9:16", "3:2", "16:9", "a4", "web"].includes(value)

const toBounds = (box: { x: number; y: number; w: number; h: number }): Bounds => ({
  x: box.x,
  y: box.y,
  w: box.w,
  h: box.h,
})

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

  const image = editor
    .getCurrentPageShapes()
    .find((shape) => {
      const meta = shapeMeta(shape)
      if (shape.type !== "image" || meta.kind !== "generated-image") return false
      const imageBounds = editor.getShapePageBounds(shape.id)
      return imageBounds ? intersects(searchArea, toBounds(imageBounds)) : false
    })

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

function getAnnotationFeedback(editor: Editor, annotationId: TLShapeId) {
  const shape = editor.getShape(annotationId)
  if (!shape) return "根据画布标注区域优化图片"

  const text = editor.getShapeUtil(shape).getText(shape)?.trim()
  return text || "根据画布标注区域优化图片"
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
  parentVersionId,
  bounds,
  sourceImageSrc,
}: {
  prompt: string
  feedback?: string
  parentVersionId?: string
  bounds: Bounds
  sourceImageSrc?: string
}) {
  const apiConfig = readApiConfigFromSession()

  if (!apiConfig.baseUrl.trim() || !apiConfig.apiKey.trim()) {
    return generatePoster({ prompt, feedback, parentVersionId })
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
      parentVersionId,
      sourceImageSrc,
      width: bounds.w,
      height: bounds.h,
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    version?: ImageVersion
    error?: string
  }

  if (!response.ok || !payload.version) {
    throw new Error(payload.error ?? "图片生成失败")
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
  const [sizeBar, setSizeBar] = useState<{
    x: number
    y: number
    presetId: CanvasSizePresetId
  } | null>(null)
  const [holderSize, setHolderSize] = useState<CanvasSize>(DEFAULT_HOLDER_SIZE)
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
        return
      }
    }

    setAnnotationAction(null)
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

  const fillHolder = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || selection?.kind !== "holder") return
    const holderId = selection.shapeId as TLShapeId
    const bounds = editor.getShapePageBounds(holderId)
    if (!bounds) return

    setStatus("generating")
    setStatusDetail("")
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 520))
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
    }
  }, [prompt, selection])

  const editFromAnnotation = useCallback(async () => {
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
      const version = await persistImageVersion(await generateImageVersion({
        prompt: source?.prompt ?? prompt,
        feedback: getAnnotationFeedback(editor, annotationAction.annotationId),
        parentVersionId: annotationAction.versionId,
        bounds: imageBounds,
        sourceImageSrc: source?.src ?? getImageShapeSource(editor, annotationAction.imageId) ?? undefined,
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
    }
  }, [annotationAction, prompt, versions])

  const createAiAnnotation = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const selectedShape = editor.getOnlySelectedShape()
    const selectedMeta = shapeMeta(selectedShape)
    const targetShape =
      selectedShape?.type === "image" &&
      (selectedMeta.kind === "generated-image" || selectedMeta.asuiNode === "generated-image")
        ? selectedShape
        : editor
            .getCurrentPageShapes()
            .find((shape) => shape.type === "image" && shapeMeta(shape).kind === "generated-image")

    const targetBounds = targetShape ? editor.getShapePageBounds(targetShape.id) : null
    const viewportCenter = editor.getViewportPageBounds().center
    const x = targetBounds ? targetBounds.x + targetBounds.w * 0.62 : viewportCenter.x - 80
    const y = targetBounds ? targetBounds.y + targetBounds.h * 0.26 : viewportCenter.y - 40
    const annotationId = createShapeId()
    const targetMeta = shapeMeta(targetShape)

    editor.createShape({
      id: annotationId,
      type: "arrow",
      x,
      y,
      props: {
        start: { x: 0, y: 0 },
        end: { x: 150, y: -64 },
        color: "red",
        labelColor: "red",
        dash: "draw",
        size: "m",
        font: "draw",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        richText: toRichText("输入修改要求"),
      },
      meta: {
        kind: "ai-annotation",
        asuiNode: "annotation",
        asuiMetaVersion: ASUI_META_VERSION,
        sourceShapeId: targetShape?.id ?? null,
        versionId: typeof targetMeta.versionId === "string" ? targetMeta.versionId : null,
      },
    })

    editor.select(annotationId)
    editor.timers.setTimeout(() => {
      startEditingShapeWithRichText(editor, annotationId, { selectAll: true })
    }, 80)
    setStatus("idle")
    setStatusDetail("")
  }, [])

  const canGenerateFromAnnotation = Boolean(annotationAction) && status !== "editing"

  return (
    <main className="canvas-app-shell">
      <div className="canvas-surface">
        <Tldraw persistenceKey={CANVAS_PERSISTENCE_KEY} onMount={handleMount} />
      </div>
      {annotationAction && (
        <Button
          type="button"
          size="sm"
          className="absolute z-30 h-8 gap-1.5 rounded-full px-3 text-xs shadow-xl"
          style={{
            left: annotationAction.x,
            top: annotationAction.y,
          }}
          disabled={!canGenerateFromAnnotation}
          onPointerDown={(event) => event.stopPropagation()}
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
      )}
      {selection?.kind === "holder" && sizeBar && (
        <CanvasSizeFloatingBar
          key={`${selection.shapeId}:${holderSize.width}x${holderSize.height}`}
          x={sizeBar.x}
          y={sizeBar.y}
          size={holderSize}
          presetId={sizeBar.presetId}
          onPresetChange={applyHolderPreset}
          onSizeChange={(nextSize) => updateHolderSize(nextSize, "custom")}
        />
      )}
      <CanvasToolbar onCreateHolder={createHolder} onCreateAnnotation={createAiAnnotation} />
      <GenerationPanel
        selection={selection}
        holderSize={holderSize}
        prompt={prompt}
        status={status}
        statusDetail={statusDetail}
        versionCount={versions.length}
        onHolderSizeChange={updateHolderSize}
        onPromptChange={setPrompt}
        onFill={fillHolder}
      />
    </main>
  )
}
