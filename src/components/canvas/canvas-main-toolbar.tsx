"use client"

import { createContext, useContext, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiChat01Icon,
  ArtboardToolIcon,
  ColorsIcon,
  CursorPointer01Icon,
  HandIcon,
  ImageAdd01Icon,
  Loading03Icon,
  PencilEdit01Icon,
  Settings01Icon,
  TextFontIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { DefaultStylePanel, useEditor, useValue } from "tldraw"

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
      <HugeiconsIcon icon={icon} size={18} strokeWidth={1.7} aria-hidden="true" />
    </button>
  )
}

export function CanvasMainToolbar() {
  const editor = useEditor()
  const actions = useContext(CanvasMainToolbarContext)
  const [styleOpen, setStyleOpen] = useState(false)
  const currentToolId = useValue("current canvas tool", () => editor.getCurrentToolId(), [editor])

  if (!actions) return null

  const selectTool = (toolId: string) => {
    setStyleOpen(false)
    editor.setCurrentTool(toolId)
  }

  const runAction = (action: () => void) => {
    setStyleOpen(false)
    action()
  }
  const assistantName = actions.assistantMode === "agent" ? "画布 Agent" : "Codex"

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
          onClick={() => runAction(actions.onCreateImageNode)}
        />
        <ToolButton
          icon={Video01Icon}
          label="新建视频节点"
          onClick={() => runAction(actions.onCreateVideoNode)}
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
          icon={ArtboardToolIcon}
          label="画板"
          active={currentToolId === "frame"}
          onClick={() => selectTool("frame")}
        />
        <ToolButton
          icon={ColorsIcon}
          label="颜色与粗细"
          active={styleOpen}
          onClick={() => setStyleOpen((open) => !open)}
        />
        <span className="canvas-main-toolbar__separator" aria-hidden="true" />
        {actions.assistantMode === "codex" && (
          <ToolButton
            icon={Settings01Icon}
            label="API 设置"
            onClick={() => runAction(actions.onOpenApiConfig)}
          />
        )}
        <button
          type="button"
          className={`canvas-main-toolbar__button${actions.assistantOpen ? " is-active" : ""}`}
          aria-label={actions.assistantOpen ? `收起${assistantName}` : `打开${assistantName}`}
          aria-pressed={actions.assistantOpen}
          title={actions.assistantOpen ? `收起${assistantName}` : `打开${assistantName}`}
          onClick={() => runAction(actions.onToggleAssistant)}
        >
          <HugeiconsIcon
            icon={actions.assistantBusy ? Loading03Icon : AiChat01Icon}
            size={18}
            strokeWidth={1.7}
            className={actions.assistantBusy ? "animate-spin" : undefined}
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
