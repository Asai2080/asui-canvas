"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiChat01Icon,
  ColorsIcon,
  CursorPointer01Icon,
  HandIcon,
  ImageAdd01Icon,
  ImageCropIcon,
  ImageDownloadIcon,
  Loading03Icon,
  Magnet01Icon,
  PencilEdit01Icon,
  Settings01Icon,
  TextFontIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import {
  DefaultQuickActions,
  DefaultQuickActionsContent,
  DefaultStylePanel,
  type Editor,
  type TLImageShape,
  type TLShapeId,
  useActions,
  useEditor,
  useValue,
} from "tldraw"

const CANVAS_SNAP_MODE_STORAGE_KEY = "asui-canvas:snap-mode"

export function readCanvasSnapModePreference() {
  if (typeof window === "undefined") return true

  try {
    return window.localStorage.getItem(CANVAS_SNAP_MODE_STORAGE_KEY) !== "false"
  } catch {
    return true
  }
}

function persistCanvasSnapModePreference(enabled: boolean) {
  try {
    window.localStorage.setItem(CANVAS_SNAP_MODE_STORAGE_KEY, String(enabled))
  } catch {
    // The editor preference still applies for this session when storage is unavailable.
  }
}

type CanvasMainToolbarContextValue = {
  assistantMode: "codex" | "agent"
  assistantOpen: boolean
  assistantBusy: boolean
  onCreateImageNode: () => void
  onCreateVideoNode: () => void
  onToggleAssistant: () => void
  onOpenApiConfig: () => void
}

export const CanvasMainToolbarContext = createContext<CanvasMainToolbarContextValue | null>(null)

type ToolButtonProps = {
  active?: boolean
  label: string
  onClick: () => void
  icon: typeof CursorPointer01Icon
}

