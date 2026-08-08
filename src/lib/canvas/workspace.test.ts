import { describe, expect, it } from "vitest"

import {
  safeWorkspaceFileName,
  workspaceExtensionForMimeType,
  writeWorkspaceFileToHandle,
  type WorkspaceDirectoryHandle,
  type WorkspaceWritable,
} from "./workspace"

class MemoryWritable implements WorkspaceWritable {
  constructor(private readonly commit: (value: Blob | string) => void) {}
  private value: Blob | string = ""

  async write(data: Blob | string) {
    this.value = data
  }

  async close() {
    this.commit(this.value)
  }
}

class MemoryDirectory implements WorkspaceDirectoryHandle {
  readonly kind = "directory" as const
  readonly directories = new Map<string, MemoryDirectory>()
  readonly files = new Map<string, Blob | string>()

  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string) {
    const existing = this.directories.get(name)
    if (existing) return existing
    const created = new MemoryDirectory(name)
    this.directories.set(name, created)
    return created
  }

  async getFileHandle(name: string) {
    return {
      createWritable: async () =>
        new MemoryWritable((value) => this.files.set(name, value)),
    }
  }
}

describe("canvas workspace", () => {
  it("normalizes unsafe file names without losing readable labels", () => {
    expect(safeWorkspaceFileName('任务 01: "春日/封面"', "note")).toBe(
      "任务-01-春日-封面"
    )
  })

  it("maps image and video MIME types to stable extensions", () => {
    expect(workspaceExtensionForMimeType("image/jpeg; charset=binary")).toBe("jpg")
    expect(workspaceExtensionForMimeType("image/svg+xml")).toBe("svg")
    expect(workspaceExtensionForMimeType("video/webm")).toBe("webm")
    expect(workspaceExtensionForMimeType("video/mp4")).toBe("mp4")
  })

  it("creates nested asset directories and writes the requested file", async () => {
    const root = new MemoryDirectory("workspace")
    await writeWorkspaceFileToHandle(
      root,
      ["generated assets", "images"],
      "result:01.png",
      "png-data"
    )

    const assets = root.directories.get("generated-assets")
    const images = assets?.directories.get("images")
    expect(images?.files.get("result-01.png")).toBe("png-data")
  })
})
