import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { persistVideoGenerationResult } from "./persist-result"

describe("persistVideoGenerationResult", () => {
  it("downloads a completed provider video into canvas assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "asui-video-result-"))
    const bytes = new Uint8Array([0, 1, 2, 3])
    const fetchImpl = vi.fn(async () =>
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    )

    const result = await persistVideoGenerationResult(
      {
        src: "https://provider.test/signed-result.mp4?expires=soon",
        taskId: "provider-job-1",
        status: "succeeded",
      },
      { root, fetchImpl, now: () => 1234 }
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://provider.test/signed-result.mp4?expires=soon"
    )
    expect(result.src).toBe(
      "/canvas-assets/video-provider-job-1-1234.mp4"
    )
    expect(
      new Uint8Array(
        await readFile(
          join(root, "public/canvas-assets/video-provider-job-1-1234.mp4")
        )
      )
    ).toEqual(bytes)
  })

  it("does not download an already persisted canvas video", async () => {
    const fetchImpl = vi.fn()
    const result = await persistVideoGenerationResult(
      { src: "/canvas-assets/video-existing.mp4", taskId: "job-existing" },
      { root: "/unused", fetchImpl }
    )

    expect(result.src).toBe("/canvas-assets/video-existing.mp4")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
