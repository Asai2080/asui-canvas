"use client"

import type { ImageVersion } from "./types"

export const CANVAS_WORKSPACE_CHANGED_EVENT = "asui:canvas-workspace-changed"

const DATABASE_NAME = "asui-canvas-workspace"
const DATABASE_VERSION = 1
const HANDLE_STORE = "handles"
const ACTIVE_HANDLE_KEY = "active-directory"

type WorkspacePermissionMode = "read" | "readwrite"

export type WorkspaceWritable = {
  write(data: Blob | string): Promise<void>
  close(): Promise<void>
}

export type WorkspaceFileHandle = {
  createWritable(): Promise<WorkspaceWritable>
}

export type WorkspaceDirectoryHandle = {
  kind: "directory"
  name: string
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<WorkspaceDirectoryHandle>
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<WorkspaceFileHandle>
  queryPermission?(options?: { mode?: WorkspacePermissionMode }): Promise<PermissionState>
  requestPermission?(options?: { mode?: WorkspacePermissionMode }): Promise<PermissionState>
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: WorkspacePermissionMode
    startIn?: "desktop" | "documents" | "downloads" | "pictures" | "videos"
  }) => Promise<WorkspaceDirectoryHandle>
}

export type CanvasWorkspaceInfo = {
  supported: boolean
  name?: string
  permission: PermissionState | "unsupported" | "unselected"
}

type ServerWorkspaceInfo = {
  supported?: boolean
  configured?: boolean
  name?: string
  error?: string
}

let cachedHandle: WorkspaceDirectoryHandle | undefined
let databasePromise: Promise<IDBDatabase> | undefined

function workspaceWindow() {
  return typeof window === "undefined" ? undefined : (window as DirectoryPickerWindow)
}

function openDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("无法读取工作空间配置"))
  })
  return databasePromise
}

async function readStoredHandle() {
  if (cachedHandle) return cachedHandle
  if (!workspaceWindow() || !globalThis.indexedDB) return undefined
  try {
    const database = await openDatabase()
    cachedHandle = await new Promise<WorkspaceDirectoryHandle | undefined>(
      (resolve, reject) => {
        const request = database
          .transaction(HANDLE_STORE, "readonly")
          .objectStore(HANDLE_STORE)
          .get(ACTIVE_HANDLE_KEY)
        request.onsuccess = () => resolve(request.result as WorkspaceDirectoryHandle | undefined)
        request.onerror = () => reject(request.error)
      }
    )
  } catch {
    cachedHandle = undefined
  }
  return cachedHandle
}

async function storeHandle(handle: WorkspaceDirectoryHandle) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(HANDLE_STORE, "readwrite")
      .objectStore(HANDLE_STORE)
      .put(handle, ACTIVE_HANDLE_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  cachedHandle = handle
}

async function readPermission(handle: WorkspaceDirectoryHandle) {
  if (!handle.queryPermission) return "granted" as PermissionState
  return handle.queryPermission({ mode: "readwrite" })
}

export function isCanvasWorkspaceSupported() {
  return Boolean(workspaceWindow())
}

function nativeWorkspaceSupported() {
  return Boolean(workspaceWindow()?.showDirectoryPicker && globalThis.indexedDB)
}

async function serverWorkspaceInfo() {
  const response = await fetch("/api/canvas-workspace", { cache: "no-store" })
  const payload = (await response.json()) as ServerWorkspaceInfo
  if (!response.ok) throw new Error(payload.error ?? "无法读取本地工作空间")
  return payload
}

export async function getCanvasWorkspaceInfo(): Promise<CanvasWorkspaceInfo> {
  if (nativeWorkspaceSupported()) {
    const handle = await readStoredHandle()
    if (handle) {
      return {
        supported: true,
        name: handle.name,
        permission: await readPermission(handle),
      }
    }
  }
  try {
    const server = await serverWorkspaceInfo()
    return {
      supported: Boolean(server.supported),
      name: server.name,
      permission: server.configured ? "granted" : "unselected",
    }
  } catch {
    return { supported: false, permission: "unsupported" }
  }
}

