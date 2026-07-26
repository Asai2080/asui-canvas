import type { Bounds, ImageVersion } from "@/lib/canvas/types"

export type ImageGenerationCredentials = {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export type AgentImageFeedbackItem = {
  label?: string
  text?: string
  taskType?:
    | "color edit"
    | "text replacement"
    | "object replacement"
    | "localized edit"
  targetHint?: string
  bounds?: Bounds
}

export type AgentImageGenerationInput = {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  count: number
  sourceImageSrc?: string
  parentVersionId?: string
  feedbackItems?: AgentImageFeedbackItem[]
  referenceImageSrcs?: string[]
}

export type AgentImageArtifact = {
  kind: "image"
  versionId: string
  parentVersionId?: string
  src: string
  prompt: string
  width: number
  height: number
  createdAt: string
}

type AdapterOptions = {
  apiOrigin: string
  fetchImpl?: typeof fetch
}

function composePrompt(prompt: string, negativePrompt?: string) {
  return negativePrompt
    ? `${prompt}\n\n必须避免：${negativePrompt}`
    : prompt
}

function toArtifact(version: ImageVersion): AgentImageArtifact {
  return {
    kind: "image",
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    src: version.src,
    prompt: version.prompt,
    width: version.width,
    height: version.height,
    createdAt: version.createdAt,
  }
}

export function createImageGenerationAdapter({
  apiOrigin,
  fetchImpl = fetch,
}: AdapterOptions) {
  return {
    async generate(
      input: AgentImageGenerationInput,
      credentials: ImageGenerationCredentials = {}
    ): Promise<AgentImageArtifact[]> {
      const count = Math.max(1, Math.min(8, Math.trunc(input.count)))
      const endpoint = new URL("/api/images/generate", apiOrigin).toString()
      const artifacts: AgentImageArtifact[] = []

      for (let index = 0; index < count; index += 1) {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...credentials,
            prompt: composePrompt(input.prompt, input.negativePrompt),
            width: input.width,
            height: input.height,
            sourceImageSrc: input.sourceImageSrc,
            parentVersionId: input.parentVersionId,
            feedbackItems: input.feedbackItems,
            referenceImageSrcs: input.referenceImageSrcs,
          }),
        })
        const payload = (await response.json()) as {
          version?: ImageVersion
          error?: string
        }
        if (!response.ok || !payload.version) {
          throw new Error(payload.error || `图片生成失败（HTTP ${response.status}）`)
        }
        artifacts.push(toArtifact(payload.version))
      }

      return artifacts
    },
  }
}
