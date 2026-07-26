import { describe, expect, it, vi } from "vitest"

import { normalizeVideoReferenceSource } from "./reference-source"

describe("normalizeVideoReferenceSource", () => {
  it("materializes a browser blob URL before sending it to the video API", async () => {
    const sourceBlob = new Blob(["webp-image"], { type: "image/webp" })
    const fetchSource = vi.fn(async () => new Response(sourceBlob))
    const toDataUrl = vi.fn(async (blob: Blob) => `data:${blob.type};base64,d2VicC1pbWFnZQ==`)

    const result = await normalizeVideoReferenceSource("blob:http://localhost/imported-webp", {
      fetchSource,
      toDataUrl,
    })

    expect(result).toBe("data:image/webp;base64,d2VicC1pbWFnZQ==")
    expect(fetchSource).toHaveBeenCalledWith("blob:http://localhost/imported-webp")
    expect(toDataUrl).toHaveBeenCalledOnce()
  })

  it("resolves a tldraw local asset before materializing it", async () => {
    const sourceBlob = new Blob(["local-webp"], { type: "image/webp" })
    const resolveLocalAsset = vi.fn(async () => "blob:http://localhost/resolved-webp")
    const fetchSource = vi.fn(async () => new Response(sourceBlob))
    const toDataUrl = vi.fn(async (blob: Blob) => `data:${blob.type};base64,bG9jYWwtd2VicA==`)

    const result = await normalizeVideoReferenceSource("asset:imported-webp", {
      resolveLocalAsset,
      fetchSource,
      toDataUrl,
    })

    expect(result).toBe("data:image/webp;base64,bG9jYWwtd2VicA==")
    expect(resolveLocalAsset).toHaveBeenCalledWith("asset:imported-webp")
    expect(fetchSource).toHaveBeenCalledWith("blob:http://localhost/resolved-webp")
  })

  it.each([
    "data:image/webp;base64,d2VicA==",
    "https://example.test/image.webp",
    "/canvas-assets/image.webp",
  ])("keeps an already transferable source unchanged: %s", async (source) => {
    const fetchSource = vi.fn()
    const toDataUrl = vi.fn()

    await expect(normalizeVideoReferenceSource(source, { fetchSource, toDataUrl })).resolves.toBe(source)
    expect(fetchSource).not.toHaveBeenCalled()
    expect(toDataUrl).not.toHaveBeenCalled()
  })
})
