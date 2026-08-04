import sharp from "sharp"

import type { ImageVersion } from "@/lib/canvas/types"

import type { AgentImageArtifact } from "./image-generation"

type AdapterOptions = {
  apiOrigin: string
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  startupTimeoutMs?: number
  createId?: () => string
}

type CutoutServiceStatus = {
  running?: boolean
  managed?: boolean
  message?: string
  error?: string
  logs?: string[]
}

type CutoutResponse = {
  version?: ImageVersion
  error?: string
}

type TransparencyInspection = {
  format?: string
  width?: number
  height?: number
  hasAlpha: boolean
  meaningfulAlpha: boolean
}

export type TransparentImageProcessor = (
  artifact: AgentImageArtifact
) => Promise<AgentImageArtifact>

const wait = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration))

async function imageBuffer(
  src: string,
  apiOrigin: string,
  fetchImpl: typeof fetch
) {
  const url = src.startsWith("/")
    ? new URL(src, apiOrigin).toString()
    : src
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`无法读取生成图片：HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function inspectBufferTransparency(
  buffer: Buffer
): Promise<TransparencyInspection> {
  const image = sharp(buffer, { failOn: "error" })
  const [metadata, stats] = await Promise.all([
    image.metadata(),
    image.stats(),
  ])
  const alpha = metadata.hasAlpha ? stats.channels.at(-1) : undefined
  const meaningfulAlpha = Boolean(
    metadata.hasAlpha &&
      alpha &&
      alpha.min < 250 &&
      alpha.max > 5 &&
      !stats.isOpaque
  )

  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    meaningfulAlpha,
  }
}

export async function inspectImageTransparency(
  src: string,
  {
    apiOrigin,
    fetchImpl = fetch,
  }: Pick<AdapterOptions, "apiOrigin" | "fetchImpl">
) {
  return inspectBufferTransparency(
    await imageBuffer(src, apiOrigin, fetchImpl)
  )
}

function exteriorTransparentPixels(
  alpha: Uint8Array,
  width: number,
  height: number
) {
  const exterior = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0

  const enqueue = (index: number) => {
    if (exterior[index] || alpha[index] >= 250) return
    exterior[index] = 1
    queue[tail] = index
    tail += 1
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }

  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) enqueue(index - 1)
    if (x + 1 < width) enqueue(index + 1)
    if (y > 0) enqueue(index - width)
    if (y + 1 < height) enqueue(index + width)
  }

  return exterior
}

function alphaBounds(alpha: Uint8Array, width: number, height: number) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] <= 8) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) {
    throw new Error("透明图片中没有可见主体")
  }
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  }
}

async function cleanStickerSubjectAlpha(buffer: Buffer) {
  const { data, info } = await sharp(buffer, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixelCount = info.width * info.height
  const alpha = new Uint8Array(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    alpha[index] = data[index * 4 + 3]
  }
  const exterior = exteriorTransparentPixels(alpha, info.width, info.height)

  for (let index = 0; index < pixelCount; index += 1) {
    if (!exterior[index]) continue
    const sourceAlpha = alpha[index]
    let cleanedAlpha = sourceAlpha
    if (sourceAlpha <= 64) {
      cleanedAlpha = 0
    } else if (sourceAlpha >= 192) {
      cleanedAlpha = 255
    } else {
      const normalized = (sourceAlpha - 64) / 128
      const smooth = normalized * normalized * (3 - 2 * normalized)
      cleanedAlpha = Math.round(smooth * 255)
    }
    data[index * 4 + 3] = cleanedAlpha
    if (cleanedAlpha === 0) {
      data[index * 4] = 0
      data[index * 4 + 1] = 0
      data[index * 4 + 2] = 0
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}

async function normalizedStickerSubject(buffer: Buffer) {
  const cleanedBuffer = await cleanStickerSubjectAlpha(buffer)
  const { data, info } = await sharp(cleanedBuffer, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alpha = new Uint8Array(info.width * info.height)
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = data[index * 4 + 3]
  }
  const bounds = alphaBounds(alpha, info.width, info.height)
  const shortSide = Math.min(info.width, info.height)
  const outlineWidth = Math.max(2, Math.round(shortSide * 0.012))
  const safePadding = Math.max(4, Math.round(shortSide * 0.05))
  const margin = outlineWidth + safePadding
  const availableWidth = Math.max(1, info.width - margin * 2)
  const availableHeight = Math.max(1, info.height - margin * 2)
  const scale = Math.min(
    1,
    availableWidth / bounds.width,
    availableHeight / bounds.height
  )
  const subjectWidth = Math.max(1, Math.round(bounds.width * scale))
  const subjectHeight = Math.max(1, Math.round(bounds.height * scale))
  const maximumLeft = info.width - margin - subjectWidth
  const maximumTop = info.height - margin - subjectHeight
  const left =
    scale < 1
      ? Math.round((info.width - subjectWidth) / 2)
      : Math.min(Math.max(bounds.left, margin), maximumLeft)
  const top =
    scale < 1
      ? Math.round((info.height - subjectHeight) / 2)
      : Math.min(Math.max(bounds.top, margin), maximumTop)

  let subject = sharp(cleanedBuffer, { failOn: "error" })
    .ensureAlpha()
    .extract(bounds)
  if (scale < 1) {
    subject = subject.resize(subjectWidth, subjectHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
  }
  const subjectBuffer = await subject.png().toBuffer()
  const normalized = await sharp({
    create: {
      width: info.width,
      height: info.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: subjectBuffer, left, top }])
    .png()
    .toBuffer()

  return {
    buffer: normalized,
    width: info.width,
    height: info.height,
    outlineWidth,
  }
}

async function addWarmWhiteStickerOutline(buffer: Buffer) {
  const normalized = await normalizedStickerSubject(buffer)
  const { data } = await sharp(normalized.buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixelCount = normalized.width * normalized.height
  const alpha = Buffer.alloc(pixelCount)
  const binaryAlpha = Buffer.alloc(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    alpha[index] = data[index * 4 + 3]
    binaryAlpha[index] = alpha[index] >= 128 ? 255 : 0
  }
  const exterior = exteriorTransparentPixels(
    alpha,
    normalized.width,
    normalized.height
  )
  const expandedAlpha = await sharp(binaryAlpha, {
    raw: {
      width: normalized.width,
      height: normalized.height,
      channels: 1,
    },
  })
    .erode(normalized.outlineWidth)
    .blur(0.35)
    .extractChannel(0)
    .raw()
    .toBuffer()
  const outline = Buffer.alloc(pixelCount * 4)
  for (let index = 0; index < pixelCount; index += 1) {
    outline[index * 4] = 255
    outline[index * 4 + 1] = 252
    outline[index * 4 + 2] = 245
    outline[index * 4 + 3] = exterior[index] ? expandedAlpha[index] : 0
  }

  return sharp(outline, {
    raw: {
      width: normalized.width,
      height: normalized.height,
      channels: 4,
    },
  })
    .composite([{ input: normalized.buffer }])
    .png()
    .toBuffer()
}

async function requestJson<T>(
  url: string,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch
) {
  const response = await fetchImpl(url, init)
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(payload.error ?? `请求失败：HTTP ${response.status}`)
  }
  return payload
}

function serviceError(status: CutoutServiceStatus) {
  return status.error ?? status.logs?.at(-1) ?? status.message
}

export function createTransparentImageProcessor({
  apiOrigin,
  fetchImpl = fetch,
  pollIntervalMs = 700,
  startupTimeoutMs = 120_000,
  createId = () => crypto.randomUUID(),
}: AdapterOptions): TransparentImageProcessor {
  const serviceEndpoint = new URL("/api/cutout/service", apiOrigin).toString()
  const cutoutEndpoint = new URL("/api/cutout", apiOrigin).toString()

  return async (artifact) => {
    let transparentArtifact = artifact
    let transparentBuffer = await imageBuffer(
      artifact.src,
      apiOrigin,
      fetchImpl
    )
    const original = await inspectBufferTransparency(transparentBuffer)

    if (!original.meaningfulAlpha) {
      const previousStatus = await requestJson<CutoutServiceStatus>(
        serviceEndpoint,
        undefined,
        fetchImpl
      )
      let shouldStopService = false

      try {
        if (!previousStatus.running) {
          const startedStatus = await requestJson<CutoutServiceStatus>(
            serviceEndpoint,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "start" }),
            },
            fetchImpl
          )
          shouldStopService =
            previousStatus.managed !== true && startedStatus.managed === true

          const deadline = Date.now() + startupTimeoutMs
          let latestStatus = startedStatus
          while (!latestStatus.running && Date.now() < deadline) {
            if (startedStatus.managed && latestStatus.managed === false) {
              throw new Error(
                serviceError(latestStatus) ?? "BiRefNet HR 服务启动失败"
              )
            }
            await wait(pollIntervalMs)
            latestStatus = await requestJson<CutoutServiceStatus>(
              serviceEndpoint,
              undefined,
              fetchImpl
            )
          }
          if (!latestStatus.running) {
            throw new Error("BiRefNet HR 服务启动超时")
          }
        }

        const payload = await requestJson<CutoutResponse>(
          cutoutEndpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageSrc: artifact.src,
              width: artifact.width,
              height: artifact.height,
            }),
          },
          fetchImpl
        )
        if (!payload.version) {
          throw new Error("自动抠图没有返回透明图片")
        }

        transparentBuffer = await imageBuffer(
          payload.version.src,
          apiOrigin,
          fetchImpl
        )
        const processed = await inspectBufferTransparency(transparentBuffer)
        if (!processed.meaningfulAlpha) {
          throw new Error("自动抠图结果仍然没有真实透明通道")
        }
        transparentArtifact = {
          ...artifact,
          versionId: payload.version.versionId,
          parentVersionId: artifact.versionId,
          src: payload.version.src,
          createdAt: payload.version.createdAt,
        }
      } catch (error) {
        throw new Error(
          `贴纸结果没有真实透明背景，自动抠图失败：${error instanceof Error ? error.message : "未知错误"}`
        )
      } finally {
        if (shouldStopService) {
          try {
            await requestJson<CutoutServiceStatus>(
              serviceEndpoint,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "stop" }),
              },
              fetchImpl
            )
          } catch (error) {
            console.warn(
              "Failed to stop auto-started BiRefNet HR service",
              error
            )
          }
        }
      }
    }

    try {
      const outlined = await addWarmWhiteStickerOutline(transparentBuffer)
      const finalInspection = await inspectBufferTransparency(outlined)
      if (!finalInspection.meaningfulAlpha) {
        throw new Error("描边结果没有保留真实透明通道")
      }
      return {
        ...transparentArtifact,
        versionId: `sticker-${createId()}`,
        parentVersionId: transparentArtifact.versionId,
        src: `data:image/png;base64,${outlined.toString("base64")}`,
        createdAt: new Date().toISOString(),
      }
    } catch (error) {
      throw new Error(
        `贴纸暖白描边处理失败：${error instanceof Error ? error.message : "未知错误"}`
      )
    }
  }
}
