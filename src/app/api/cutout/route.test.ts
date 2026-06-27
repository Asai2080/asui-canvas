import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

const createRequest = (body: unknown) =>
  new Request("http://localhost/api/cutout", {
    method: "POST",
    body: JSON.stringify(body),
  })

describe("cutout route", () => {
  const originalServiceUrl = process.env.BIREFNET_SERVICE_URL

  afterEach(() => {
    process.env.BIREFNET_SERVICE_URL = originalServiceUrl
    vi.restoreAllMocks()
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
})
