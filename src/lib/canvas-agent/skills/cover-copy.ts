const MAIN_TITLE_PATTERN =
  /(?:^|[\s，。；;])(?:主标题|封面文案|标题)(?:是|为|叫|[:：])?\s*[《“"'「]?([^》”"'」\n，。；;]{2,24})/im

const TOPIC_PATTERN =
  /(?:^|[\s，。；;])(?:封面主题|主题|核心内容)(?:是|为|叫|[:：])?\s*[《“"'「]?([^》”"'」\n；;]{2,48})/im

const SMALL_COPY_PATTERN =
  /(?:^|[\s，。；;])(?:副标题|小字|小子)(?:是|为|叫|[:：])?\s*[《“"'「]?([^》”"'」\n；;]{2,48})/im

const NEXT_COPY_LABEL_PATTERN =
  /\s+(?=(?:主标题|封面文案|标题|副标题|小字|小子)(?:是|为|叫|[:：]))/i

function cleanCoverCopy(value?: string) {
  return value
    ?.split(NEXT_COPY_LABEL_PATTERN)[0]
    ?.replace(/^[《“"'「]|[》”"'」]$/g, "")
    .replace(/[。！？!?]$/g, "")
    .trim()
}

export function extractCoverMainTitle(instruction: string) {
  const matches = [
    ...instruction.matchAll(new RegExp(MAIN_TITLE_PATTERN.source, "gim")),
  ]
  return cleanCoverCopy(matches.at(-1)?.[1])
}

export function extractCoverTopic(instruction: string) {
  return cleanCoverCopy(instruction.match(TOPIC_PATTERN)?.[1])
}

export function extractCoverSmallCopy(instruction: string) {
  return cleanCoverCopy(instruction.match(SMALL_COPY_PATTERN)?.[1])
}

export function removeCoverMainTitle(instruction: string) {
  return instruction.replace(
    new RegExp(MAIN_TITLE_PATTERN.source, "gim"),
    "\n"
  )
}

function isGenericCoverInvocation(candidate: string) {
  const compact = candidate.replace(/\s+/g, "")
  return (
    /^(?:请)?(?:使用|调用|用)(?:这个|该|封面)?skill(?:帮我)?(?:生成|制作|做)?(?:一张)?(?:封面|图片|封面图片)?$/i.test(
      compact
    ) ||
    /^(?:请|帮我|我要|想要)?(?:生成|制作|做|设计)(?:一张|一个)?(?:封面|图片|封面图片)$/i.test(
      compact
    )
  )
}

export function inferCoverTitle(instruction: string) {
  const labeledTitle = extractCoverMainTitle(instruction)
  if (labeledTitle) return labeledTitle

  const candidate = (extractCoverTopic(instruction) ?? instruction)
    .trim()
    .replace(
      /^(?:封面)?(?:主标题|标题|主题|核心内容)(?:是|为|叫|[:：])?\s*/i,
      ""
    )
    .replace(/^[《“"'「]|[》”"'」]$/g, "")
    .replace(/[。！？!?]$/g, "")
    .trim()

  if (
    candidate.length < 2 ||
    candidate.length > 24 ||
    /[\n，、,;；]/.test(candidate) ||
    /^(?:按推荐|用推荐|推荐的|你推荐|交给你|你决定|全部默认|没有其他素材|无人物)$/i.test(
      candidate
    ) ||
    /^\s*(?:10|[1-9])(?:\s|[、，,。.：:]|$)/.test(candidate) ||
    /^\s*\d+\s*[\/／|]\s*\d+/.test(candidate) ||
    isGenericCoverInvocation(candidate)
  ) {
    return undefined
  }
  return candidate
}