export async function chooseCanvasWorkspace() {
  const picker = workspaceWindow()?.showDirectoryPicker
  if (picker && globalThis.indexedDB) {
    const handle = await picker({
      id: "asui-canvas-workspace",
      mode: "readwrite",
      startIn: "documents",
    })
    const permission = await readPermission(handle)
    if (permission !== "granted") {
      const requested = await handle.requestPermission?.({ mode: "readwrite" })
      if (requested !== "granted") throw new Error("未获得工作空间文件夹的读写权限")
    }
    await storeHandle(handle)
    window.dispatchEvent(new CustomEvent(CANVAS_WORKSPACE_CHANGED_EVENT))
    return { supported: true, name: handle.name, permission: "granted" } satisfies CanvasWorkspaceInfo
  }

  const response = await fetch("/api/canvas-workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "choose" }),
  })
  const payload = (await response.json()) as ServerWorkspaceInfo
  if (!response.ok || !payload.configured) {
    throw new Error(payload.error ?? "工作空间选择失败")
  }
  window.dispatchEvent(new CustomEvent(CANVAS_WORKSPACE_CHANGED_EVENT))
  return { supported: true, name: payload.name, permission: "granted" } satisfies CanvasWorkspaceInfo
}

export function safeWorkspaceFileName(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
  return normalized || fallback
}

export function workspaceExtensionForMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0].trim().toLowerCase()
  if (normalized === "image/jpeg") return "jpg"
  if (normalized === "image/webp") return "webp"
  if (normalized === "image/svg+xml") return "svg"
  if (normalized === "video/webm") return "webm"
  if (normalized.startsWith("video/")) return "mp4"
  return "png"
}

export async function writeWorkspaceFileToHandle(
  root: WorkspaceDirectoryHandle,
  directories: string[],
  fileName: string,
  data: Blob | string
) {
  let directory = root
  for (const part of directories) {
    directory = await directory.getDirectoryHandle(
      safeWorkspaceFileName(part, "assets"),
      { create: true }
    )
  }
  const file = await directory.getFileHandle(
    safeWorkspaceFileName(fileName, "untitled"),
    { create: true }
  )
  const writable = await file.createWritable()
  await writable.write(data)
  await writable.close()
}

async function authorizedWorkspaceHandle() {
  const handle = await readStoredHandle()
  if (!handle || (await readPermission(handle)) !== "granted") return undefined
  return handle
}

export async function writeCanvasWorkspaceFile(
  directories: string[],
  fileName: string,
  data: Blob | string
) {
  const handle = await authorizedWorkspaceHandle()
  if (handle) {
    await writeWorkspaceFileToHandle(handle, directories, fileName, data)
    return true
  }
  if (typeof data !== "string") return false
  const response = await fetch("/api/canvas-workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "write-text",
      directories,
      fileName,
      content: data,
    }),
  })
  return response.ok
}

export async function persistCanvasDocumentToWorkspace(content: string) {
  return writeCanvasWorkspaceFile([], "canvas.tldr", content)
}

export async function persistCanvasTextToWorkspace(
  id: string,
  title: string,
  content: string
) {
  const fileName = `${safeWorkspaceFileName(`${id}-${title}`, "canvas-note")}.md`
  return writeCanvasWorkspaceFile(
    ["notes"],
    fileName,
    `# ${title}\n\n${content.trim()}\n`
  )
}

async function sourceBlob(src: string) {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`资产读取失败：${response.status}`)
  return response.blob()
}

export async function persistImageVersionToWorkspace(version: ImageVersion) {
  const handle = await authorizedWorkspaceHandle()
  if (handle) {
    const blob = await sourceBlob(version.src)
    const extension = workspaceExtensionForMimeType(blob.type)
    const fileName = `${safeWorkspaceFileName(version.versionId, "image")}.${extension}`
    await writeWorkspaceFileToHandle(handle, ["images"], fileName, blob)
    return true
  }
  const response = await fetch("/api/canvas-workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "write-asset",
      kind: "image",
      id: version.versionId,
      src: version.src,
    }),
  })
  return response.ok
}

export async function persistVideoToWorkspace(src: string, id: string) {
  const handle = await authorizedWorkspaceHandle()
  if (handle) {
    const blob = await sourceBlob(src)
    const extension = workspaceExtensionForMimeType(blob.type || "video/mp4")
    const fileName = `${safeWorkspaceFileName(id, "video")}.${extension}`
    await writeWorkspaceFileToHandle(handle, ["videos"], fileName, blob)
    return true
  }
  const response = await fetch("/api/canvas-workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "write-asset", kind: "video", id, src }),
  })
  return response.ok
}
