"use client"

import dynamic from "next/dynamic"
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image01Icon, Video01Icon } from "@hugeicons/core-free-icons"
import type { OrbState } from "thinking-orbs"
import {
  AssetRecordType,
  createShapesForAssets,
  createShapeId,
  Editor,
  FrameShapeUtil,
  Group2d,
  HTMLContainer,
  ImageShapeUtil,
  Rectangle2d,
  SnapIndicatorOverlayUtil,
  Tldraw,
  type TLAsset,
  TLAssetId,
  TLFrameShape,
  TLImageShape,
  type TLSnapIndicatorOverlay,
  TLShape,
  TLShapeId,
  TLVideoShape,
  useValue,
  VideoShapeUtil,
} from "tldraw"
import { LoaderCircle, Plus, Scissors, Sparkles, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CanvasGenerationStatusOverlay } from "@/components/canvas/canvas-generation-status-overlay"
import { CanvasIdleDotGrid } from "@/components/canvas/canvas-idle-dot-grid"
import {
  CanvasMainToolbar,
  CanvasMainToolbarContext,
  CanvasQuickActions,
  readCanvasSnapModePreference,
} from "@/components/canvas/canvas-main-toolbar"
import { CanvasSizeFloatingBar } from "@/components/canvas/canvas-size-floating-bar"
import { CanvasApiConfigDialog } from "@/components/canvas/canvas-toolbar"
import { CodexTaskPanel, type ResolvedCodexCanvasContext } from "@/components/canvas/codex-task-panel"
import { GenerationPanel, type VideoResolution } from "@/components/canvas/generation-panel"
import { canvasCommandBridge } from "@/lib/canvas-agent/canvas-commands/bridge"
import type {
  AgentCanvasCommandAcknowledgement,
  AgentCanvasCommandBatch,
} from "@/lib/canvas-agent/canvas-commands/schema"
import {
  parseSafe3dPreviewSpec,
  safe3dPreviewSpecSchema,
} from "@/lib/canvas-3d/preview-schema"
import { parseProcedural3dModelSpec } from "@/lib/canvas-3d/model-schema"
import type { AgentTask } from "@/lib/canvas-agent/task-schema"
import { buildCanvasContextSnapshot } from "@/lib/canvas-agent/context/build-context"
import type {
  CanvasContextInputMedia,
  CanvasContextInputNode,
  CanvasContextScope,
  CanvasContextSnapshot,
} from "@/lib/canvas-agent/context/schema"
import {
  buildAnnotationFeedbackItems,
  validateSameAnnotationTarget,
  type AnnotationFeedbackItem,
  type ResolvedAnnotation,
} from "@/lib/canvas/annotations"
import { readApiConfigFromSession } from "@/lib/canvas/api-config"
import { expandBounds, findClearPlacement, intersects, normalizeBounds } from "@/lib/canvas/geometry"
import {
  fitImportedImageCanvasSize,
  insetCanvasMediaBounds,
} from "@/lib/canvas/media-layout"
import { CANVAS_PERSISTENCE_KEY, IMAGE_VERSION_STORAGE_KEY } from "@/lib/canvas/persistence"
import { generatePoster } from "@/lib/canvas/poster-generator"
import { resolveCanvasSizePreset, type CanvasSizePresetId } from "@/lib/canvas/size-presets"
import { normalizeCanvasSize } from "@/lib/canvas/size"
import type { Bounds, CanvasSelection, CanvasSize, GenerationStatus, ImageVersion, ReferenceImage } from "@/lib/canvas/types"
import {
  runWithAutoManagedCutoutService,
  type CutoutServicePhase,
} from "@/lib/cutout/client-service"
import { normalizeVideoReferenceSource } from "@/lib/video-generation/reference-source"

const CanvasAgentShell = dynamic(
  () =>
    import("@/components/canvas-agent/canvas-agent-shell").then(
      (module) => module.CanvasAgentShell
    ),
  { ssr: false }
)

const Canvas3dPreview = dynamic(
  () =>
    import("@/components/canvas/canvas-3d-preview").then(
      (module) => module.Canvas3dPreview
    ),
  { ssr: false }
)

const Canvas3dModel = dynamic(
  () =>
    import("@/components/canvas/canvas-3d-model").then(
      (module) => module.Canvas3dModel
    ),
  { ssr: false }
)

const CANVAS_AGENT_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED ?? "").trim().toLowerCase()
)

const DEFAULT_HOLDER_SIZE: CanvasSize = { width: 360, height: 480 }
const ANNOTATION_TYPES = new Set(["arrow", "draw", "text", "highlight", "geo"])
const ASUI_META_VERSION = 1
const MAX_REFERENCE_IMAGE_BYTES = 18 * 1024 * 1024
const MAX_REFERENCE_IMAGE_EDGE = 1800
const QIAOMU_FONT_URL = "/fonts/PingFangQiaoMuTi.ttf"
const IMAGE_CANVAS_NAME = "图片画布"
const VIDEO_CANVAS_NAME = "视频画布"
const TLDRAW_ASSET_URLS = {
  fonts: {
    tldraw_draw: QIAOMU_FONT_URL,
    tldraw_draw_bold: QIAOMU_FONT_URL,
    tldraw_draw_italic: QIAOMU_FONT_URL,
    tldraw_draw_italic_bold: QIAOMU_FONT_URL,
  },
}

const shapeMeta = (shape?: TLShape | null) => (shape?.meta ?? {}) as Record<string, unknown>
const isImageHolderShape = (shape?: TLShape | null) => {
  const meta = shapeMeta(shape)
  return meta.kind === "image-holder" || meta.asuiNode === "image-holder"
}
const isVideoNodeShape = (shape?: TLShape | null) => {
  const meta = shapeMeta(shape)
  return meta.kind === "video-node" || meta.asuiNode === "video-node"
}
const isAgentPromptShape = (shape?: TLShape | null) =>
  shapeMeta(shape).kind === "agent-prompt"
const is3dPreviewShape = (shape?: TLShape | null) => {
  const meta = shapeMeta(shape)
  return meta.kind === "3d-preview" || meta.asuiNode === "3d-preview"
}
const is3dModelShape = (shape?: TLShape | null) => {
  const meta = shapeMeta(shape)
  return meta.kind === "3d-model" || meta.asuiNode === "3d-model"
}

class AsuiFrameShapeUtil extends FrameShapeUtil {
  override hideResizeHandles(shape: TLFrameShape) {
    return (
      isImageHolderShape(shape) ||
      isVideoNodeShape(shape) ||
      isAgentPromptShape(shape) ||
      is3dPreviewShape(shape) ||
      is3dModelShape(shape)
    )
  }

  override hideRotateHandle(shape: TLFrameShape) {
    return (
      isImageHolderShape(shape) ||
      isVideoNodeShape(shape) ||
      isAgentPromptShape(shape) ||
      is3dPreviewShape(shape) ||
      is3dModelShape(shape)
    )
  }

  override hideSelectionBoundsFg(shape: TLFrameShape) {
    return (
      isImageHolderShape(shape) ||
      isVideoNodeShape(shape) ||
      isAgentPromptShape(shape) ||
      is3dPreviewShape(shape) ||
      is3dModelShape(shape)
    )
  }

  override getGeometry(shape: TLFrameShape) {
    if (
      !isImageHolderShape(shape) &&
      !isVideoNodeShape(shape) &&
      !isAgentPromptShape(shape) &&
      !is3dPreviewShape(shape) &&
      !is3dModelShape(shape)
    ) {
      return super.getGeometry(shape)
    }

    const geometry = super.getGeometry(shape)
    if (!(geometry instanceof Group2d)) return geometry

    return new Group2d({
      children: [
        new Rectangle2d({
          width: shape.props.w,
          height: shape.props.h,
          isFilled: true,
        }),
        ...geometry.children.slice(1),
      ],
    })
  }

  override component(shape: TLFrameShape) {
    const content = super.component(shape)
    if (is3dModelShape(shape)) {
      const parsedSpec = parseProcedural3dModelSpec(
        shapeMeta(shape).agent3dModel
      )
      if (!parsedSpec.success) return content
      return (
        <div className="asui-3d-model-frame">
          {content}
          <HTMLContainer
            className="asui-3d-model-container"
            style={{ width: shape.props.w, height: shape.props.h }}
          >
            <Canvas3dModel
              spec={parsedSpec.data}
              onActivate={() => this.editor.select(shape.id)}
            />
          </HTMLContainer>
        </div>
      )
    }
    if (is3dPreviewShape(shape)) {
      const parsedSpec = parseSafe3dPreviewSpec(
        shapeMeta(shape).agent3dPreview
      )
      const referenceShapeIds = parsedSpec.success
        ? parsedSpec.data.referenceShapeIds
        : []
      // Shape util components are invoked as reactive React components by tldraw.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const sources = useValue(
        `3D preview sources for ${shape.id}`,
        () =>
          referenceShapeIds.flatMap((referenceShapeId) => {
            const holder = this.editor.getShape(
              referenceShapeId as TLShapeId
            )
            if (!holder || !isImageHolderShape(holder)) return []
            const imageId = getLatestImageShapeIdFromHolder(
              this.editor,
              holder.id
            )
            const src = imageId
              ? getImageShapeSource(this.editor, imageId)
              : null
            return src ? [{ shapeId: holder.id, src }] : []
          }),
        [referenceShapeIds.join("|"), shape.id]
      )
      const title = parsedSpec.success
        ? parsedSpec.data.title
        : "3D 多视角代理"

      return (
        <div className="asui-3d-preview-frame">
          {content}
          <HTMLContainer
            className="asui-3d-preview-container"
            style={{ width: shape.props.w, height: shape.props.h }}
          >
            <Canvas3dPreview
              title={title}
              sources={sources}
              onActivate={() => this.editor.select(shape.id)}
            />
          </HTMLContainer>
        </div>
      )
    }

    if (isAgentPromptShape(shape)) {
      const promptContent = String(
        shapeMeta(shape).agentPromptContent ?? ""
      )
      return (
        <div className="asui-agent-prompt-frame">
          {content}
          <HTMLContainer
            className="asui-agent-prompt-content"
            style={{ width: shape.props.w, height: shape.props.h }}
          >
            <div className="asui-agent-prompt-document">
              {promptContent.split("\n").map((line, index) => {
                const headingLevel = line.match(/^(#{1,3})\s+(.+)$/)
                if (headingLevel) {
                  const Tag =
                    headingLevel[1].length === 1
                      ? "h2"
                      : headingLevel[1].length === 2
                        ? "h3"
                        : "h4"
                  return <Tag key={`${index}-${line}`}>{headingLevel[2]}</Tag>
                }
                if (line.startsWith("- ")) {
                  return (
                    <p className="is-list-item" key={`${index}-${line}`}>
                      {line.slice(2)}
                    </p>
                  )
                }
                return line ? (
                  <p key={`${index}-${line}`}>{line}</p>
                ) : (
                  <span
                    className="asui-agent-prompt-spacer"
                    key={`spacer-${index}`}
                    aria-hidden="true"
                  />
                )
              })}
            </div>
          </HTMLContainer>
        </div>
      )
    }

    const isAsuiNode = isImageHolderShape(shape) || isVideoNodeShape(shape)
    const kind = isVideoNodeShape(shape) ? "video" : "image"
    // Shape util components are invoked as reactive React components by tldraw.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const isEmpty = useValue(
      `is ${kind} canvas empty`,
      () =>
        isAsuiNode &&
        !this.editor
          .getSortedChildIdsForParent(shape.id)
          .some((childId) => ["image", "video"].includes(this.editor.getShape(childId)?.type ?? "")),
      [isAsuiNode, shape.id]
    )
    if (!isAsuiNode) return content

    return (
      <div className={`asui-node-frame asui-node-frame--${kind}`}>
        {content}
        {isEmpty && (
          <HTMLContainer
            className="canvas-idle-dot-grid-container"
            style={{ width: shape.props.w, height: shape.props.h }}
          >
            <CanvasIdleDotGrid />
            <div className="canvas-idle-prompt" aria-hidden="true">
              <HugeiconsIcon
                icon={kind === "video" ? Video01Icon : Image01Icon}
                size={20}
                strokeWidth={1.6}
              />
              <span>在底部面板输入 Prompt 生成{kind === "video" ? "视频" : "图片"}</span>
            </div>
          </HTMLContainer>
        )}
      </div>
    )
  }

  override getIndicatorPath(shape: TLFrameShape) {
    if (isAgentPromptShape(shape)) {
      const path = new Path2D()
      path.roundRect(0, 0, shape.props.w, shape.props.h, 18)
      return path
    }
    if (
      !isImageHolderShape(shape) &&
      !isVideoNodeShape(shape) &&
      !is3dPreviewShape(shape) &&
      !is3dModelShape(shape)
    ) {
      return super.getIndicatorPath(shape)
    }

    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 30)
    return path
  }
}

const TLDRAW_COMPONENTS = {
  ImageToolbar: null,
  QuickActions: CanvasQuickActions,
  StylePanel: null,
  Toolbar: CanvasMainToolbar,
}

class AsuiSnapIndicatorOverlayUtil extends SnapIndicatorOverlayUtil {
  override render(
    context: CanvasRenderingContext2D,
    overlays: TLSnapIndicatorOverlay[]
  ) {
    const zoom = this.editor.getZoomLevel()

    context.save()
    context.setLineDash([6 / zoom, 5 / zoom])
    context.lineCap = "round"
    super.render(context, overlays)
    context.restore()
  }
}

const TLDRAW_OVERLAY_UTILS = [AsuiSnapIndicatorOverlayUtil]

function applyAsuiCanvasTheme(editor: Editor) {
  const theme = editor.getCurrentTheme()
  editor.updateTheme({
    ...theme,
    colors: {
      light: {
        ...theme.colors.light,
        selectionStroke: "#A3FE44",
        selectionFill: "rgb(163 254 68 / 18%)",
        snap: "#A3FE44",
      },
      dark: {
        ...theme.colors.dark,
        selectionStroke: "#A3FE44",
        selectionFill: "rgb(163 254 68 / 18%)",
        snap: "#A3FE44",
      },
    },
  })
}

class AsuiImageShapeUtil extends ImageShapeUtil {
  override getIndicatorPath(shape: TLImageShape) {
    const meta = shapeMeta(shape)
    if (meta.kind === "generated-image" || meta.asuiNode === "generated-image") {
      return undefined
    }
    return super.getIndicatorPath(shape)
  }

  override component(shape: TLImageShape) {
    const content = super.component(shape)
    const meta = shapeMeta(shape)
    if (meta.kind !== "generated-image" && meta.asuiNode !== "generated-image") {
      return content
    }

    return (
      <div
        className="asui-generated-media"
        style={{ width: shape.props.w, height: shape.props.h }}
      >
        {content}
      </div>
    )
  }
}

class AsuiVideoShapeUtil extends VideoShapeUtil {
  override getIndicatorPath(shape: TLVideoShape) {
    const meta = shapeMeta(shape)
    if (meta.kind === "generated-video" || meta.asuiNode === "generated-video") {
      return new Path2D()
    }
    return super.getIndicatorPath(shape)
  }