function ToolButton({ active, label, onClick, icon }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`canvas-main-toolbar__button${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.7} aria-hidden="true" />
    </button>
  )
}

function getSelectedImageShape(editor: Editor) {
  const selectedShape = editor.getOnlySelectedShape()
  if (!selectedShape) return null
  if (selectedShape.type === "image") return selectedShape as TLImageShape
  if (selectedShape.type !== "frame") return null

  const meta = (selectedShape.meta ?? {}) as Record<string, unknown>
  const isImageCanvas =
    meta.kind === "image-holder" || meta.asuiNode === "image-holder"
  if (!isImageCanvas) return null

  const latestImageShapeId =
    typeof meta.latestImageShapeId === "string"
      ? (meta.latestImageShapeId as TLShapeId)
      : null
  const latestImageShape = latestImageShapeId
    ? editor.getShape<TLImageShape>(latestImageShapeId)
    : null
  if (latestImageShape?.type === "image") return latestImageShape

  const imageShapeIds = editor
    .getSortedChildIdsForParent(selectedShape.id)
    .filter((shapeId) => editor.getShape(shapeId)?.type === "image")
  const fallbackImageShapeId = imageShapeIds[imageShapeIds.length - 1]
  return fallbackImageShapeId
    ? editor.getShape<TLImageShape>(fallbackImageShapeId) ?? null
    : null
}

export function CanvasQuickActions() {
  const editor = useEditor()
  const snapEnabled = useValue(
    "canvas snap mode",
    () => editor.user.getIsSnapMode(),
    [editor]
  )

  const toggleSnapMode = () => {
    const enabled = !snapEnabled
    editor.user.updateUserPreferences({ isSnapMode: enabled })
    persistCanvasSnapModePreference(enabled)
  }

  return (
    <DefaultQuickActions>
      <DefaultQuickActionsContent />
      <button
        type="button"
        className={`canvas-snap-toggle${snapEnabled ? " is-active" : ""}`}
        aria-label={snapEnabled ? "关闭对齐吸附" : "开启对齐吸附"}
        aria-pressed={snapEnabled}
        title={snapEnabled ? "对齐吸附：已开启" : "对齐吸附：已关闭"}
        onClick={toggleSnapMode}
      >
        <HugeiconsIcon icon={Magnet01Icon} size={16} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </DefaultQuickActions>
  )
}

export function CanvasMainToolbar() {
  const editor = useEditor()
  const canvasActions = useContext(CanvasMainToolbarContext)
  const tldrawActions = useActions()
  const [styleOpen, setStyleOpen] = useState(false)
  const currentToolId = useValue("current canvas tool", () => editor.getCurrentToolId(), [editor])
  const selectedImageShape = useValue(
    "selected image for main toolbar",
    () => getSelectedImageShape(editor),
    [editor]
  )
  const isCroppingImage = useValue(
    "is cropping selected image",
    () => editor.isIn("select.crop."),
    [editor]
  )

  const toggleImageCrop = useCallback(() => {
    setStyleOpen(false)
    if (isCroppingImage) {
      editor.setCroppingShape(null)
      editor.setCurrentTool("select.idle")
      return
    }
    if (!selectedImageShape) return
    editor.select(selectedImageShape.id)
    editor.setCurrentTool("select.crop.idle")
  }, [editor, isCroppingImage, selectedImageShape])

  const downloadSelectedImage = useCallback(async () => {
    if (!selectedImageShape) return
    setStyleOpen(false)

    const previousSelection = editor.getSelectedShapeIds()
    const needsTemporarySelection = !previousSelection.includes(selectedImageShape.id)
    if (needsTemporarySelection) {
      editor.setSelectedShapes([selectedImageShape.id])
    }

    try {
      await tldrawActions["download-original"].onSelect("toolbar")
    } finally {
      const currentSelection = editor.getSelectedShapeIds()
      if (
        needsTemporarySelection &&
        currentSelection.length === 1 &&
        currentSelection[0] === selectedImageShape.id
      ) {
        editor.setSelectedShapes(previousSelection)
      }
    }
  }, [editor, selectedImageShape, tldrawActions])

  if (!canvasActions) return null

  const selectTool = (toolId: string) => {
    setStyleOpen(false)
    editor.setCurrentTool(toolId)
  }

  const runAction = (action: () => void) => {
    setStyleOpen(false)
    action()
  }
  const assistantName = canvasActions.assistantMode === "agent" ? "画布 Agent" : "Codex"

  return (
    <div
      className="canvas-main-toolbar-shell"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="canvas-main-toolbar" role="toolbar" aria-label="画布工具">
        <ToolButton
          icon={CursorPointer01Icon}
          label="选择"
          active={currentToolId === "select"}
          onClick={() => selectTool("select")}
        />
        <ToolButton
          icon={HandIcon}
          label="移动画布"
          active={currentToolId === "hand"}
          onClick={() => selectTool("hand")}
        />
        <span className="canvas-main-toolbar__separator" aria-hidden="true" />
        <ToolButton
          icon={ImageAdd01Icon}
          label="新建图片节点"
          onClick={() => runAction(canvasActions.onCreateImageNode)}
        />
        <ToolButton
          icon={Video01Icon}
          label="新建视频节点"
          onClick={() => runAction(canvasActions.onCreateVideoNode)}
        />
        <span className="canvas-main-toolbar__separator" aria-hidden="true" />
        <ToolButton
          icon={TextFontIcon}
          label="文字"
          active={currentToolId === "text"}
          onClick={() => selectTool("text")}
        />
        <ToolButton
          icon={PencilEdit01Icon}
          label="画笔"
          active={currentToolId === "draw"}
          onClick={() => selectTool("draw")}
        />
        <ToolButton
          icon={ColorsIcon}
          label="颜色与粗细"
          active={styleOpen}
          onClick={() => setStyleOpen((open) => !open)}
        />
        {selectedImageShape && (
          <>
            <span className="canvas-main-toolbar__separator" aria-hidden="true" />
            <ToolButton
              icon={ImageCropIcon}
              label={isCroppingImage ? "完成裁剪" : "裁剪图片"}
              active={isCroppingImage}
              onClick={toggleImageCrop}
            />
            <ToolButton
              icon={ImageDownloadIcon}
              label="下载原图"
              onClick={() => void downloadSelectedImage()}
            />
          </>
        )}
        <span className="canvas-main-toolbar__separator" aria-hidden="true" />
        {canvasActions.assistantMode === "codex" && (
          <ToolButton
            icon={Settings01Icon}
            label="API 设置"
            onClick={() => runAction(canvasActions.onOpenApiConfig)}
          />
        )}
        <button
          type="button"
          className={`canvas-main-toolbar__button${canvasActions.assistantOpen ? " is-active" : ""}`}
          aria-label={canvasActions.assistantOpen ? `收起${assistantName}` : `打开${assistantName}`}
          aria-pressed={canvasActions.assistantOpen}
          title={canvasActions.assistantOpen ? `收起${assistantName}` : `打开${assistantName}`}
          onClick={() => runAction(canvasActions.onToggleAssistant)}
        >
          <HugeiconsIcon
            icon={canvasActions.assistantBusy ? Loading03Icon : AiChat01Icon}
            size={16}
            strokeWidth={1.7}
            className={canvasActions.assistantBusy ? "animate-spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      {styleOpen && (
        <div className="canvas-main-toolbar__style-panel is-open">
          <DefaultStylePanel />
        </div>
      )}
    </div>
  )
}
