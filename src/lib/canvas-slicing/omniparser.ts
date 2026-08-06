type OmniParserElement = {
  type?: unknown
  bbox?: unknown
  interactivity?: unknown
  content?: unknown
}

export type OmniParserHint = {
  type: "text" | "icon"
  x: number
  y: number
  width: number
  height: number
  interactivity: boolean
  content?: string
}

function endpoint() {
  const value = process.env.OMNIPARSER_URL?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/parse$/, "")}/parse/`
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

function imageBase64(source: string) {
  const match = source.match(/^data:image\/[A-Za-z0-9.+-]+;base64,([\s\S]+)$/)
  return match?.[1] ?? null
}

function parseElements(value: unknown): OmniParserElement[] {
  if (Array.isArray(value)) return value.filter((item): item is OmniParserElement => Boolean(item && typeof item === "object"))
  if (typeof value !== "string") return []
  try {
    return parseElements(JSON.parse(value))
  } catch {
    return []
  }
}

export async function detectWithOmniParser({ source, width, height }: {
  source: string
  width: number
  height: number
}) {
  const url = endpoint()
  const base64Image = imageBase64(source)
  if (!url || !base64Image) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64_image: base64Image }),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => ({})) as { parsed_content_list?: unknown }
    const elements = parseElements(payload.parsed_content_list)
    const hints = elements.flatMap((element): OmniParserHint[] => {
      if (!Array.isArray(element.bbox) || element.bbox.length !== 4) return []
      const values = element.bbox.map(Number)
      if (values.some((value) => !Number.isFinite(value))) return []
      const ratio = values.every((value) => value >= 0 && value <= 1)
      const [x1, y1, x2, y2] = values
      const left = Math.max(0, Math.min(width - 1, Math.round((ratio ? x1 * width : x1))))
      const top = Math.max(0, Math.min(height - 1, Math.round((ratio ? y1 * height : y1))))
      const right = Math.max(left + 1, Math.min(width, Math.round((ratio ? x2 * width : x2))))
      const bottom = Math.max(top + 1, Math.min(height, Math.round((ratio ? y2 * height : y2))))
      const type = String(element.type ?? "icon").toLowerCase() === "text" ? "text" : "icon"
      const content = typeof element.content === "string" ? element.content.trim().slice(0, 100) : undefined
      return [{
        type,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        interactivity: element.interactivity === true,
        content: content || undefined,
      }]
    })
    return { hints, source: "omniparser" as const }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export function formatOmniParserHints(hints: OmniParserHint[]) {
  if (hints.length === 0) return ""
  return [
    "以下是本地 UI 几何检测器提供的参考框，仅用于帮助你校准坐标和识别文字/图标，不要盲目照搬：",
    ...hints.slice(0, 80).map((hint, index) =>
      `${index + 1}. ${hint.type} (${hint.x},${hint.y},${hint.width},${hint.height})` +
      `，可交互=${hint.interactivity ? "是" : "否"}` +
      (hint.content ? `，内容=${hint.content}` : "")
    ),
  ].join("\n")
}
