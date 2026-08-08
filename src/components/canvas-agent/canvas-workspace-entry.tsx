"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { FolderOpenIcon } from "@hugeicons/core-free-icons"

import { chooseCanvasWorkspace } from "@/lib/canvas/workspace"

export function CanvasWorkspaceEntry() {
  const [busy, setBusy] = useState(false)

  const choose = async () => {
    setBusy(true)
    try {
      await chooseCanvasWorkspace()
    } catch {
      // Cancelling the native folder picker leaves the current workspace unchanged.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="canvas-agent-workspace">
      <button
        type="button"
        onClick={() => void choose()}
        disabled={busy}
        title="选择文件存放位置"
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={18} strokeWidth={1.8} />
        <span>{busy ? "正在选择..." : "选择文件存放位置"}</span>
      </button>
    </div>
  )
}