  override component(shape: TLVideoShape) {
    const content = super.component(shape)
    const meta = shapeMeta(shape)
    if (meta.kind !== "generated-video" && meta.asuiNode !== "generated-video") {
      return content
    }

    return (
      <div
        className="asui-generated-media"
        style={{ width: shape.props.w, height: shape.props.h }}
      >
        {content}
      </div>
    )
  }
}

const TLDRAW_SHAPE_UTILS = [
  AsuiFrameShapeUtil,
  AsuiImageShapeUtil,
  AsuiVideoShapeUtil,
]
const externalVersionIdForShape = (shapeId: string) => `external:${shapeId}`
const isExternalVersionId = (versionId?: string) => Boolean(versionId?.startsWith("external:"))
const parentVersionIdFromCanvasVersionId = (versionId?: string) =>
  versionId && !isExternalVersionId(versionId) ? versionId : undefined
const getCanvasImageVersionId = (shape: TLShape) => {
  const meta = shapeMeta(shape)
  return typeof meta.versionId === "string" ? meta.versionId : externalVersionIdForShape(shape.id)
}
const isCanvasSizePresetId = (value: unknown): value is CanvasSizePresetId =>
  typeof value === "string" && ["custom", "1:1", "2:3", "3:4", "9:16", "3:2", "16:9", "a4", "web"].includes(value)

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)
const cutoutPhaseLabel: Record<CutoutServicePhase, string> = {
  starting: "正在启动抠图服务",
  processing: "正在识别主体并移除背景",
  stopping: "正在关闭抠图服务",
}

const toBounds = (box: { x: number; y: number; w: number; h: number }): Bounds => ({
  x: box.x,
  y: box.y,
  w: box.w,
  h: box.h,
})

type ConnectorSide = "left" | "right"

type FloatingPanelPosition = {
  x: number
  y: number
}

type NodeConnectorMenu = {
  x: number
  y: number
  sourceShapeId: TLShapeId
  side: ConnectorSide
  pagePoint?: { x: number; y: number }
}

type NodeConnectorDrag = {
  sourceShapeId: TLShapeId
  side: ConnectorSide
  start: { x: number; y: number }
  current: { x: number; y: number }
  active: boolean
}

type CanvasNodeLink = {
  id: string
  source: { x: number; y: number }
  target: { x: number; y: number }
}

function getViewportShapeBounds(editor: Editor, shapeId: TLShapeId): Bounds | null {
  const bounds = editor.getShapePageBounds(shapeId)
  if (!bounds) return null

  const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y })
  const bottomRight = editor.pageToViewport({ x: bounds.x + bounds.w, y: bounds.y + bounds.h })

  return {
    x: topLeft.x,
    y: topLeft.y,
    w: Math.max(1, bottomRight.x - topLeft.x),
    h: Math.max(1, bottomRight.y - topLeft.y),
  }
}

function getFloatingPanelPosition(bounds: Bounds): FloatingPanelPosition {
  const panelWidth = 683
  const margin = 16
  const canvasViewportWidth =
    typeof document === "undefined"
      ? 1024
      : document.querySelector(".canvas-app-shell")?.getBoundingClientRect().width ?? window.innerWidth
  const preferredX = bounds.x + bounds.w / 2 - panelWidth / 2
  const x = Math.min(
    Math.max(margin, preferredX),
    Math.max(margin, canvasViewportWidth - panelWidth - margin)
  )

  return {
    x,
    y: Math.max(margin, bounds.y + bounds.h + 14),
  }
}

function positionsMatch(
  current: FloatingPanelPosition | null,
  next: FloatingPanelPosition | null,
  tolerance = 0.25
) {
  if (!current || !next) return current === next

  return Math.abs(current.x - next.x) < tolerance && Math.abs(current.y - next.y) < tolerance
}

function boundsMatch(current: Bounds | null, next: Bounds | null, tolerance = 0.25) {
  if (!current || !next) return current === next

  return (
    Math.abs(current.x - next.x) < tolerance &&
    Math.abs(current.y - next.y) < tolerance &&
    Math.abs(current.w - next.w) < tolerance &&
    Math.abs(current.h - next.h) < tolerance
  )
}

function getPagePointFromViewportPoint(editor: Editor, point: { x: number; y: number }) {
  const viewportPageBounds = editor.getViewportPageBounds()
  const topLeft = editor.pageToViewport({ x: viewportPageBounds.x, y: viewportPageBounds.y })
  const bottomRight = editor.pageToViewport({
    x: viewportPageBounds.x + viewportPageBounds.w,
    y: viewportPageBounds.y + viewportPageBounds.h,
  })
  const viewportWidth = Math.max(1, bottomRight.x - topLeft.x)
  const viewportHeight = Math.max(1, bottomRight.y - topLeft.y)

  return {
    x: viewportPageBounds.x + ((point.x - topLeft.x) / viewportWidth) * viewportPageBounds.w,
    y: viewportPageBounds.y + ((point.y - topLeft.y) / viewportHeight) * viewportPageBounds.h,
  }
}

function getHolderAtPagePoint(editor: Editor, point: { x: number; y: number }) {
  return (
    editor
      .getCurrentPageShapes()
      .map((shape) => {
        const meta = shapeMeta(shape)
        const isHolder = meta.kind === "image-holder" || meta.asuiNode === "image-holder"
        if (!isHolder || (shape.type !== "frame" && shape.type !== "geo")) return null
        const bounds = editor.getShapePageBounds(shape.id)
        if (!bounds) return null
        const normalizedBounds = toBounds(bounds)
        const containsPoint =
          point.x >= normalizedBounds.x &&
          point.x <= normalizedBounds.x + normalizedBounds.w &&
          point.y >= normalizedBounds.y &&
          point.y <= normalizedBounds.y + normalizedBounds.h
        if (!containsPoint) return null

        return {
          id: shape.id as TLShapeId,
          area: normalizedBounds.w * normalizedBounds.h,
        }
      })
      .filter((candidate): candidate is { id: TLShapeId; area: number } => Boolean(candidate))
      .sort((a, b) => a.area - b.area)[0]?.id ?? null
  )
}

function getCanvasNodeFrameIdForDirectHit(editor: Editor, shape?: TLShape | null) {
  if (!shape) return null
  if (
    shape.type === "frame" &&
    (
      isImageHolderShape(shape) ||
      isVideoNodeShape(shape) ||
      isAgentPromptShape(shape)
    )
  ) {
    return shape.id as TLShapeId
  }
  if (shape.type !== "image" && shape.type !== "video") return null

  let parentId = shape.parentId
  let outermostCanvasNodeId: TLShapeId | null = null

  while (String(parentId).startsWith("shape:")) {
    const parent = editor.getShape(parentId as TLShapeId)
    if (!parent) break
    if (
      parent.type === "frame" &&
      (
        isImageHolderShape(parent) ||
        isVideoNodeShape(parent) ||
        isAgentPromptShape(parent)
      )
    ) {
      outermostCanvasNodeId = parent.id as TLShapeId
    }
    parentId = parent.parentId
  }

  return outermostCanvasNodeId
}

function connectorAnchor(bounds: Bounds, side: ConnectorSide) {
  return {
    x: side === "left" ? bounds.x : bounds.x + bounds.w,
    y: bounds.y + bounds.h / 2,
  }
}

function getVideoNodeLinks(editor: Editor): CanvasNodeLink[] {
  return editor
    .getCurrentPageShapes()
    .map((shape) => {
      const meta = shapeMeta(shape)
      if (meta.kind !== "video-node" && meta.asuiNode !== "video-node") return null
      if (typeof meta.sourceShapeId !== "string") return null

      const sourceBounds = getViewportShapeBounds(editor, meta.sourceShapeId as TLShapeId)
      const targetBounds = getViewportShapeBounds(editor, shape.id as TLShapeId)
      if (!sourceBounds || !targetBounds) return null

      const sourceIsLeft = sourceBounds.x + sourceBounds.w / 2 < targetBounds.x + targetBounds.w / 2
      return {
        id: `${meta.sourceShapeId}-${shape.id}`,
        source: connectorAnchor(sourceBounds, sourceIsLeft ? "right" : "left"),
        target: connectorAnchor(targetBounds, sourceIsLeft ? "left" : "right"),
      }
    })
    .filter((link): link is CanvasNodeLink => Boolean(link))
}

function getVersionNodeLinks(editor: Editor): CanvasNodeLink[] {
  return editor
    .getCurrentPageShapes()
    .map((shape) => {
      const meta = shapeMeta(shape)
      if (meta.kind !== "generated-image" && meta.asuiNode !== "generated-image") return null
      if (typeof meta.sourceShapeId !== "string") return null

      const sourceBounds = getViewportShapeBounds(editor, meta.sourceShapeId as TLShapeId)
      const targetBounds = getViewportShapeBounds(editor, shape.id as TLShapeId)
      if (!sourceBounds || !targetBounds) return null

      const sourceIsLeft = sourceBounds.x + sourceBounds.w / 2 < targetBounds.x + targetBounds.w / 2
      return {
        id: `version-${meta.sourceShapeId}-${shape.id}`,
        source: connectorAnchor(sourceBounds, sourceIsLeft ? "right" : "left"),
        target: connectorAnchor(targetBounds, sourceIsLeft ? "left" : "right"),
      }
    })
    .filter((link): link is CanvasNodeLink => Boolean(link))
}

function migrateVersionLinkArrows(editor: Editor) {
  const arrowsToDelete: TLShapeId[] = []

  for (const shape of editor.getCurrentPageShapes()) {
    const meta = shapeMeta(shape)
    if (shape.type !== "arrow") continue
    if (meta.kind !== "version-link" && meta.asuiNode !== "version-link") continue
    if (typeof meta.sourceShapeId !== "string" || typeof meta.targetShapeId !== "string") continue

    const targetShape = editor.getShape(meta.targetShapeId as TLShapeId)
    if (targetShape) {
      editor.updateShape({
        id: targetShape.id,
        type: targetShape.type,
        meta: {
          ...targetShape.meta,
          sourceShapeId: meta.sourceShapeId,
          sourceAnnotationIds: Array.isArray(meta.sourceAnnotationIds) ? meta.sourceAnnotationIds : [],
        },
      })
    }
    arrowsToDelete.push(shape.id as TLShapeId)
  }

  if (arrowsToDelete.length > 0) {
    editor.deleteShapes(arrowsToDelete)
  }
}

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

function getCanvasSelection(shape: TLShape): CanvasSelection {
  if (isVideoNodeShape(shape)) {
    return { shapeId: shape.id, kind: "video" }
  }

  if (isImageHolderShape(shape)) {
    return { shapeId: shape.id, kind: "holder" }
  }

  if (shape.type === "image") {
    return {
      shapeId: shape.id,
      versionId: getCanvasImageVersionId(shape),
      kind: "image",
    }
  }

  return { shapeId: shape.id, kind: "other" }
}

function getSelection(editor: Editor): CanvasSelection | null {
  const shape = editor.getOnlySelectedShape()
  return shape ? getCanvasSelection(shape) : null
}

function getAgentSelections(editor: Editor) {
  return editor.getSelectedShapeIds().flatMap((shapeId) => {
    const shape = editor.getShape(shapeId)
    return shape ? [getCanvasSelection(shape)] : []
  })
}

function getLatestImageShapeIdFromHolder(editor: Editor, holderId: TLShapeId) {
  const holder = editor.getShape(holderId)
  const meta = shapeMeta(holder)
  const latestImageShapeId =
    typeof meta.latestImageShapeId === "string" ? (meta.latestImageShapeId as TLShapeId) : null

  if (latestImageShapeId) {
    const latestImage = editor.getShape(latestImageShapeId)
    if (latestImage?.type === "image") return latestImageShapeId
  }

  const childImages = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === "image" && shape.parentId === holderId)
    .map((shape) => shape.id as TLShapeId)

  return childImages[childImages.length - 1] ?? null
}

