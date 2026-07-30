import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

const createRequest = (body: unknown) =>
  new Request("http://localhost/api/cutout", {
    method: "POST",
    body: JSON.stringify(body),
  })

describe("cutout route", () => {
  const originalServiceUrl = process.env.BIREFNET_SERVICE_URL
  const fixtureName = "cutout-route-local-source.png"
  const fixturePath = join(process.cwd(), "public", "canvas-assets", fixtureName)

  afterEach(async () => {
    process.env.BIREFNET_SERVICE_URL = originalServiceUrl
    vi.restoreAllMocks()
    await rm(fixturePath, { force: true })
  })

  it("returns a clear error when the local BiRefNet service is unavailable", async () => {
    delete process.env.BIREFNET_SERVICE_URL
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connect ECONNREFUSED"))

    const response = await POST(createRequest({ imageSrc: "data:image/png;base64,abc", width: 100, height: 100 }))
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(payload.error).toContain("BiRefNet HR 服务未启动")
  })

  it("returns a transparent cutout image version from the BiRefNet service", async () => {
    process.env.BIREFNET_SERVICE_URL = "http://localhost:7861/"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ image: "iVBOR".repeat(24) }), { status: 200 })
    )

    const response = await POST(createRequest({ imageSrc: "data:image/png;base64,abc", width: 120, height: 80 }))
    const payload = (await response.json()) as { version: { src: string; width: number; height: number } }

    expect(response.status).toBe(200)
    expect(payload.version.src).toMatch(/^data:image\/png;base64,/)
    expect(payload.version.width).toBe(120)
    expect(payload.version.height).toBe(80)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:7861/cutout",
      expect.objectContaining({
        method: "POST",
      })
    )
  })

  it("converts a persisted canvas asset into a data URL for BiRefNet", async () => {
    process.env.BIREFNET_SERVICE_URL = "http://localhost:7861"
    await mkdir(join(process.cwd(), "public", "canvas-assets"), {
      recursive: true,
    })
    await writeFile(
      fixturePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlOIAAAAASUVORK5CYII=",
        "base64"
      )
    )
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ image: "iVBOR".repeat(24) }), {
        status: 200,
      })
    )

    const response = await POST(
      createRequest({
        imageSrc: `/canvas-assets/${fixtureName}`,
        width: 1,
        height: 1,
      })
    )

    expect(response.status).toBe(200)
    const request = fetchSpy.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as { image: string }
    expect(body.image).toMatch(/^data:image\/png;base64,/)
    expect(body.image).not.toContain("/canvas-assets/")
  })

  it("forwards the concrete BiRefNet validation detail", async () => {
    process.env.BIREFNET_SERVICE_URL = "http://localhost:7861"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "Unsupported image input: missing file" }),
        { status: 400 }
      )
    )

    const response = await POST(
      createRequest({ imageSrc: "data:image/png;base64,abc" })
    )
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toContain("Unsupported image input: missing file")
  })
})
