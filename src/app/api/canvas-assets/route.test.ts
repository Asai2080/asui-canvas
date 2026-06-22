import { access, rm } from "node:fs/promises"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { POST } from "./route"
import type { ImageVersion } from "@/lib/canvas/types"

const createdFiles: string[] = []

afterEach(async () => {
  await Promise.all(createdFiles.splice(0).map((filePath) => rm(filePath, { force: true })))
})

describe("POST /api/canvas-assets", () => {
  it("persists data URL images as public canvas assets", async () => {
    const version: ImageVersion = {
      versionId: "version-test",
      prompt: "测试图片",
      src: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
      width: 100,
      height: 100,
      createdAt: "2026-06-21T00:00:00.000Z",
    }

    const response = await POST(
      new Request("http://localhost/api/canvas-assets", {
        method: "POST",
        body: JSON.stringify({ version }),
      })
    )
    const payload = (await response.json()) as { version: ImageVersion; asset: { path: string } }
    createdFiles.push(payload.asset.path)

    expect(response.status).toBe(200)
    expect(payload.version.src).toMatch(/^\/canvas-assets\/version-test-\d+\.svg$/)
    await expect(access(join(process.cwd(), "public", payload.version.src))).resolves.toBeUndefined()
  })

  it("rejects missing image version data", async () => {
    const response = await POST(
      new Request("http://localhost/api/canvas-assets", {
        method: "POST",
        body: JSON.stringify({}),
      })
    )

    expect(response.status).toBe(400)
  })
})