function getCodexSourceImageFromSelection(editor: Editor, selection: CanvasSelection | null) {
  if (!selection) return null

  if (selection.kind === "image") {
    const imageShape = editor.getShape(selection.shapeId as TLShapeId)
    const imageBounds = editor.getShapePageBounds(selection.shapeId as TLShapeId)
    if (!imageShape || imageShape.type !== "image" || !imageBounds) return null
    const meta = shapeMeta(imageShape)

    return {
      imageId: imageShape.id as TLShapeId,
      versionId: typeof meta.versionId === "string" ? meta.versionId : selection.versionId,
      bounds: toBounds(imageBounds),
    }
  }

  if (selection.kind === "holder") {
    const holderShape = editor.getShape(selection.shapeId as TLShapeId)
    const holderBounds = editor.getShapePageBounds(selection.shapeId as TLShapeId)
    const imageId = getLatestImageShapeIdFromHolder(editor, selection.shapeId as TLShapeId)
    if (!holderShape || !holderBounds || !imageId) return null
    const imageShape = editor.getShape(imageId)
    const imageMeta = shapeMeta(imageShape)
    const holderMeta = shapeMeta(holderShape)

    return {
      imageId,
      versionId:
        typeof imageMeta.versionId === "string"
          ? imageMeta.versionId
          : typeof holderMeta.latestVersionId === "string"
            ? holderMeta.latestVersionId
            : undefined,
      bounds: toBounds(holderBounds),
    }
  }

  return null
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
    if (sourceShape?.type === "image" && annotationBounds && getImageShapeSource(editor, sourceShape.id as TLShapeId)) {
      return {
        imageId: sourceShape.id as TLShapeId,
        versionId: typeof sourceMeta.versionId === "string" ? sourceMeta.versionId : externalVersionIdForShape(sourceShape.id),
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
      if (shape.type !== "image" || !getImageShapeSource(editor, shape.id as TLShapeId)) return null
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
  const versionId = typeof meta.versionId === "string" ? meta.versionId : externalVersionIdForShape(image.id)

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

function getPromptFromSelectedAnnotationShapes(editor: Editor, shapeIds: string[]) {
  return shapeIds
    .map((id) => {
      const shape = editor.getShape(id as TLShapeId)
      if (!shape || !ANNOTATION_TYPES.has(shape.type)) return ""
      return getAnnotationText(editor, shape.id as TLShapeId)
    })
    .filter(Boolean)
    .join("\n")
    .trim()
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
  const mediaBounds = options.parentId ? insetCanvasMediaBounds(bounds) : bounds
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
    x: mediaBounds.x,
    y: mediaBounds.y,
    parentId: options.parentId,
    props: {
      w: mediaBounds.w,
      h: mediaBounds.h,
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

function attachVersionLinkToImage(
  editor: Editor,
  imageId: TLShapeId,
  sourceShapeId: TLShapeId,
  sourceAnnotationIds?: Array<string | TLShapeId>
) {
  const imageShape = editor.getShape(imageId)
  if (!imageShape) return

  editor.updateShape({
    id: imageId,
    type: imageShape.type,
    meta: {
      ...imageShape.meta,
      sourceShapeId,
      sourceAnnotationIds: sourceAnnotationIds ?? [],
    },
  })
}

function findImageShapeByVersionId(editor: Editor, versionId?: string) {
  if (!versionId) return null

  const shape = editor.getCurrentPageShapes().find((shape) => {
    const meta = shapeMeta(shape)
    return shape.type === "image" && meta.versionId === versionId
  })

  return shape?.id as TLShapeId | null
}

function createImageHolderWithImage(editor: Editor, version: ImageVersion, bounds: Bounds) {
  const holderId = createShapeId()

  editor.createShape({
    id: holderId,
    type: "frame",
    x: bounds.x,
    y: bounds.y,
    props: {
      w: bounds.w,
      h: bounds.h,
      name: IMAGE_CANVAS_NAME,
      color: "blue",
    },
    meta: {
      kind: "image-holder",
      asuiNode: "image-holder",
      asuiMetaVersion: ASUI_META_VERSION,
      size: { width: Math.round(bounds.w), height: Math.round(bounds.h) },
      sizePreset: "custom",
      layoutMode: "manual",
      latestVersionId: version.versionId,
    },
  })

  const imageId = createImageShape(
    editor,
    version,
    {
      x: 0,
      y: 0,
      w: bounds.w,
      h: bounds.h,
    },
    { parentId: holderId }
  )
  const holderShape = editor.getShape(holderId)
  if (holderShape) {
    editor.updateShape({
      id: holderId,
      type: holderShape.type,
      meta: {
        ...holderShape.meta,
        latestImageShapeId: imageId,
      },
    })
  }

  return { holderId, imageId }
}

function createVideoShape(
  editor: Editor,
  {
    src,
    prompt,
    bounds,
    parentId,
    taskId,
  }: {
    src: string
    prompt: string
    bounds: Bounds
    parentId?: TLShapeId
    taskId?: string
  }
) {
  const mediaBounds = parentId ? insetCanvasMediaBounds(bounds) : bounds
  const assetId = AssetRecordType.createId()
  const shapeId = createShapeId()

  editor.createAssets([
    {
      id: assetId,
      typeName: "asset",
      type: "video",
      props: {
        w: Math.round(bounds.w),
        h: Math.round(bounds.h),
        name: `${taskId ?? shapeId}.mp4`,
        isAnimated: true,
        mimeType: "video/mp4",
        src,
      },
      meta: {
        asuiNode: "video-asset",
        asuiMetaVersion: ASUI_META_VERSION,
        taskId: taskId ?? null,
      },
    },
  ])

  editor.createShape({
    id: shapeId,
    type: "video",
    x: mediaBounds.x,
    y: mediaBounds.y,
    parentId,
    props: {
      w: mediaBounds.w,
      h: mediaBounds.h,
      time: 0,
      playing: true,
      autoplay: true,
      url: "",
      assetId,
      altText: prompt,
    },
    meta: {
      kind: "generated-video",
      asuiNode: "generated-video",
      asuiMetaVersion: ASUI_META_VERSION,
      taskId: taskId ?? null,
    },
  })

  return shapeId
}

function syncGeneratedMediaToCanvasFrame(
  editor: Editor,
  frameId: TLShapeId,
  size: CanvasSize
) {
  const mediaBounds = insetCanvasMediaBounds({
    x: 0,
    y: 0,
    w: size.width,
    h: size.height,
  })

  for (const childId of editor.getSortedChildIdsForParent(frameId)) {
    const child = editor.getShape(childId)
    const meta = shapeMeta(child)
    const isGeneratedImage =
      child?.type === "image" &&
      (meta.kind === "generated-image" || meta.asuiNode === "generated-image")
    const isGeneratedVideo =
      child?.type === "video" &&
      (meta.kind === "generated-video" || meta.asuiNode === "generated-video")
    if (!child || (!isGeneratedImage && !isGeneratedVideo)) continue

    editor.updateShape({
      id: child.id,
      type: child.type,
      x: mediaBounds.x,
      y: mediaBounds.y,
      props: {
        w: mediaBounds.w,
        h: mediaBounds.h,
      },
    })
  }
}

function syncAllGeneratedMediaToCanvasFrames(editor: Editor) {
  for (const shape of editor.getCurrentPageShapes()) {
    if (
      shape.type !== "frame" ||
      (!isImageHolderShape(shape) && !isVideoNodeShape(shape))
    ) {
      continue
    }

    syncGeneratedMediaToCanvasFrame(editor, shape.id as TLShapeId, {
      width: shape.props.w,
      height: shape.props.h,
    })
  }
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`))
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`无法读取图片：${file.name}`))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: Math.max(1, image.naturalWidth),
        height: Math.max(1, image.naturalHeight),
      })
    }
    image.onerror = () => reject(new Error("无法识别图片尺寸"))
    image.src = src
  })
}

async function createImportedImageVersion(file: File): Promise<ImageVersion> {
  const src = await readFileAsDataUrl(file)
  const dimensions = await readImageDimensions(src)
  const version: ImageVersion = {
    versionId: `imported-${crypto.randomUUID()}`,
    prompt: file.name ? `导入图片：${file.name}` : "导入图片",
    src,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: new Date().toISOString(),
  }

  try {
    return await persistImageVersion(version)
  } catch {
    return version
  }
}

function rootCanvasObstacles(editor: Editor) {
  return editor.getCurrentPageShapes().flatMap((shape) => {
    if (String(shape.parentId).startsWith("shape:")) return []
    const bounds = editor.getShapePageBounds(shape.id)
    return bounds ? [toBounds(bounds)] : []
  })
}

async function importImageFilesIntoCanvas(
  editor: Editor,
  files: File[],
  point?: { x: number; y: number }
) {
  const anchorPoint = point ?? editor.getViewportPageBounds().center
  const obstacles = rootCanvasObstacles(editor)
  const holderIds: TLShapeId[] = []
  const versions: ImageVersion[] = []

  for (const [index, file] of files.entries()) {
    const version = await createImportedImageVersion(file)
    const canvasSize = fitImportedImageCanvasSize({
      width: version.width,
      height: version.height,
    })
    const desiredBounds: Bounds = {
      x: anchorPoint.x - canvasSize.width / 2 + index * 28,
      y: anchorPoint.y - canvasSize.height / 2 + index * 28,
      w: canvasSize.width,
      h: canvasSize.height,
    }
    const hasCollision = obstacles.some((obstacle) =>
      intersects(expandBounds(desiredBounds, 20), obstacle)
    )
    const bounds = hasCollision
      ? findClearPlacement({
          anchor: desiredBounds,
          width: desiredBounds.w,
          height: desiredBounds.h,
          obstacles,
          margin: 40,
        })
      : desiredBounds
    const { holderId } = createImageHolderWithImage(editor, version, bounds)
    holderIds.push(holderId)
    versions.push(version)
    obstacles.push(bounds)
  }

  if (holderIds.length > 0) editor.select(...holderIds)
  return versions
}

function wrapLooseImageInCanvas(editor: Editor, imageShape: TLImageShape) {
  const pageBounds = editor.getShapePageBounds(imageShape.id)
  if (!pageBounds) return null
  const bounds = toBounds(pageBounds)
  const holderId = createShapeId()

  editor.createShape({
    id: holderId,
    type: "frame",
    x: bounds.x,
    y: bounds.y,
    props: {
      w: bounds.w,
      h: bounds.h,
      name: IMAGE_CANVAS_NAME,
      color: "blue",
    },
    meta: {
      kind: "image-holder",
      asuiNode: "image-holder",
      asuiMetaVersion: ASUI_META_VERSION,
      size: { width: Math.round(bounds.w), height: Math.round(bounds.h) },
      sizePreset: "custom",
      layoutMode: "manual",
      latestVersionId: getCanvasImageVersionId(imageShape),
      latestImageShapeId: imageShape.id,
    },
  })
  editor.reparentShapes([imageShape.id], holderId)
  const mediaBounds = insetCanvasMediaBounds({ x: 0, y: 0, w: bounds.w, h: bounds.h })
  editor.updateShape({
    id: imageShape.id,
    type: "image",
    x: mediaBounds.x,
    y: mediaBounds.y,
    props: {
      w: mediaBounds.w,
      h: mediaBounds.h,
    },
    meta: {
      ...imageShape.meta,
      kind: "generated-image",
      asuiNode: "generated-image",
      asuiMetaVersion: ASUI_META_VERSION,
      versionId: getCanvasImageVersionId(imageShape),
    },
  })
  return holderId
}

async function persistLooseImageAsset(editor: Editor, imageShape: TLImageShape) {
  const assetId = imageShape.props.assetId
  if (!assetId) return
  const asset = editor.getAsset(assetId)
  if (asset?.type !== "image") return
  const currentSrc = asset.props.src
  if (!currentSrc || /^https?:\/\//.test(currentSrc) || currentSrc.startsWith("/canvas-assets/")) {
    return
  }

  const resolvedSrc = await editor.resolveAssetUrl(assetId, {
    shouldResolveToOriginal: true,
  })
  if (!resolvedSrc) return
  const response = await fetch(resolvedSrc)
  if (!response.ok) return
  const blob = await response.blob()
  const dataSrc = await readFileAsDataUrl(
    new File([blob], asset.props.name || "imported-image", {
      type: blob.type || asset.props.mimeType || undefined,
    })
  )
  const localVersion: ImageVersion = {
    versionId: getCanvasImageVersionId(imageShape),
    prompt: imageShape.props.altText || asset.props.name || "导入图片",
    src: dataSrc,
    width: asset.props.w,
    height: asset.props.h,
    createdAt: new Date().toISOString(),
  }
  let version = localVersion
  try {
    version = await persistImageVersion(localVersion)
  } catch {
    // Keep a browser-readable source even when local asset persistence is unavailable.
  }
  editor.updateAssets([
    {
      ...asset,
      props: { ...asset.props, src: version.src },
      meta: {
        ...asset.meta,
        asuiNode: "image-asset",
        asuiMetaVersion: ASUI_META_VERSION,
        versionId: version.versionId,
      },
    },
  ])
}

function migrateLooseImportedImages(editor: Editor) {
  const looseImages = editor.getCurrentPageShapes().filter(
    (shape): shape is TLImageShape => {
      if (shape.type !== "image" || String(shape.parentId).startsWith("shape:")) {
        return false
      }
      const meta = shapeMeta(shape)
      return meta.kind !== "generated-image" && meta.asuiNode !== "generated-image"
    }
  )

  for (const imageShape of looseImages) {
    wrapLooseImageInCanvas(editor, imageShape)
    void persistLooseImageAsset(editor, imageShape)
  }
}

async function generateImageVersion({
  prompt,
  feedback,
  feedbackItems,
  parentVersionId,
  bounds,
  requestSize,
  sourceImageSrc,
  referenceImageSrcs,
}: {
  prompt: string
  feedback?: string
  feedbackItems?: AnnotationFeedbackItem[]
  parentVersionId?: string
  bounds: Bounds
  requestSize?: CanvasSize
  sourceImageSrc?: string
  referenceImageSrcs?: string[]
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
      referenceImageSrcs,
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

async function generateVideoResult({
  prompt,
  sourceImageSrc,
  referenceAssets,
  durationSeconds,
  resolution,
}: {
  prompt: string
  sourceImageSrc?: string
  referenceAssets: ReferenceImage[]
  durationSeconds: number
  resolution: VideoResolution
}) {
  const apiConfig = readApiConfigFromSession()
  const createResponse = await fetch("/api/videos/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...apiConfig,
      action: "create",
      prompt,
      sourceImageSrc,
      referenceAssets,
      durationSeconds,
      resolution,
    }),
  })
  const createPayload = (await createResponse.json().catch(() => ({}))) as {
    task?: {
      taskId: string
      status?: string
    }
    error?: string
  }
  if (!createResponse.ok || !createPayload.task?.taskId) {
    throw new Error(createPayload.error ?? "视频任务创建失败")
  }

  return {
    taskId: createPayload.task.taskId,
    poll: () => pollVideoTaskResult({ taskId: createPayload.task!.taskId, durationSeconds, resolution }),
  }
}

async function pollVideoTaskResult({
  taskId,
  durationSeconds,
  resolution,
}: {
  taskId: string
  durationSeconds: number
  resolution: VideoResolution
}) {
  const apiConfig = readApiConfigFromSession()
  let response: Response
  try {
    response = await fetch("/api/videos/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...apiConfig,
        action: "poll",
        taskId,
        durationSeconds,
        resolution,
      }),
    })
  } catch {
    return {
      video: null,
      status: "network-retry",
      statusText: "连接重试中",
    }
  }
  const payload = (await response.json().catch(() => ({}))) as {
    video?: {
      src: string
      taskId?: string
      status?: string
    }
    task?: {
      taskId: string
      status?: string
      statusText?: string
    }
    error?: string
  }
  if (!response.ok) {
    throw new Error(payload.error ?? "视频任务查询失败")
  }
  if (payload.video?.src) {
    return {
      video: payload.video,
      status: payload.video.status ?? "succeeded",
      statusText: "视频已生成",
    }
  }
  return {
    video: null,
    status: payload.task?.status ?? "running",
    statusText: payload.task?.statusText ?? `任务状态：${payload.task?.status ?? "running"}`,
  }
}

function formatVideoGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : "视频生成失败"
  const requestId = /request id[:：]\s*([a-zA-Z0-9_-]+)/i.exec(message)?.[1]
  const suffix = requestId ? ` 请求 ID：${requestId}` : ""

  if (/real person|person|human/i.test(message)) {
    return `视频模型拒绝了这次生成：参考图可能包含真实人物。可以换成非真人图、卡通图，或去掉人物参考后再试。${suffix}`
  }

  if (/copyright|intellectual property|trademark|brand/i.test(message)) {
    return `视频模型拒绝了这次生成：输出视频可能涉及版权、品牌或 IP 限制。建议换成原创素材，或去掉明显品牌、游戏界面、影视/动漫角色等参考后再试。${suffix}`
  }

  if (/safety|policy|rejected|blocked/i.test(message)) {
    return `视频模型安全系统拒绝了这次生成。请检查参考图和提示词后重试。${suffix}`
  }

  return message
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

function getVideoShapeSource(editor: Editor, shapeId: TLShapeId) {
  const shape = editor.getShape(shapeId)
  if (!shape || shape.type !== "video") return null

  const assetId = shape.props.assetId
  if (!assetId) return null

  const asset = editor.getAsset(assetId)
  return asset?.type === "video" ? asset.props.src : null
}

function getStringMetaValue(meta: Record<string, unknown>, key: string) {
  const value = meta[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function getStringArrayMetaValue(meta: Record<string, unknown>, key: string) {
  const value = meta[key]
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  )
}

function getContextReferenceIds(meta: Record<string, unknown>) {
  return Array.from(
    new Set([
      ...getStringArrayMetaValue(meta, "referenceIds"),
      ...getStringArrayMetaValue(meta, "referenceShapeIds"),
    ])
  )
}

function getContextNodeKind(shape: TLShape): CanvasContextInputNode["kind"] {
  if (ANNOTATION_TYPES.has(shape.type)) return "annotation"
  if (isImageHolderShape(shape)) return "holder"
  if (isVideoNodeShape(shape) || shape.type === "video") return "video"
  if (shape.type === "image") return "image"
  return "other"
}

function getContextNodeMedia(
  editor: Editor,
  shape: TLShape,
  bounds: Bounds
): CanvasContextInputMedia | undefined {
  const meta = shapeMeta(shape)

  if (shape.type === "image") {
    const src = getImageShapeSource(editor, shape.id as TLShapeId)
    if (!src) return undefined
    return {
      mediaType: "image",
      src,
      mimeType: mimeFromSrc(src),
      width: Math.max(1, Math.round(bounds.w)),
      height: Math.max(1, Math.round(bounds.h)),
    }
  }

  if (shape.type === "video") {
    const src = getVideoShapeSource(editor, shape.id as TLShapeId)
    if (!src) return undefined
    return {
      mediaType: "video",
      src,
      mimeType: "video/mp4",
      width: Math.max(1, Math.round(bounds.w)),
      height: Math.max(1, Math.round(bounds.h)),
    }
  }

  if (isVideoNodeShape(shape)) {
    const latestVideoShapeId = getStringMetaValue(meta, "latestVideoShapeId")
    const src =
      getStringMetaValue(meta, "videoSrc") ??
      (latestVideoShapeId
        ? getVideoShapeSource(editor, latestVideoShapeId as TLShapeId)
        : null)
    if (!src) return undefined
    return {
      mediaType: "video",
      src,
      mimeType: "video/mp4",
      width: Math.max(1, Math.round(bounds.w)),
      height: Math.max(1, Math.round(bounds.h)),
    }
  }

  return undefined
}

type ExportAgentCanvasContextOptions = {
  scope?: CanvasContextScope
  selection?: CanvasSelection | null
  selections?: CanvasSelection[]
  snapshotId?: string
  createdAt?: string
}

function getAgentContextNodeId(editor: Editor, selection: CanvasSelection) {
  const selectedShape = editor.getShape(selection.shapeId as TLShapeId)
  if (!selectedShape) return undefined

  if (ANNOTATION_TYPES.has(selectedShape.type)) {
    return getGeneratedImageTargetForAnnotation(
      editor,
      selectedShape.id as TLShapeId
    )?.imageId
  }

  if (isImageHolderShape(selectedShape)) {
    return (
      getLatestImageShapeIdFromHolder(editor, selectedShape.id as TLShapeId) ??
      selectedShape.id
    )
  }

  return selectedShape.id
}

function getAgentSelectionContextKey(editor: Editor) {
  return getAgentSelections(editor)
    .map((selection) => {
      const nodeId = getAgentContextNodeId(editor, selection)
      if (!nodeId) return selection.shapeId
      const shape = editor.getShape(nodeId as TLShapeId)
      const bounds = shape ? editor.getShapePageBounds(shape.id) : null
      const media = shape && bounds
        ? getContextNodeMedia(editor, shape, toBounds(bounds))
        : undefined
      return `${selection.shapeId}:${nodeId}:${media?.src ?? ""}`
    })
    .join("|")
}

export function exportAgentCanvasContextSnapshot(
  editor: Editor,
  options: ExportAgentCanvasContextOptions = {}
): CanvasContextSnapshot {
  const fallbackSelection =
    options.selection === undefined ? getSelection(editor) : options.selection
  const selections = options.selections ?? (fallbackSelection ? [fallbackSelection] : [])
  const selectedNodeIds = Array.from(
    new Set(
      selections.flatMap((selection) => {
        const nodeId = getAgentContextNodeId(editor, selection)
        return nodeId ? [nodeId] : []
      })
    )
  )
  const selectedNodeId = selectedNodeIds[0]

  const nodes = editor.getCurrentPageShapes().flatMap<CanvasContextInputNode>(
    (shape) => {
      const pageBounds = editor.getShapePageBounds(shape.id)
      if (!pageBounds) return []

      const bounds = toBounds(pageBounds)
      const meta = shapeMeta(shape)
      const isAnnotation = ANNOTATION_TYPES.has(shape.type)
      const annotationTarget = isAnnotation
        ? getGeneratedImageTargetForAnnotation(editor, shape.id as TLShapeId)
        : null
      const parentId = String(shape.parentId)

      return [
        {
          id: shape.id,
          kind: getContextNodeKind(shape),
          bounds,
          text: isAnnotation
            ? getAnnotationText(editor, shape.id as TLShapeId)
            : undefined,
          versionId:
            shape.type === "image"
              ? getCanvasImageVersionId(shape)
              : getStringMetaValue(meta, "versionId"),
          sourceNodeId:
            annotationTarget?.imageId ??
            getStringMetaValue(meta, "sourceShapeId"),
          parentNodeId: parentId.startsWith("shape:") ? parentId : undefined,
          media: getContextNodeMedia(editor, shape, bounds),
          referenceIds: getContextReferenceIds(meta),
        },
      ]
    }
  )

  return buildCanvasContextSnapshot(
    {
      scope: options.scope ?? "selection",
      selectedNodeId,
      selectedNodeIds,
      nodes,
    },
    {
      snapshotId: options.snapshotId,
      createdAt: options.createdAt,
    }
  )
}

async function getVideoNodeReferenceImages(editor: Editor, videoShapeId: TLShapeId): Promise<ReferenceImage[]> {
  const videoShape = editor.getShape(videoShapeId)
  const sourceShapeId = shapeMeta(videoShape).sourceShapeId
  if (typeof sourceShapeId !== "string") return []

  const sourceShape = editor.getShape(sourceShapeId as TLShapeId)
  const sourceMeta = shapeMeta(sourceShape)
  const imageShapeId =
    sourceShape?.type === "image"
      ? (sourceShape.id as TLShapeId)
      : typeof sourceMeta.latestImageShapeId === "string"
        ? (sourceMeta.latestImageShapeId as TLShapeId)
        : null
  if (!imageShapeId) return []

  const src = getImageShapeSource(editor, imageShapeId)
  if (!src) return []
  const imageShape = editor.getShape(imageShapeId)
  const assetId = imageShape?.type === "image" ? imageShape.props.assetId : null
  const resolvedSrc = src.startsWith("asset:")
    ? (await editor.resolveAssetUrl(assetId, { shouldResolveToOriginal: true })) ?? src
    : src

  return [
    {
      id: `video-reference-${imageShapeId}`,
      name: "上游图片",
      src: resolvedSrc,
      mediaType: "image",
    },
  ]
}

export function AiCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const viewportSyncFrameRef = useRef<number | null>(null)
  const lastSelectionKeyRef = useRef("")
  const directCanvasNodePointerRef = useRef<TLShapeId | null>(null)
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
  const [generationPanelPosition, setGenerationPanelPosition] = useState<FloatingPanelPosition | null>(null)
  const [holderViewportBounds, setHolderViewportBounds] = useState<Bounds | null>(null)
  const [nodeConnectorMenu, setNodeConnectorMenu] = useState<NodeConnectorMenu | null>(null)
  const [nodeConnectorDrag, setNodeConnectorDrag] = useState<NodeConnectorDrag | null>(null)
  const [videoNodeLinks, setVideoNodeLinks] = useState<CanvasNodeLink[]>([])
  const [versionNodeLinks, setVersionNodeLinks] = useState<CanvasNodeLink[]>([])
  const [holderSize, setHolderSize] = useState<CanvasSize>(DEFAULT_HOLDER_SIZE)
  const [floatingSize, setFloatingSize] = useState<CanvasSize>(DEFAULT_HOLDER_SIZE)
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([])
  const [agentSelectionContextKey, setAgentSelectionContextKey] = useState("")
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([])
  const [selectedHolderHasImage, setSelectedHolderHasImage] = useState(false)
  const [isCodexTaskOpen, setIsCodexTaskOpen] = useState(false)
  const [codexTaskStatus, setCodexTaskStatus] = useState<"idle" | "generating">("idle")
  const [isCanvasAgentOpen, setIsCanvasAgentOpen] = useState(false)
  const [storyboardRequestKey, setStoryboardRequestKey] = useState(0)
  const [isCanvasAgentBusy, setIsCanvasAgentBusy] = useState(false)
  const [foregroundAgentTask, setForegroundAgentTask] = useState<AgentTask>()
  const [codexTaskId, setCodexTaskId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [videoPrompt, setVideoPrompt] = useState("")
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(4)
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("720p")
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [videoReferenceImages, setVideoReferenceImages] = useState<ReferenceImage[]>([])
  const [videoUploadedReferences, setVideoUploadedReferences] = useState<ReferenceImage[]>([])
  const [status, setStatus] = useState<GenerationStatus>("idle")
  const [statusDetail, setStatusDetail] = useState("")
  const [toastMessage, setToastMessage] = useState("")
  const [versions, setVersions] = useState<ImageVersion[]>([])
  const [generationOverlay, setGenerationOverlay] = useState<{
    shapeId: TLShapeId
    bounds: Bounds
    label: string
    state: OrbState
    effect: "orb" | "scan-light"
    owner: "direct" | "agent"
  } | null>(null)
  const codexPollingTaskRef = useRef("")
  const codexResultContextRef = useRef<ResolvedCodexCanvasContext | null>(null)
  const videoPollingTaskRef = useRef("")

  const getAgentCanvasContext = useCallback(() => {
    const editor = editorRef.current
    if (!editor) throw new Error("画布尚未准备完成")
    const selections = getAgentSelections(editor)
    const snapshot = exportAgentCanvasContextSnapshot(editor, { selections })
    const viewportBounds = toBounds(editor.getViewportPageBounds())
    const occupiedBounds = editor.getCurrentPageShapes().flatMap((shape) => {
      const parentId = String(shape.parentId)
      if (parentId.startsWith("shape:")) return []
      if (
        shape.type !== "frame" &&
        shape.type !== "image" &&
        shape.type !== "video"
      ) {
        return []
      }
      const pageBounds = editor.getShapePageBounds(shape.id)
      if (!pageBounds) return []
      return [
        {
          ...toBounds(pageBounds),
          taskId: getStringMetaValue(shapeMeta(shape), "agentTaskId"),
        },
      ]
    })
    const selectedNodeIds = snapshot.selectedNodeIds ?? []
    const selectionByNodeId = new Map<string, CanvasSelection>()
    for (const selection of selections) {
      const nodeId = getAgentContextNodeId(editor, selection)
      if (nodeId && !selectionByNodeId.has(nodeId)) {
        selectionByNodeId.set(nodeId, selection)
      }
    }
    let imageReferenceIndex = 0
    let videoReferenceIndex = 0
    const selectionPreviews = selectedNodeIds.flatMap((nodeId) => {
      const sourceShape = editor.getShape(nodeId as TLShapeId)
      const sourceBounds = sourceShape
        ? editor.getShapePageBounds(sourceShape.id)
        : null
      if (!sourceShape || !sourceBounds) return []
      const sourceMedia = getContextNodeMedia(
        editor,
        sourceShape,
        toBounds(sourceBounds)
      )
      const isVideo =
        sourceMedia?.mediaType === "video" || isVideoNodeShape(sourceShape)
      const canvasIndex = isVideo
        ? ++videoReferenceIndex
        : ++imageReferenceIndex

      return [{
        selectionId: selectionByNodeId.get(nodeId)?.shapeId ?? nodeId,
        nodeId,
        label: `${isVideo ? VIDEO_CANVAS_NAME : IMAGE_CANVAS_NAME}${Math.max(1, canvasIndex)}`,
        mediaType: sourceMedia?.mediaType,
        src: sourceMedia?.src,
      }]
    })

    return {
      snapshot,
      sourceBounds: snapshot.sourceNode?.bounds,
      viewportBounds,
      occupiedBounds,
      selectionPreviews,
    }
  }, [])

  useEffect(() => {
    return () => {
      unlistenRef.current?.()
      if (viewportSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportSyncFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const timeout = window.setTimeout(() => setToastMessage(""), 5200)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  useEffect(() => {
    const closeSizeBar = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-canvas-size-bar]")) return
      const editor = editorRef.current
      if (editor) {
        const holderId = getHolderAtPagePoint(
          editor,
          getPagePointFromViewportPoint(editor, { x: event.clientX, y: event.clientY })
        )
        if (holderId) return
      }
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

    setVideoNodeLinks(getVideoNodeLinks(editor))
    setVersionNodeLinks(getVersionNodeLinks(editor))
    setSelectedShapeIds(nextSelectedShapeIds)
    setAgentSelectionContextKey(getAgentSelectionContextKey(editor))
    setSelectedAnnotationIds(
      nextSelectedShapeIds.filter((id) => {
        const shape = editor.getShape(id)
        return Boolean(shape && ANNOTATION_TYPES.has(shape.type))
      })
    )
    setSelection(nextSelection)
    setSelectedHolderHasImage(
      nextSelection?.kind === "holder" &&
        Boolean(getLatestImageShapeIdFromHolder(editor, nextSelection.shapeId as TLShapeId))
    )

    if (nextSelection?.kind === "holder") {
      const bounds = editor.getShapePageBounds(nextSelection.shapeId as TLShapeId)
      if (bounds) {
        const normalizedSize = normalizeCanvasSize({ width: bounds.w, height: bounds.h })
        const shape = editor.getShape(nextSelection.shapeId as TLShapeId)
        const meta = shapeMeta(shape)
        const anchor = editor.pageToViewport({ x: bounds.x, y: bounds.y })
        const viewportBounds = getViewportShapeBounds(editor, nextSelection.shapeId as TLShapeId)
        setHolderSize(normalizedSize)
        setFloatingSize(normalizedSize)
        setSizeBar({
          x: Math.max(16, anchor.x),
          y: Math.max(16, anchor.y - 64),
          presetId: isCanvasSizePresetId(meta.sizePreset) ? meta.sizePreset : "custom",
        })
        setGenerationPanelPosition(viewportBounds ? getFloatingPanelPosition(viewportBounds) : null)
        setHolderViewportBounds(viewportBounds)
      }
    } else if (nextSelection?.kind === "image") {
      setGenerationPanelPosition(null)
      setSizeBar(null)
      setHolderViewportBounds(getViewportShapeBounds(editor, nextSelection.shapeId as TLShapeId))
    } else if (nextSelection?.kind === "video") {
      const bounds = editor.getShapePageBounds(nextSelection.shapeId as TLShapeId)
      const viewportBounds = getViewportShapeBounds(editor, nextSelection.shapeId as TLShapeId)
      if (bounds) {
        const normalizedSize = normalizeCanvasSize({ width: bounds.w, height: bounds.h })
        const shape = editor.getShape(nextSelection.shapeId as TLShapeId)
        const meta = shapeMeta(shape)
        const anchor = editor.pageToViewport({ x: bounds.x, y: bounds.y })
        setFloatingSize(normalizedSize)
        setSizeBar({
          x: Math.max(16, anchor.x),
          y: Math.max(16, anchor.y - 64),
          presetId: isCanvasSizePresetId(meta.sizePreset) ? meta.sizePreset : "custom",
        })
      }
      setGenerationPanelPosition(viewportBounds ? getFloatingPanelPosition(viewportBounds) : null)
      setHolderViewportBounds(null)
      const selectedVideoShapeId = nextSelection.shapeId
      setVideoReferenceImages([])
      void getVideoNodeReferenceImages(editor, selectedVideoShapeId as TLShapeId).then((images) => {
        const currentSelection = getSelection(editor)
        if (currentSelection?.kind === "video" && currentSelection.shapeId === selectedVideoShapeId) {
          setVideoReferenceImages(images)
        }
      })
    } else {
      setGenerationPanelPosition(null)
      setHolderViewportBounds(null)
      setNodeConnectorMenu(null)
      setVideoReferenceImages([])
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
        .filter((annotation): annotation is ResolvedAnnotation => {
          if (!annotation) return false
          return annotation.text.trim().length > 0
        })
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

  const syncViewportUi = useCallback((editor: Editor) => {
    const nextSelection = getSelection(editor)

    if (nextSelection?.kind === "holder" || nextSelection?.kind === "video") {
      const shapeId = nextSelection.shapeId as TLShapeId
      const bounds = editor.getShapePageBounds(shapeId)
      const viewportBounds = getViewportShapeBounds(editor, shapeId)
      const nextPanelPosition = viewportBounds ? getFloatingPanelPosition(viewportBounds) : null

      setGenerationPanelPosition((current) =>
        positionsMatch(current, nextPanelPosition) ? current : nextPanelPosition
      )

      if (bounds) {
        const anchor = editor.pageToViewport({ x: bounds.x, y: bounds.y })
        setSizeBar((current) => {
          if (!current) return current

          const nextX = Math.max(16, anchor.x)
          const nextY = Math.max(16, anchor.y - 64)
          if (Math.abs(current.x - nextX) < 0.25 && Math.abs(current.y - nextY) < 0.25) {
            return current
          }

          return {
            ...current,
            x: nextX,
            y: nextY,
          }
        })
      }

      if (nextSelection.kind === "holder") {
        setHolderViewportBounds((current) =>
          boundsMatch(current, viewportBounds) ? current : viewportBounds
        )
      } else {
        setHolderViewportBounds((current) => (current === null ? current : null))
      }
    } else if (nextSelection?.kind === "image") {
      const viewportBounds = getViewportShapeBounds(editor, nextSelection.shapeId as TLShapeId)
      setGenerationPanelPosition((current) => (current === null ? current : null))
      setHolderViewportBounds((current) =>
        boundsMatch(current, viewportBounds) ? current : viewportBounds
      )
    } else {
      setGenerationPanelPosition((current) => (current === null ? current : null))
      setHolderViewportBounds((current) => (current === null ? current : null))
    }

    setVideoNodeLinks(getVideoNodeLinks(editor))
    setVersionNodeLinks(getVersionNodeLinks(editor))
    setGenerationOverlay((current) => {
      if (!current) return current
      const bounds = getViewportShapeBounds(editor, current.shapeId)
      if (!bounds) return null
      return boundsMatch(current.bounds, bounds) ? current : { ...current, bounds }
    })
  }, [])

  const scheduleViewportSync = useCallback(
    (editor: Editor) => {
      if (viewportSyncFrameRef.current !== null) return

      viewportSyncFrameRef.current = window.requestAnimationFrame(() => {
        viewportSyncFrameRef.current = null
        syncViewportUi(editor)
      })
    },
    [syncViewportUi]
  )

  const showGenerationOverlay = useCallback((
    shapeId: TLShapeId,
    label: string,
    state: OrbState = "working",
    effect: "orb" | "scan-light" = "orb"
  ) => {
    const editor = editorRef.current
    if (!editor) return

    const bounds = getViewportShapeBounds(editor, shapeId)
    if (!bounds) return

    setGenerationOverlay({ shapeId, bounds, label, state, effect, owner: "direct" })
  }, [])

  const clearGenerationOverlay = useCallback(() => {
    setGenerationOverlay(null)
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    const selectedCanvasId = foregroundAgentTask?.selectedCanvasId
    if (!editor || !selectedCanvasId) {
      setGenerationOverlay((current) =>
        current?.owner === "agent" ? null : current
      )
      return
    }

    const shapeId = selectedCanvasId as TLShapeId
    const bounds = getViewportShapeBounds(editor, shapeId)
    if (!bounds) {
      setGenerationOverlay((current) =>
        current?.owner === "agent" ? null : current
      )
      return
    }
    const mediaType = foregroundAgentTask.compiledPrompt?.outputs[0]?.mediaType
    const statusPresentation: Partial<
      Record<AgentTask["status"], { label: string; state: OrbState }>
    > = {
      queued: { label: "等待 Agent 执行", state: "listening" },
      understanding: { label: "Agent 正在理解需求", state: "listening" },
      "reading-skill": { label: "Agent 正在读取 Skill", state: "searching" },
      "reading-canvas": { label: "Agent 正在读取画布", state: "searching" },
      "compiling-prompt": { label: "Agent 正在整理提示词", state: "composing" },
      planning: { label: "Agent 正在规划步骤", state: "solving" },
      executing: {
        label: `Agent 正在生成${mediaType === "video" ? "视频" : "图片"}`,
        state: "working",
      },
      "writing-canvas": { label: "Agent 正在写回画布", state: "shaping" },
    }
    const presentation = statusPresentation[foregroundAgentTask.status]
    if (!presentation) return

    setGenerationOverlay((current) =>
      current?.owner === "direct"
        ? current
        : {
            shapeId,
            bounds,
            label: presentation.label,
            state: presentation.state,
            effect: "scan-light",
            owner: "agent",
          }
    )
  }, [foregroundAgentTask])

  const applyAgentCanvasCommands = useCallback(
    async (
      batch: AgentCanvasCommandBatch
    ): Promise<AgentCanvasCommandAcknowledgement> => {
      const editor = editorRef.current
      if (!editor) {
        return {
          batchId: batch.id,
          taskId: batch.taskId,
          status: "rejected",
          resultNodeIds: [],
          artifactNodeIds: {},
          errors: [{ message: "画布尚未准备好" }],
        }
      }

      const createdNodes = new Map<
        string,
        {
          logicalId: TLShapeId
          connectionId: TLShapeId
          artifactId: string
        }
      >()
      const resultNodeIds: string[] = []
      const artifactNodeIds: Record<string, string> = {}
      const errors: AgentCanvasCommandAcknowledgement["errors"] = []
      const createdImageVersions: ImageVersion[] = []

      for (const [commandIndex, command] of batch.commands.entries()) {
        try {
          if (command.type === "create-prompt-node") {
            const existingPrompt = editor
              .getCurrentPageShapes()
              .find((shape) => {
                if (
                  shape.type !== "frame" ||
                  !isAgentPromptShape(shape)
                ) {
                  return false
                }
                const meta = shapeMeta(shape)
                return (
                  meta.agentTaskId === batch.taskId &&
                  (meta.agentPromptNodeRef === command.nodeRef ||
                    (!meta.agentPromptNodeRef &&
                      command.nodeRef === "professional-prompt"))
                )
              })
            const promptNodeId =
              existingPrompt?.id ?? createShapeId()

            if (existingPrompt) {
              editor.updateShape({
                id: existingPrompt.id,
                type: "frame",
                x: command.bounds.x,
                y: command.bounds.y,
                props: {
                  w: command.bounds.w,
                  h: command.bounds.h,
                  name: command.title,
                },
                meta: {
                  ...existingPrompt.meta,
                  agentPromptNodeRef: command.nodeRef,
                  agentPromptContent: command.content,
                  agentPromptTitle: command.title,
                },
              })
            } else {
              editor.createShape({
                id: promptNodeId,
                type: "frame",
                x: command.bounds.x,
                y: command.bounds.y,
                props: {
                  w: command.bounds.w,
                  h: command.bounds.h,
                  name: command.title,
                  color: "grey",
                },
                meta: {
                  kind: "agent-prompt",
                  asuiNode: "agent-prompt",
                  asuiMetaVersion: ASUI_META_VERSION,
                  agentTaskId: batch.taskId,
                  agentPromptNodeRef: command.nodeRef,
                  agentPromptTitle: command.title,
                  agentPromptContent: command.content,
                },
              })
            }

            createdNodes.set(command.nodeRef, {
              logicalId: promptNodeId,
              connectionId: promptNodeId,
              artifactId: command.nodeRef,
            })
            resultNodeIds.push(promptNodeId)
            continue
          }

          if (command.type === "create-image-node") {
            let version: ImageVersion = {
              versionId: command.artifact.versionId,
              parentVersionId: command.artifact.parentVersionId,
              prompt: command.artifact.prompt,
              src: command.artifact.src,
              width: command.artifact.width,
              height: command.artifact.height,
              createdAt: command.artifact.createdAt,
            }
            try {
              version = await persistImageVersion(version)
            } catch {
              // Keep the generated result usable when local asset persistence is unavailable.
            }
            const { holderId, imageId } = createImageHolderWithImage(
              editor,
              version,
              command.bounds
            )
            const holder = editor.getShape(holderId)
            const image = editor.getShape(imageId)

            if (holder) {
              editor.updateShape({
                id: holderId,
                type: holder.type,
                meta: {
                  ...holder.meta,
                  agentTaskId: batch.taskId,
                  agentArtifactId: command.artifact.id,
                },
              })
            }
            if (image) {
              editor.updateShape({
                id: imageId,
                type: image.type,
                meta: {
                  ...image.meta,
                  agentTaskId: batch.taskId,
                  agentArtifactId: command.artifact.id,
                },
              })
            }

            createdNodes.set(command.nodeRef, {
              logicalId: holderId,
              connectionId: imageId,
              artifactId: command.artifact.id,
            })
            resultNodeIds.push(holderId)
            artifactNodeIds[command.artifact.id] = holderId
            createdImageVersions.push(version)
            continue
          }

          if (command.type === "create-video-node") {
            const videoNodeId = createShapeId()
            editor.createShape({
              id: videoNodeId,
              type: "frame",
              x: command.bounds.x,
              y: command.bounds.y,
              props: {
                w: command.bounds.w,
                h: command.bounds.h,
                name: `AI Video Holder${
                  command.artifact.durationSeconds
                    ? ` · ${command.artifact.durationSeconds}s`
                    : ""
                }${
                  command.artifact.resolution
                    ? ` · ${command.artifact.resolution}`
                    : ""
                }`,
                color: "blue",
              },
              meta: {
                kind: "video-node",
                asuiNode: "video-node",
                asuiMetaVersion: ASUI_META_VERSION,
                status: "completed",
                agentTaskId: batch.taskId,
                agentArtifactId: command.artifact.id,
              },
            })
            const videoShapeId = createVideoShape(editor, {
              src: command.artifact.src,
              prompt: command.prompt,
              bounds: {
                x: 0,
                y: 0,
                w: command.bounds.w,
                h: command.bounds.h,
              },
              parentId: videoNodeId,
              taskId: command.artifact.taskId ?? batch.taskId,
            })
            const videoNode = editor.getShape(videoNodeId)
            if (videoNode) {
              editor.updateShape({
                id: videoNodeId,
                type: videoNode.type,
                meta: {
                  ...videoNode.meta,
                  latestVideoShapeId: videoShapeId,
                },
              })
            }

            createdNodes.set(command.nodeRef, {
              logicalId: videoNodeId,
              connectionId: videoNodeId,
              artifactId: command.artifact.id,
            })
            resultNodeIds.push(videoNodeId)
            artifactNodeIds[command.artifact.id] = videoNodeId
            continue
          }

          if (command.type === "create-3d-preview-node") {
            const referenceShapeIds = command.referenceNodeRefs.map(
              (nodeRef) => {
                const referencedNode = createdNodes.get(nodeRef)
                const referencedShape = referencedNode
                  ? editor.getShape(referencedNode.logicalId)
                  : null
                if (
                  !referencedNode ||
                  !isImageHolderShape(referencedShape)
                ) {
                  throw new Error("3D 预览缺少有效的图片参考节点")
                }
                return referencedNode.logicalId
              }
            )
            const previewSpec = safe3dPreviewSpecSchema.parse({
              version: 1,
              mode: "multiview-proxy",
              title: command.title,
              referenceShapeIds,
            })
            const previewNodeId = createShapeId()
            editor.createShape({
              id: previewNodeId,
              type: "frame",
              x: command.bounds.x,
              y: command.bounds.y,
              props: {
                w: command.bounds.w,
                h: command.bounds.h,
                name: command.title,
                color: "grey",
              },
              meta: {
                kind: "3d-preview",
                asuiNode: "3d-preview",
                asuiMetaVersion: ASUI_META_VERSION,
                status: "completed",
                agentTaskId: batch.taskId,
                agent3dPreview: previewSpec,
              },
            })

            createdNodes.set(command.nodeRef, {
              logicalId: previewNodeId,
              connectionId: previewNodeId,
              artifactId: command.nodeRef,
            })
            resultNodeIds.push(previewNodeId)
            continue
          }

          if (command.type === "create-3d-model-node") {
            const previewNodeId = createShapeId()
            editor.createShape({
              id: previewNodeId,
              type: "frame",
              x: command.bounds.x,
              y: command.bounds.y,
              props: {
                w: command.bounds.w,
                h: command.bounds.h,
                name: command.artifact.spec.title,
                color: "grey",
              },
              meta: {
                kind: "3d-model",
                asuiNode: "3d-model",
                asuiMetaVersion: ASUI_META_VERSION,
                status: "completed",
                agentTaskId: batch.taskId,
                agentArtifactId: command.artifact.id,
                agent3dModel: command.artifact.spec,
              },
            })

            createdNodes.set(command.nodeRef, {
              logicalId: previewNodeId,
              connectionId: previewNodeId,
              artifactId: command.artifact.id,
            })
            resultNodeIds.push(previewNodeId)
            artifactNodeIds[command.artifact.id] = previewNodeId
            continue
          }

          if (command.type === "connect-nodes") {
            const target = createdNodes.get(command.targetNodeRef)
            const createdSource = command.sourceNodeRef
              ? createdNodes.get(command.sourceNodeRef)
              : undefined
            const sourceId =
              createdSource?.connectionId ?? command.sourceNodeId
            const source = sourceId
              ? editor.getShape(sourceId as TLShapeId)
              : null
            const connectionTarget = target
              ? editor.getShape(target.connectionId)
              : null
            if (!target || !source || !connectionTarget) {
              throw new Error("无法连接生成结果与来源画布")
            }
            editor.updateShape({
              id: target.connectionId,
              type: connectionTarget.type,
              meta: {
                ...connectionTarget.meta,
                sourceShapeId: source.id,
                agentTaskId: batch.taskId,
              },
            })
            continue
          }

          if (command.type === "set-recommended-result") {
            const target = createdNodes.get(command.nodeRef)
            const shape = target ? editor.getShape(target.logicalId) : null
            if (!target || !shape) {
              throw new Error("找不到需要推荐的生成结果")
            }
            editor.updateShape({
              id: target.logicalId,
              type: shape.type,
              meta: {
                ...shape.meta,
                recommendedResult: true,
              },
            })
            continue
          }

          const focusIds = command.nodeRefs
            .map((nodeRef) => createdNodes.get(nodeRef)?.logicalId)
            .filter((shapeId): shapeId is TLShapeId => Boolean(shapeId))
          if (focusIds.length === 0) {
            throw new Error("找不到需要聚焦的生成结果")
          }
          const promptIds = editor
            .getCurrentPageShapes()
            .filter(
              (shape): shape is TLFrameShape =>
                shape.type === "frame" &&
                isAgentPromptShape(shape) &&
                getStringMetaValue(shapeMeta(shape), "agentTaskId") ===
                  batch.taskId
            )
            .map((shape) => shape.id)
          editor.select(...new Set([...promptIds, ...focusIds]))
          const taskBounds = editor.getSelectionPageBounds()
          editor.select(...focusIds)
          if (taskBounds) {
            editor.zoomToBounds(taskBounds, {
              inset: 64,
              animation: { duration: 240 },
            })
          } else {
            editor.zoomToSelection({ animation: { duration: 240 } })
          }
        } catch (error) {
          errors.push({
            commandIndex,
            message: errorMessage(error, "画布命令执行失败"),
          })
        }
      }

      if (createdImageVersions.length > 0) {
        setVersions((current) => {
          const incomingIds = new Set(
            createdImageVersions.map((version) => version.versionId)
          )
          return [
            ...current.filter(
              (version) => !incomingIds.has(version.versionId)
            ),
            ...createdImageVersions,
          ]
        })
      }
      setVideoNodeLinks(getVideoNodeLinks(editor))
      setVersionNodeLinks(getVersionNodeLinks(editor))

      const commandStatus =
        resultNodeIds.length === 0
          ? "rejected"
          : errors.length > 0
            ? "partial"
            : "applied"

      return {
        batchId: batch.id,
        taskId: batch.taskId,
        status: commandStatus,
        resultNodeIds,
        artifactNodeIds,
        errors,
      }
    },
    []
  )

  useEffect(
    () => canvasCommandBridge.subscribe(applyAgentCanvasCommands),
    [applyAgentCanvasCommands]
  )

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      applyAsuiCanvasTheme(editor)
      editor.user.updateUserPreferences({
        colorScheme: "dark",
        isSnapMode: readCanvasSnapModePreference(),
      })
      migrateVersionLinkArrows(editor)
      syncAllGeneratedMediaToCanvasFrames(editor)
      migrateLooseImportedImages(editor)
      editor.registerExternalContentHandler("files", async (content) => {
        const imageFiles = content.files.filter((file) =>
          file.type.toLowerCase().startsWith("image/")
        )
        const remainingFiles = content.files.filter(
          (file) => !file.type.toLowerCase().startsWith("image/")
        )

        if (imageFiles.length > 0) {
          editor.markHistoryStoppingPoint("import-images")
          try {
            const importedVersions = await importImageFilesIntoCanvas(
              editor,
              imageFiles,
              content.point
            )
            setVersions((current) => [...current, ...importedVersions])
          } catch (reason) {
            setToastMessage(errorMessage(reason, "图片导入失败"))
          }
        }

        if (remainingFiles.length > 0) {
          const assets = (
            await Promise.all(
              remainingFiles.map((file) =>
                editor.getAssetForExternalContent({ type: "file", file })
              )
            )
          ).filter((asset): asset is TLAsset => Boolean(asset))
          const position = content.point ?? editor.getViewportPageBounds().center
          await createShapesForAssets(editor, assets, position)
        }
      })
      const canvasNameUpdates = editor
        .getCurrentPageShapes()
        .filter(
          (shape): shape is TLFrameShape =>
            shape.type === "frame" && (isImageHolderShape(shape) || isVideoNodeShape(shape))
        )
        .map((shape) => ({
          id: shape.id,
          type: "frame" as const,
          props: {
            name: isVideoNodeShape(shape) ? VIDEO_CANVAS_NAME : IMAGE_CANVAS_NAME,
          },
        }))
      if (canvasNameUpdates.length > 0) editor.updateShapes(canvasNameUpdates)
      const staleVideoLinks = editor
        .getCurrentPageShapes()
        .filter((shape) => {
          const meta = shapeMeta(shape)
          return (
            shape.type === "arrow" &&
            (meta.kind === "video-link" ||
              meta.asuiNode === "video-link" ||
              meta.kind === "version-link" ||
              meta.asuiNode === "version-link")
          )
        })
        .map((shape) => shape.id)
      if (staleVideoLinks.length > 0) {
        editor.deleteShapes(staleVideoLinks)
      }
      syncSelection(editor)
      syncViewportUi(editor)
      lastSelectionKeyRef.current = editor.getSelectedShapeIds().join("|")
      unlistenRef.current?.()

      const stopDocumentListener = editor.store.listen(() => {
        syncSelection(editor)
        scheduleViewportSync(editor)
      }, {
        source: "all",
        scope: "document",
      })

      const stopSessionListener = editor.store.listen(() => {
        const selectionKey = editor.getSelectedShapeIds().join("|")
        if (selectionKey !== lastSelectionKeyRef.current) {
          lastSelectionKeyRef.current = selectionKey
          syncSelection(editor)

          const selectedShape = editor.getOnlySelectedShape()
          const outermostCanvasNodeId = getCanvasNodeFrameIdForDirectHit(
            editor,
            selectedShape
          )
          if (
            selectedShape &&
            outermostCanvasNodeId &&
            selectedShape.id !== outermostCanvasNodeId &&
            !editor.isIn("select.crop") &&
            !editor.getCroppingShapeId()
          ) {
            queueMicrotask(() => {
              const currentSelectedShape = editor.getOnlySelectedShape()
              if (
                currentSelectedShape?.id !== selectedShape.id ||
                editor.isIn("select.crop") ||
                editor.getCroppingShapeId()
              ) {
                return
              }

              editor.select(outermostCanvasNodeId)
            })
          }
        }
        scheduleViewportSync(editor)
      }, {
        source: "all",
        scope: "session",
      })

      unlistenRef.current = () => {
        stopDocumentListener()
        stopSessionListener()
      }
    },
    [scheduleViewportSync, syncSelection, syncViewportUi]
  )

  const handleCanvasPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      directCanvasNodePointerRef.current = null
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest(".canvas-main-toolbar-shell")) return
      const editor = editorRef.current
      if (!editor) return
      if (editor.getCurrentToolId() !== "select") return
      if (editor.isIn("select.crop")) return

      const viewportPoint = { x: event.clientX, y: event.clientY }
      const pagePoint = getPagePointFromViewportPoint(editor, viewportPoint)
      const hitShape = editor.getShapeAtPoint(pagePoint, {
        hitInside: true,
        hitFrameInside: true,
        margin: 0,
        renderingOnly: true,
      })
      const canvasNodeId = getCanvasNodeFrameIdForDirectHit(editor, hitShape)
      if (!canvasNodeId) return
      directCanvasNodePointerRef.current = canvasNodeId
      if (editor.getOnlySelectedShapeId() === canvasNodeId) return

      editor.select(canvasNodeId)
      syncSelection(editor)
    },
    [syncSelection]
  )

  const handleCanvasPointerUpCapture = useCallback(() => {
    const canvasNodeId = directCanvasNodePointerRef.current
    directCanvasNodePointerRef.current = null
    if (!canvasNodeId) return

    queueMicrotask(() => {
      const editor = editorRef.current
      if (!editor || editor.isIn("select.crop") || !editor.getShape(canvasNodeId)) return

      editor.select(canvasNodeId)
      syncSelection(editor)
    })
  }, [syncSelection])

  const handleCanvasPointerCancelCapture = useCallback(() => {
    directCanvasNodePointerRef.current = null
  }, [])

  const openNodeConnectorMenu = useCallback(
    ({
      sourceShapeId,
      side,
      viewportPoint,
      pagePoint,
    }: {
      sourceShapeId: TLShapeId
      side: ConnectorSide
      viewportPoint: { x: number; y: number }
      pagePoint?: { x: number; y: number }
    }) => {
      setNodeConnectorMenu({
        x: viewportPoint.x,
        y: viewportPoint.y,
        sourceShapeId,
        side,
        pagePoint,
      })
    },
    []
  )

  const createVideoNodeFromConnector = useCallback(() => {
    const editor = editorRef.current
    const menu = nodeConnectorMenu
    if (!editor || !menu) return

    const sourceBounds = editor.getShapePageBounds(menu.sourceShapeId)
    if (!sourceBounds) return

    const videoWidth = 360
    const videoHeight = 220
    const source = toBounds(sourceBounds)
    const targetCenter =
      menu.pagePoint ??
      (menu.side === "right"
        ? { x: source.x + source.w + 260, y: source.y + source.h / 2 }
        : { x: source.x - 260, y: source.y + source.h / 2 })
    const videoId = createShapeId()
    const videoX = targetCenter.x - videoWidth / 2
    const videoY = targetCenter.y - videoHeight / 2

    editor.createShape({
      id: videoId,
      type: "frame",
      x: videoX,
      y: videoY,
      props: {
        w: videoWidth,
        h: videoHeight,
        name: VIDEO_CANVAS_NAME,
      },
      meta: {
        kind: "video-node",
        asuiNode: "video-node",
        asuiMetaVersion: ASUI_META_VERSION,
        sourceShapeId: menu.sourceShapeId,
        status: "draft",
      },
    })

    editor.select(videoId)
    setVideoNodeLinks(getVideoNodeLinks(editor))
    window.requestAnimationFrame(() => setVideoNodeLinks(getVideoNodeLinks(editor)))
    setNodeConnectorMenu(null)
  }, [nodeConnectorMenu])

  const startNodeConnector = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, side: ConnectorSide) => {
      if (selection?.kind !== "holder" && selection?.kind !== "image") return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      setNodeConnectorMenu(null)
      setNodeConnectorDrag({
        sourceShapeId: selection.shapeId as TLShapeId,
        side,
        start: { x: event.clientX, y: event.clientY },
        current: { x: event.clientX, y: event.clientY },
        active: false,
      })
    },
    [selection]
  )

  const updateNodeConnector = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    setNodeConnectorDrag((current) => {
      if (!current) return current
      const next = { x: event.clientX, y: event.clientY }
      const distance = Math.hypot(next.x - current.start.x, next.y - current.start.y)
      return {
        ...current,
        current: next,
        active: current.active || distance > 8,
      }
    })
  }, [])

  const endNodeConnector = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const drag = nodeConnectorDrag
      if (!drag) return

      const editor = editorRef.current
      const viewportPoint = drag.active ? { x: event.clientX, y: event.clientY } : drag.start
      const pagePoint = editor ? getPagePointFromViewportPoint(editor, viewportPoint) : undefined
      openNodeConnectorMenu({
        sourceShapeId: drag.sourceShapeId,
        side: drag.side,
        viewportPoint,
        pagePoint: drag.active ? pagePoint : undefined,
      })
      setNodeConnectorDrag(null)
    },
    [nodeConnectorDrag, openNodeConnectorMenu]
  )

  const updateHolderSize = useCallback(
    (nextSize: CanvasSize, nextPreset: CanvasSizePresetId = "custom") => {
      const normalizedSize = normalizeCanvasSize(nextSize)
      setHolderSize(normalizedSize)
      setFloatingSize(normalizedSize)

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
            name: IMAGE_CANVAS_NAME,
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
        syncGeneratedMediaToCanvasFrame(editor, holderId, normalizedSize)
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

  const updateVideoNodeSize = useCallback(
    (nextSize: CanvasSize, nextPreset: CanvasSizePresetId = "custom") => {
      const normalizedSize = normalizeCanvasSize(nextSize)
      setFloatingSize(normalizedSize)

      const editor = editorRef.current
      if (!editor || selection?.kind !== "video") return

      const videoId = selection.shapeId as TLShapeId
      const videoShape = editor.getShape(videoId)
      if (!videoShape || videoShape.type !== "frame") return

      const bounds = editor.getShapePageBounds(videoId)
      if (!bounds) return

      const nextX = bounds.x + bounds.w / 2 - normalizedSize.width / 2
      const nextY = bounds.y + bounds.h / 2 - normalizedSize.height / 2

      editor.updateShape({
        id: videoId,
        type: "frame",
        x: nextX,
        y: nextY,
        props: {
          w: normalizedSize.width,
          h: normalizedSize.height,
          name: VIDEO_CANVAS_NAME,
        },
        meta: {
          ...videoShape.meta,
          kind: "video-node",
          asuiNode: "video-node",
          asuiMetaVersion: ASUI_META_VERSION,
          size: normalizedSize,
          sizePreset: nextPreset,
        },
      })
      syncGeneratedMediaToCanvasFrame(editor, videoId, normalizedSize)
      setVideoNodeLinks(getVideoNodeLinks(editor))
    },
    [selection]
  )

  const updateSelectedCanvasSize = useCallback(
    (nextSize: CanvasSize, nextPreset: CanvasSizePresetId = "custom") => {
      if (selection?.kind === "video") {
        updateVideoNodeSize(nextSize, nextPreset)
        return
      }
      updateHolderSize(nextSize, nextPreset)
    },
    [selection?.kind, updateHolderSize, updateVideoNodeSize]
  )

  const applySelectedPreset = useCallback(
    (presetId: CanvasSizePresetId) => {
      updateSelectedCanvasSize(resolveCanvasSizePreset(presetId, floatingSize), presetId)
    },
    [floatingSize, updateSelectedCanvasSize]
  )

  const createHolder = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    clearGenerationOverlay()
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
        name: IMAGE_CANVAS_NAME,
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
  }, [clearGenerationOverlay, holderSize])

  const createStandaloneVideoNode = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    clearGenerationOverlay()

    const center = editor.getViewportPageBounds().center
    const videoWidth = 360
    const videoHeight = 220
    const videoId = createShapeId()

    editor.createShape({
      id: videoId,
      type: "frame",
      x: center.x - videoWidth / 2,
      y: center.y - videoHeight / 2,
      props: {
        w: videoWidth,
        h: videoHeight,
        name: VIDEO_CANVAS_NAME,
      },
      meta: {
        kind: "video-node",
        asuiNode: "video-node",
        asuiMetaVersion: ASUI_META_VERSION,
        status: "draft",
        creationMode: "standalone",
      },
    })

    setVideoPrompt("")
    setVideoReferenceImages([])
    setVideoUploadedReferences([])
    editor.select(videoId)
    editor.zoomToSelection({ animation: { duration: 220 } })
    setStatus("idle")
    setStatusDetail("")
  }, [clearGenerationOverlay])

  const fillHolder = useCallback(async (options: { rethrow?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor || selection?.kind !== "holder") return
    const holderId = selection.shapeId as TLShapeId
    const bounds = editor.getShapePageBounds(holderId)
    if (!bounds) return

    showGenerationOverlay(holderId, "正在生成图片", "shaping")
    setStatus("generating")
    setStatusDetail("")
    try {
      const imageBounds = toBounds(bounds)
      const version = await persistImageVersion(
        await generateImageVersion({
          prompt,
          bounds: imageBounds,
          referenceImageSrcs: referenceImages.map((image) => image.src),
        })
      )
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
      editor.select(holderId)
      setVersions((current) => [...current, version])
      setStatus("success")
      clearGenerationOverlay()
    } catch (error) {
      console.error("Failed to fill image holder", error)
      const message = errorMessage(error, "图片生成失败")
      editor.select(holderId)
      setStatus("error")
      setStatusDetail(message)
      setToastMessage(message)
      clearGenerationOverlay()
      if (options.rethrow) throw error
    }
  }, [clearGenerationOverlay, prompt, referenceImages, selection, showGenerationOverlay])

  const editFromAnnotation = useCallback(async (options: { rethrow?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor || !annotationAction) return
    const sourceBounds = editor.getShapePageBounds(annotationAction.imageId)
    if (!sourceBounds) return
    const source = versions.find((version) => version.versionId === annotationAction.versionId)

    showGenerationOverlay(annotationAction.imageId, "正在生成新版本", "composing", "scan-light")
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
        parentVersionId: parentVersionIdFromCanvasVersionId(annotationAction.versionId),
        bounds: imageBounds,
        requestSize: resolveEditRequestSize(source, sourceBounds),
        sourceImageSrc,
      }))
      const { holderId, imageId } = createImageHolderWithImage(editor, version, imageBounds)
      attachVersionLinkToImage(editor, imageId, annotationAction.imageId, [annotationAction.annotationId])
      setVersionNodeLinks(getVersionNodeLinks(editor))
      editor.select(holderId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, version])
      setStatus("success")
      clearGenerationOverlay()
    } catch (error) {
      console.error("Failed to generate from annotation", error)
      const message = errorMessage(error, "图片生成失败")
      setStatus("error")
      setStatusDetail(message)
      setToastMessage(message)
      clearGenerationOverlay()
      if (options.rethrow) throw error
    }
  }, [annotationAction, clearGenerationOverlay, prompt, showGenerationOverlay, versions])

  const cutoutFromAnnotation = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || !annotationAction) return
    const sourceBounds = editor.getShapePageBounds(annotationAction.imageId)
    if (!sourceBounds) return
    const sourceImageSrc = getImageShapeSource(editor, annotationAction.imageId)
    const regionBounds = getCutoutRegionBounds(editor, annotationAction.imageId, annotationAction.annotationId)
    if (!sourceImageSrc || !regionBounds) return

    showGenerationOverlay(annotationAction.imageId, "正在启动抠图服务", "searching", "scan-light")
    setStatus("editing")
    setStatusDetail("正在抠取圈选区域主体")
    try {
      const cropped = await cropImageRegionToDataUrl(sourceImageSrc, toBounds(sourceBounds), regionBounds)
      const version = await runWithAutoManagedCutoutService({
        onPhase: (phase) => {
          const label = cutoutPhaseLabel[phase]
          setStatusDetail(label)
          showGenerationOverlay(
            annotationAction.imageId,
            label,
            phase === "processing" ? "working" : "searching",
            "scan-light"
          )
        },
        run: async () =>
          persistImageVersion(
            await generateCutoutVersion({
              imageSrc: cropped.src,
              width: cropped.width,
              height: cropped.height,
            })
          ),
      })
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
      clearGenerationOverlay()
    } catch (error) {
      console.error("Failed to cut out annotation region", error)
      const message = errorMessage(error, "抠图失败")
      setStatus("error")
      setStatusDetail(message)
      setToastMessage(message)
      clearGenerationOverlay()
    }
  }, [annotationAction, clearGenerationOverlay, showGenerationOverlay])

  const cutoutSelectedHolder = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || selection?.kind !== "holder") return

    const holderId = selection.shapeId as TLShapeId
    const sourceImageId = getLatestImageShapeIdFromHolder(editor, holderId)
    const sourceImageShape = sourceImageId ? editor.getShape(sourceImageId) : null
    const holderBounds = editor.getShapePageBounds(holderId)
    const sourceImageSrc = sourceImageId ? getImageShapeSource(editor, sourceImageId) : null
    if (!sourceImageId || !sourceImageShape || sourceImageShape.type !== "image" || !holderBounds || !sourceImageSrc) {
      return
    }

    const sourceAsset = sourceImageShape.props.assetId
      ? editor.getAsset(sourceImageShape.props.assetId)
      : null
    const sourceWidth =
      sourceAsset?.type === "image"
        ? sourceAsset.props.w
        : Math.max(1, Math.round(holderBounds.w))
    const sourceHeight =
      sourceAsset?.type === "image"
        ? sourceAsset.props.h
        : Math.max(1, Math.round(holderBounds.h))
    const sourceVersionId = getCanvasImageVersionId(sourceImageShape)

    showGenerationOverlay(holderId, "正在启动抠图服务", "searching", "scan-light")
    setStatus("editing")
    setStatusDetail("正在启动抠图服务")

    try {
      const version = await runWithAutoManagedCutoutService({
        onPhase: (phase) => {
          const label = cutoutPhaseLabel[phase]
          setStatusDetail(label)
          showGenerationOverlay(
            holderId,
            label,
            phase === "processing" ? "working" : "searching",
            "scan-light"
          )
        },
        run: async () => {
          const cutoutVersion = await generateCutoutVersion({
            imageSrc: sourceImageSrc,
            width: sourceWidth,
            height: sourceHeight,
          })
          return persistImageVersion({
            ...cutoutVersion,
            parentVersionId: parentVersionIdFromCanvasVersionId(sourceVersionId),
          })
        },
      })
      const obstacles = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.id !== holderId && shape.parentId !== holderId)
        .map((shape) => editor.getShapePageBounds(shape.id))
        .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
        .map(toBounds)
      const resultBounds = findClearPlacement({
        anchor: toBounds(holderBounds),
        width: holderBounds.w,
        height: holderBounds.h,
        obstacles,
        margin: 190,
      })
      const { holderId: resultHolderId, imageId: resultImageId } =
        createImageHolderWithImage(editor, version, resultBounds)
      attachVersionLinkToImage(editor, resultImageId, sourceImageId)
      setVersionNodeLinks(getVersionNodeLinks(editor))
      setVersions((current) => [...current, version])
      editor.select(resultHolderId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setStatus("success")
      setStatusDetail("")
      clearGenerationOverlay()
    } catch (error) {
      console.error("Failed to cut out selected image holder", error)
      const message = errorMessage(error, "抠图失败")
      editor.select(holderId)
      setStatus("error")
      setStatusDetail(message)
      setToastMessage(message)
      clearGenerationOverlay()
    }
  }, [clearGenerationOverlay, selection, showGenerationOverlay])

  const editFromAllAnnotations = useCallback(async (options: { rethrow?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor || !multiAnnotationAction) return
    const sourceBounds = editor.getShapePageBounds(multiAnnotationAction.imageId)
    if (!sourceBounds) return
    const source = versions.find((version) => version.versionId === multiAnnotationAction.versionId)

    showGenerationOverlay(
      multiAnnotationAction.imageId,
      "正在整合多个标注",
      "solving",
      "scan-light"
    )
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
          parentVersionId: parentVersionIdFromCanvasVersionId(multiAnnotationAction.versionId),
          bounds: imageBounds,
          requestSize: resolveEditRequestSize(source, sourceBounds),
          sourceImageSrc,
        })
      )
      const { holderId, imageId } = createImageHolderWithImage(editor, version, imageBounds)
      attachVersionLinkToImage(
        editor,
        imageId,
        multiAnnotationAction.imageId,
        multiAnnotationAction.annotations.map((annotation) => annotation.annotationId)
      )
      setVersionNodeLinks(getVersionNodeLinks(editor))
      editor.select(holderId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, version])
      setStatus("success")
      clearGenerationOverlay()
    } catch (error) {
      console.error("Failed to generate from annotations", error)
      const message = errorMessage(error, "图片生成失败")
      setStatus("error")
      setStatusDetail(message)
      setToastMessage(message)
      clearGenerationOverlay()
      if (options.rethrow) throw error
    }
  }, [clearGenerationOverlay, multiAnnotationAction, prompt, showGenerationOverlay, versions])

  const insertCodexResultVersion = useCallback(
    async (version: ImageVersion) => {
      const editor = editorRef.current
      if (!editor) return

      const savedVersion = await persistImageVersion(version)
      const codexContext = codexResultContextRef.current
      const sourceImageId =
        (typeof codexContext?.sourceShapeId === "string" ? (codexContext.sourceShapeId as TLShapeId) : null) ??
        multiAnnotationAction?.imageId ??
        annotationAction?.imageId ??
        findImageShapeByVersionId(editor, savedVersion.parentVersionId)
      const sourceBounds = sourceImageId ? editor.getShapePageBounds(sourceImageId) : null
      const sourceAnnotationIds =
        codexContext?.annotationIds ??
        multiAnnotationAction?.annotations.map((annotation) => annotation.annotationId) ??
        (annotationAction ? [annotationAction.annotationId] : [])

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
        const { holderId, imageId } = createImageHolderWithImage(editor, savedVersion, imageBounds)
        attachVersionLinkToImage(
          editor,
          imageId,
          sourceImageId,
          sourceAnnotationIds
        )
        setVersionNodeLinks(getVersionNodeLinks(editor))
        editor.select(holderId)
        editor.zoomToSelection({ animation: { duration: 240 } })
        setVersions((current) => [...current, savedVersion])
        setStatus("success")
        setStatusDetail("")
        return
      }

      if (selection?.kind === "holder") {
        const holderId = selection.shapeId as TLShapeId
        const holderBounds = editor.getShapePageBounds(holderId)
        const holderShape = editor.getShape(holderId)
        if (holderBounds && isImageHolderShape(holderShape)) {
          const imageBounds = toBounds(holderBounds)
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
          editor.select(holderId)
          setVersions((current) => [...current, savedVersion])
          setStatus("success")
          setStatusDetail("")
          return
        }
      }

      const viewport = editor.getViewportPageBounds()
      const width = Math.min(savedVersion.width, Math.max(240, viewport.w * 0.4))
      const height = Math.max(120, width * (savedVersion.height / Math.max(1, savedVersion.width)))
      const { holderId } = createImageHolderWithImage(editor, savedVersion, {
        x: viewport.x + viewport.w / 2 - width / 2,
        y: viewport.y + viewport.h / 2 - height / 2,
        w: width,
        h: height,
      })
      editor.select(holderId)
      editor.zoomToSelection({ animation: { duration: 240 } })
      setVersions((current) => [...current, savedVersion])
      setStatus("success")
      setStatusDetail("")
    },
    [annotationAction, multiAnnotationAction, selection]
  )

  const waitForCodexTaskResult = useCallback(
    async (taskId: string) => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        const response = await fetch(`/api/codex-tasks?taskId=${encodeURIComponent(taskId)}`)
        if (!response.ok) continue
        const payload = (await response.json()) as {
          task?: {
            status?: string
            error?: string
            result?: {
              message?: string
              version?: ImageVersion
            }
          }
        }

        if (payload.task?.status === "done") {
          if (payload.task.result?.version) {
            await insertCodexResultVersion(payload.task.result.version)
            setToastMessage(payload.task.result.message ?? "Codex 图片任务已完成，结果已插回画布。")
          } else {
            setToastMessage("Codex 图片任务已完成，但没有返回可插入的图片结果。")
          }
          setCodexTaskStatus("idle")
          setCodexTaskId("")
          codexResultContextRef.current = null
          return
        }

        if (payload.task?.status === "failed") {
          setToastMessage(payload.task.error ?? "Codex 图片任务处理失败。")
          setCodexTaskStatus("idle")
          setCodexTaskId("")
          codexResultContextRef.current = null
          return
        }
      }

      setToastMessage("Codex 图片任务仍在处理中；请确认 codex:image-runner 正在运行。")
    },
    [insertCodexResultVersion]
  )

  useEffect(() => {
    if (!codexTaskId || codexTaskStatus !== "generating" || codexPollingTaskRef.current === codexTaskId) return

    codexPollingTaskRef.current = codexTaskId
    void waitForCodexTaskResult(codexTaskId).finally(() => {
      if (codexPollingTaskRef.current === codexTaskId) {
        codexPollingTaskRef.current = ""
      }
    })
  }, [codexTaskId, codexTaskStatus, waitForCodexTaskResult])

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
      const source = getCodexSourceImageFromSelection(editor, selection)
      if (!source) return {}
      const annotations = getImageAnnotationsForGeneration(editor, source.imageId)
      const annotationIds = annotations.map((annotation) => annotation.annotationId as TLShapeId)
      const relatedAnnotationIds = annotationIds.length
        ? getRelatedAnnotationIdsForReference(editor, source.imageId, annotationIds)
        : []
      const referenceImageSrc = relatedAnnotationIds.length
        ? await exportAnnotatedReferenceImage(editor, source.imageId, relatedAnnotationIds).catch(() => null)
        : null

      return {
        sourceShapeId: source.imageId,
        versionId: source.versionId,
        annotationIds,
        sourceImageSrc: getImageShapeSource(editor, source.imageId) ?? undefined,
        referenceImageSrc: referenceImageSrc ?? undefined,
        feedbackItems: annotations.length
          ? buildUnderstoodAnnotationFeedbackItems(editor, source.imageId, annotations)
          : undefined,
        width: Math.round(source.bounds.w),
        height: Math.round(source.bounds.h),
      }
    }

    if (selection?.kind === "holder") {
      const source = getCodexSourceImageFromSelection(editor, selection)
      if (!source) return {}
      const annotations = getImageAnnotationsForGeneration(editor, source.imageId)
      const annotationIds = annotations.map((annotation) => annotation.annotationId as TLShapeId)
      const relatedAnnotationIds = annotationIds.length
        ? getRelatedAnnotationIdsForReference(editor, source.imageId, annotationIds)
        : []
      const referenceImageSrc = relatedAnnotationIds.length
        ? await exportAnnotatedReferenceImage(editor, source.imageId, relatedAnnotationIds).catch(() => null)
        : null

      return {
        sourceShapeId: source.imageId,
        versionId: source.versionId,
        annotationIds,
        sourceImageSrc: getImageShapeSource(editor, source.imageId) ?? undefined,
        referenceImageSrc: referenceImageSrc ?? undefined,
        feedbackItems: annotations.length
          ? buildUnderstoodAnnotationFeedbackItems(editor, source.imageId, annotations)
          : undefined,
        width: Math.round(source.bounds.w),
        height: Math.round(source.bounds.h),
      }
    }

    const selectedPrompt = getPromptFromSelectedAnnotationShapes(editor, editor.getSelectedShapeIds())
    if (selectedPrompt) {
      return {
        annotationIds: editor
          .getSelectedShapeIds()
          .filter((id) => {
            const shape = editor.getShape(id as TLShapeId)
            return Boolean(shape && ANNOTATION_TYPES.has(shape.type))
          }),
        prompt: selectedPrompt,
        width: holderSize.width,
        height: holderSize.height,
      }
    }

    return {}
  }, [annotationAction, holderSize.height, holderSize.width, multiAnnotationAction, selection])

  const canGenerateFromAnnotation = Boolean(annotationAction) && status !== "editing"
  const canGenerateFromAllAnnotations = Boolean(multiAnnotationAction) && status !== "editing"
  const canCutoutFromAnnotation = Boolean(annotationAction) && status !== "editing"
  const canCutoutSelectedHolder = selection?.kind === "holder" && selectedHolderHasImage
  const openStoryboardWorkflow = useCallback(() => {
    setIsCanvasAgentOpen(true)
    setStoryboardRequestKey((current) => current + 1)
  }, [])
  const fillVideoNode = useCallback(async () => {
    const editor = editorRef.current
    if (selection?.kind !== "video") return
    const videoShape = editor?.getShape(selection.shapeId as TLShapeId)
    if (!editor || !videoShape || videoShape.type !== "frame") return

    const videoBounds = editor.getShapePageBounds(videoShape.id)
    if (!videoBounds) return

    const imageReferenceCount = [...videoReferenceImages, ...videoUploadedReferences].filter(
      (reference) => reference.mediaType !== "video"
    ).length
    const videoReferenceCount = videoUploadedReferences.filter((reference) => reference.mediaType === "video").length
    const currentMeta = shapeMeta(videoShape)
    const existingTaskId = typeof currentMeta.videoTaskId === "string" ? currentMeta.videoTaskId : ""
    const isResumableTask =
      Boolean(existingTaskId) &&
      (currentMeta.status === "video-task-created" || currentMeta.status === "generating-video")
    const activeDurationSeconds =
      isResumableTask && typeof currentMeta.durationSeconds === "number"
        ? currentMeta.durationSeconds
        : videoDurationSeconds
    const activeResolution =
      isResumableTask &&
      (currentMeta.resolution === "480p" ||
        currentMeta.resolution === "720p" ||
        currentMeta.resolution === "1080p" ||
        currentMeta.resolution === "4K")
        ? (currentMeta.resolution as VideoResolution)
        : videoResolution
    const activePrompt = isResumableTask && typeof currentMeta.prompt === "string" ? currentMeta.prompt : videoPrompt.trim()
    const nextMeta = {
      ...currentMeta,
      status: "generating-video",
      prompt: activePrompt,
      durationSeconds: activeDurationSeconds,
      resolution: activeResolution,
      imageReferenceCount,
      videoReferenceCount,
      updatedAt: new Date().toISOString(),
    }

    if (existingTaskId && videoPollingTaskRef.current === existingTaskId) return
    if (existingTaskId) videoPollingTaskRef.current = existingTaskId
    showGenerationOverlay(
      videoShape.id,
      isResumableTask ? "正在恢复视频任务" : "正在提交视频任务",
      isResumableTask ? "searching" : "working"
    )
    setStatus("generating")
    setStatusDetail(isResumableTask ? "正在恢复视频任务" : "正在提交任务")
    editor.updateShape({
      id: videoShape.id,
      type: "frame",
      props: {
        name: VIDEO_CANVAS_NAME,
      },
      meta: nextMeta,
    })

    try {
      const transferableUpstreamReferences = await Promise.all(
        videoReferenceImages.map(async (reference) =>
          reference.mediaType === "video"
            ? reference
            : {
                ...reference,
                src: await normalizeVideoReferenceSource(reference.src, {
                  resolveLocalAsset: (assetId) =>
                    editor.resolveAssetUrl(assetId as TLAssetId, { shouldResolveToOriginal: true }),
                  toDataUrl: compressReferenceBlob,
                }),
              }
        )
      )
      const transferableUploadedReferences = await Promise.all(
        videoUploadedReferences.map(async (reference) =>
          reference.mediaType === "video"
            ? reference
            : {
                ...reference,
                src: await normalizeVideoReferenceSource(reference.src, {
                  resolveLocalAsset: (assetId) =>
                    editor.resolveAssetUrl(assetId as TLAssetId, { shouldResolveToOriginal: true }),
                  toDataUrl: compressReferenceBlob,
                }),
              }
        )
      )
      const sourceImageSrc = transferableUpstreamReferences.find(
        (reference) => reference.mediaType !== "video"
      )?.src
      const task = isResumableTask
        ? {
            taskId: existingTaskId,
            poll: () =>
              pollVideoTaskResult({
                taskId: existingTaskId,
                durationSeconds: activeDurationSeconds,
                resolution: activeResolution,
              }),
          }
        : await generateVideoResult({
            prompt: activePrompt,
            sourceImageSrc,
            referenceAssets: [...transferableUpstreamReferences, ...transferableUploadedReferences],
            durationSeconds: activeDurationSeconds,
            resolution: activeResolution,
          })
      videoPollingTaskRef.current = task.taskId
      editor.updateShape({
        id: videoShape.id,
        type: "frame",
        meta: {
          ...nextMeta,
          status: "video-task-created",
          videoTaskId: task.taskId,
        },
      })
      setStatusDetail("视频生成中，请稍等")
      showGenerationOverlay(videoShape.id, "正在生成视频", "working")

      let video: Awaited<ReturnType<typeof task.poll>>["video"] | null = null
      for (let attempt = 1; attempt <= 240; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt <= 2 ? 1200 : 2500))
        const pollResult = await task.poll()
        setStatusDetail(pollResult.statusText || "视频生成中，请稍等")
        const currentVideoShape = editor.getShape(videoShape.id)
        if (currentVideoShape) {
          editor.updateShape({
            id: videoShape.id,
            type: "frame",
            meta: {
              ...shapeMeta(currentVideoShape),
              status: "video-task-created",
              videoTaskId: task.taskId,
              pollStatus: pollResult.status,
              statusText: pollResult.statusText,
              pollAttempt: attempt,
              updatedAt: new Date().toISOString(),
            },
          })
        }
        video = pollResult.video
        if (video) break
      }

      if (!video) {
        throw new Error(`视频生成超时，任务 ID：${task.taskId}`)
      }

      const videoId = createVideoShape(editor, {
        src: video.src,
        prompt: videoPrompt.trim(),
        bounds: {
          x: 0,
          y: 0,
          w: toBounds(videoBounds).w,
          h: toBounds(videoBounds).h,
        },
        parentId: videoShape.id,
        taskId: video.taskId,
      })
      editor.updateShape({
        id: videoShape.id,
        type: "frame",
        meta: {
          ...nextMeta,
          status: "generated-video",
          latestVideoShapeId: videoId,
          videoTaskId: video.taskId ?? task.taskId,
          videoSrc: video.src,
        },
      })
      videoPollingTaskRef.current = ""
      editor.select(videoShape.id)
      setStatus("success")
      setStatusDetail(`${activeDurationSeconds}s · ${activeResolution} · 已生成`)
    } catch (error) {
      console.error("Failed to generate video", error)
      videoPollingTaskRef.current = ""
      const failedMessage = formatVideoGenerationError(error)
      const currentVideoShape = editor.getShape(videoShape.id)
      if (currentVideoShape) {
        editor.updateShape({
          id: videoShape.id,
          type: "frame",
          meta: {
            ...shapeMeta(currentVideoShape),
            status: "failed-video",
            error: failedMessage,
            updatedAt: new Date().toISOString(),
          },
        })
      }
      editor.select(videoShape.id)
      setStatus("error")
      setStatusDetail("")
      setToastMessage(failedMessage)
    } finally {
      clearGenerationOverlay()
    }
  }, [clearGenerationOverlay, selection, showGenerationOverlay, videoDurationSeconds, videoPrompt, videoReferenceImages, videoResolution, videoUploadedReferences])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || selection?.kind !== "video" || status === "generating") return

    const videoShape = editor.getShape(selection.shapeId as TLShapeId)
    const meta = shapeMeta(videoShape)
    const taskId = typeof meta.videoTaskId === "string" ? meta.videoTaskId : ""
    const shouldResume =
      taskId &&
      videoPollingTaskRef.current !== taskId &&
      (meta.status === "video-task-created" || meta.status === "generating-video")

    if (!shouldResume) return
    void fillVideoNode()
  }, [fillVideoNode, selection, status])

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
    <main className="canvas-app-shell">
      <div
        className="canvas-surface"
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerUpCapture={handleCanvasPointerUpCapture}
        onPointerCancelCapture={handleCanvasPointerCancelCapture}
      >
        <CanvasMainToolbarContext.Provider
          value={{
            assistantMode: CANVAS_AGENT_ENABLED ? "agent" : "codex",
            assistantOpen: CANVAS_AGENT_ENABLED ? isCanvasAgentOpen : isCodexTaskOpen,
            assistantBusy: CANVAS_AGENT_ENABLED ? isCanvasAgentBusy : codexTaskStatus === "generating",
            onCreateImageNode: createHolder,
            onCreateVideoNode: createStandaloneVideoNode,
            onToggleAssistant: () => {
              if (CANVAS_AGENT_ENABLED) {
                setIsCanvasAgentOpen((current) => !current)
              } else {
                setIsCodexTaskOpen((current) => !current)
              }
            },
            onOpenApiConfig: () => window.dispatchEvent(new Event("asui:open-api-config")),
          }}
        >
          <Tldraw
            persistenceKey={CANVAS_PERSISTENCE_KEY}
            assetUrls={TLDRAW_ASSET_URLS}
            components={TLDRAW_COMPONENTS}
            overlayUtils={TLDRAW_OVERLAY_UTILS}
            shapeUtils={TLDRAW_SHAPE_UTILS}
            onMount={handleMount}
          />
        </CanvasMainToolbarContext.Provider>
      </div>
      {generationOverlay && (
        <CanvasGenerationStatusOverlay
          bounds={generationOverlay.bounds}
          label={generationOverlay.label}
          state={generationOverlay.state}
          effect={generationOverlay.effect}
        />
      )}
      {toastMessage && (
        <div className="canvas-toast" role="status" aria-live="polite">
          <p>{toastMessage}</p>
          <Button type="button" size="icon-xs" variant="ghost" aria-label="关闭提示" onClick={() => setToastMessage("")}>
            ×
          </Button>
        </div>
      )}
      {videoNodeLinks.length + versionNodeLinks.length > 0 && (
        <svg className="video-node-link-layer" aria-hidden="true">
          {[...videoNodeLinks, ...versionNodeLinks].map((link) => {
            const controlOffset = Math.max(80, Math.abs(link.target.x - link.source.x) * 0.45)
            const sourceDirection = link.source.x <= link.target.x ? 1 : -1
            const d = `M ${link.source.x} ${link.source.y} C ${link.source.x + controlOffset * sourceDirection} ${
              link.source.y
            }, ${link.target.x - controlOffset * sourceDirection} ${link.target.y}, ${link.target.x} ${
              link.target.y
            }`
            return (
              <g key={link.id}>
                <path className="video-node-link-layer__base" d={d} />
                <path className="video-node-link-layer__glow" d={d} />
                <path className="video-node-link-layer__pulse" d={d} />
              </g>
            )
          })}
        </svg>
      )}
      {(selection?.kind === "holder" || selection?.kind === "image") && holderViewportBounds && (
        <>
          {(["left", "right"] as const).map((side) => {
            const anchor = connectorAnchor(holderViewportBounds, side)
            const outwardOffset = side === "left" ? -14 : 14
            return (
              <Button
                key={side}
                type="button"
                size="icon-xs"
                variant="outline"
                className="node-connector-button"
                style={{
                  left: anchor.x + outwardOffset,
                  top: anchor.y,
                }}
                aria-label={side === "left" ? "从左侧新增节点" : "从右侧新增节点"}
                onPointerDown={(event) => startNodeConnector(event, side)}
                onPointerMove={updateNodeConnector}
                onPointerUp={endNodeConnector}
                onPointerCancel={() => setNodeConnectorDrag(null)}
              >
                <Plus className="size-3" />
              </Button>
            )
          })}
        </>
      )}
      {nodeConnectorDrag?.active && (
        <svg className="node-connector-drag-line" aria-hidden="true">
          <path
            d={`M ${nodeConnectorDrag.start.x} ${nodeConnectorDrag.start.y} C ${
              (nodeConnectorDrag.start.x + nodeConnectorDrag.current.x) / 2
            } ${nodeConnectorDrag.start.y}, ${
              (nodeConnectorDrag.start.x + nodeConnectorDrag.current.x) / 2
            } ${nodeConnectorDrag.current.y}, ${nodeConnectorDrag.current.x} ${nodeConnectorDrag.current.y}`}
          />
          <circle cx={nodeConnectorDrag.current.x} cy={nodeConnectorDrag.current.y} r="7" />
        </svg>
      )}
      {nodeConnectorMenu && (
        <div
          className="node-connector-menu"
          style={{ left: nodeConnectorMenu.x, top: nodeConnectorMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button type="button" variant="ghost" onClick={createVideoNodeFromConnector}>
            <Video className="size-4" />
            <span>视频</span>
          </Button>
        </div>
      )}
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
      {(selection?.kind === "holder" || selection?.kind === "video") && sizeBar && (
        <CanvasSizeFloatingBar
          key={`${selection.kind}-${selection.shapeId}`}
          x={sizeBar.x}
          y={sizeBar.y}
          size={floatingSize}
          presetId={sizeBar.presetId}
          onPresetChange={applySelectedPreset}
          onSizeChange={(nextSize) => updateSelectedCanvasSize(nextSize, "custom")}
          showCutout={selection.kind === "holder"}
          isCuttingOut={status === "editing"}
          onCutout={canCutoutSelectedHolder ? () => void cutoutSelectedHolder() : undefined}
          showStoryboard={selection.kind === "holder"}
          onStoryboard={canCutoutSelectedHolder ? openStoryboardWorkflow : undefined}
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
          onTaskQueued={(taskId, context) => {
            codexResultContextRef.current = context
            setCodexTaskId(taskId)
            setCodexTaskStatus("generating")
          }}
          onClose={() => setIsCodexTaskOpen(false)}
        />
      )}
      <CanvasApiConfigDialog />
      {selection?.kind === "holder" && generationPanelPosition && (
        <GenerationPanel
          selection={selection}
          x={generationPanelPosition.x}
          y={generationPanelPosition.y}
          prompt={prompt}
          status={status}
          statusDetail={statusDetail}
          referenceImages={referenceImages}
          onPromptChange={setPrompt}
          onReferenceImagesChange={setReferenceImages}
          onFill={fillHolder}
        />
      )}
      {selection?.kind === "video" && generationPanelPosition && (
        <GenerationPanel
          mode="video"
          selection={selection}
          x={generationPanelPosition.x}
          y={generationPanelPosition.y}
          prompt={videoPrompt}
          status={status}
          statusDetail={statusDetail}
          referenceImages={videoUploadedReferences}
          lockedReferenceImages={videoReferenceImages}
          videoDurationSeconds={videoDurationSeconds}
          videoResolution={videoResolution}
          onPromptChange={setVideoPrompt}
          onReferenceImagesChange={setVideoUploadedReferences}
          onVideoDurationChange={setVideoDurationSeconds}
          onVideoResolutionChange={setVideoResolution}
          onFill={fillVideoNode}
        />
      )}
    </main>
      {CANVAS_AGENT_ENABLED && (
        <CanvasAgentShell
          open={isCanvasAgentOpen}
          storyboardRequestKey={storyboardRequestKey}
          selectionKey={agentSelectionContextKey}
          getCanvasContext={getAgentCanvasContext}
          onClearCanvasContext={(selectionId) => {
            const editor = editorRef.current
            if (!editor) return
            const remaining = editor
              .getSelectedShapeIds()
              .filter((shapeId) => shapeId !== selectionId)
            if (remaining.length > 0) {
              editor.select(...remaining)
            } else {
              editor.selectNone()
            }
          }}
          onImportImages={async (files) => {
            const editor = editorRef.current
            if (!editor) throw new Error("画布尚未准备完成")
            editor.markHistoryStoppingPoint("agent-import-images")
            const importedVersions = await importImageFilesIntoCanvas(
              editor,
              files
            )
            setVersions((current) => [...current, ...importedVersions])
            syncSelection(editor)
          }}
          onBusyChange={setIsCanvasAgentBusy}
          onForegroundTaskChange={setForegroundAgentTask}
          onClose={() => setIsCanvasAgentOpen(false)}
        />
      )}
    </div>
  )
}
