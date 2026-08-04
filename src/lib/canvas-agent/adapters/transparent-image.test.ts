import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"

import type { AgentImageArtifact } from "./image-generation"
import {
  createTransparentImageProcessor,
  inspectImageTransparency,
} from "./transparent-image"

async function pngDataUrl({ transparent }: { transparent: boolean }) {
  const image = sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: transparent
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 120, g: 80, b: 40, alpha: 1 },
    },
  })
  const buffer = await (transparent
    ? image.composite([
        {
          input: {
            create: {
              width: 24,
              height: 24,
              channels: 4,
              background: { r: 120, g: 80, b: 40, alpha: 1 },
            },
          },
          left: 20,
          top: 20,
        },
      ])
    : image)
    .png()
    .toBuffer()
  return `data:image/png;base64,${buffer.toString("base64")}`
}

async function ringDataUrl() {
  const width = 64
  const height = 64
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - 31.5, y - 31.5)
      if (distance < 10 || distance > 17) continue
      const offset = (y * width + x) * 4
      pixels[offset] = 120
      pixels[offset + 1] = 80
      pixels[offset + 2] = 40
      pixels[offset + 3] = 255
    }
  }
  const buffer = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer()
  return `data:image/png;base64,${buffer.toString("base64")}`
}

async function imageWithExteriorAlphaSpillDataUrl() {
  const width = 64
  const height = 64
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 12; y < 36; y += 1) {
    for (let x = 20; x < 44; x += 1) {
      const offset = (y * width + x) * 4
      pixels[offset] = 120
      pixels[offset + 1] = 80
      pixels[offset + 2] = 40
      pixels[offset + 3] = 255
    }
  }
  for (let y = 36; y < 53; y += 1) {
    for (let x = 8; x < 56; x += 1) {
      const offset = (y * width + x) * 4
      pixels[offset] = 230
      pixels[offset + 1] = 220
      pixels[offset + 2] = 210
      pixels[offset + 3] = 56
    }
  }
  const buffer = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer()
  return `data:image/png;base64,${buffer.toString("base64")}`
}

function artifact(src: string): AgentImageArtifact {
  return {
    kind: "image",
    versionId: "version-raw",
    src,
    prompt: "透明贴纸",
    width: 512,
    height: 512,
    createdAt: "2026-08-01T00:00:00.000Z",
  }
}

describe("transparent image processing", () => {
  it("recognizes meaningful alpha pixels", async () => {
    const transparent = await inspectImageTransparency(
      await pngDataUrl({ transparent: true }),
      { apiOrigin: "http://localhost:3030" }
    )
    const opaque = await inspectImageTransparency(
      await pngDataUrl({ transparent: false }),
      { apiOrigin: "http://localhost:3030" }
    )

    expect(transparent).toMatchObject({
      hasAlpha: true,
      meaningfulAlpha: true,
    })
    expect(opaque.meaningfulAlpha).toBe(false)
  })

  it("adds a warm-white outline without starting cutout", async () => {
    const src = await pngDataUrl({ transparent: true })
    const fetchImpl = vi.fn(fetch)
    const process = createTransparentImageProcessor({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
      createId: () => "final",
    })

    const result = await process(artifact(src))
    expect(result).toMatchObject({
      versionId: "sticker-final",
      parentVersionId: "version-raw",
    })
    expect(result.src).not.toBe(src)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const { data, info } = await sharp(
      Buffer.from(result.src.split(",")[1], "base64")
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let outlinedPixels = 0
    let left = info.width
    let top = info.height
    let right = -1
    let bottom = -1
    for (let index = 0; index < info.width * info.height; index += 1) {
      const offset = index * 4
      if (data[offset + 3] > 0) {
        const x = index % info.width
        const y = Math.floor(index / info.width)
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
      if (
        data[offset] === 255 &&
        data[offset + 1] === 252 &&
        data[offset + 2] === 245 &&
        data[offset + 3] > 0
      ) {
        outlinedPixels += 1
      }
    }
    expect(outlinedPixels).toBeGreaterThan(0)
    expect({ left, top, right, bottom }).toEqual({
      left: 18,
      top: 18,
      right: 45,
      bottom: 45,
    })
  })

  it("keeps enclosed transparent holes free of the exterior outline", async () => {
    const process = createTransparentImageProcessor({
      apiOrigin: "http://localhost:3030",
      createId: () => "ring",
    })
    const result = await process(artifact(await ringDataUrl()))
    const { data, info } = await sharp(
      Buffer.from(result.src.split(",")[1], "base64")
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const centerAlpha = data[(32 * info.width + 32) * 4 + 3]

    expect(centerAlpha).toBe(0)
  })

  it("removes low-alpha exterior spill before drawing the outline", async () => {
    const process = createTransparentImageProcessor({
      apiOrigin: "http://localhost:3030",
      createId: () => "clean-spill",
    })
    const result = await process(
      artifact(await imageWithExteriorAlphaSpillDataUrl())
    )
    const { data, info } = await sharp(
      Buffer.from(result.src.split(",")[1], "base64")
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    expect(data[(50 * info.width + 32) * 4 + 3]).toBe(0)
    expect(data[(24 * info.width + 32) * 4 + 3]).toBe(255)
  })

  it("auto-cuts an opaque result and stops a service it started", async () => {
    const opaqueSrc = await pngDataUrl({ transparent: false })
    const transparentSrc = await pngDataUrl({ transparent: true })
    const calls: string[] = []
    let statusChecks = 0
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (url.startsWith("data:image/")) return fetch(url)
      if (url.endsWith("/api/cutout/service") && !init?.method) {
        statusChecks += 1
        return Response.json({
          running: statusChecks > 1,
          managed: statusChecks > 1,
        })
      }
      if (url.endsWith("/api/cutout/service")) {
        const action = JSON.parse(String(init?.body)).action
        return Response.json(
          action === "start"
            ? { running: false, managed: true }
            : { running: false, managed: false }
        )
      }
      if (url.endsWith("/api/cutout")) {
        return Response.json({
          version: {
            versionId: "cutout-version",
            prompt: "BiRefNet HR 抠图",
            src: transparentSrc,
            width: 512,
            height: 512,
            createdAt: "2026-08-01T00:01:00.000Z",
          },
        })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const process = createTransparentImageProcessor({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
      pollIntervalMs: 0,
      startupTimeoutMs: 1_000,
      createId: () => "final",
    })

    await expect(process(artifact(opaqueSrc))).resolves.toMatchObject({
      versionId: "sticker-final",
      parentVersionId: "cutout-version",
    })
    expect(calls).toContain("POST http://localhost:3030/api/cutout")
    expect(
      calls.filter(
        (call) => call === "POST http://localhost:3030/api/cutout/service"
      )
    ).toHaveLength(2)
  })
})
