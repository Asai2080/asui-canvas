import type { VideoGenerationProvider, VideoGenerationRequest } from "@/lib/video-generation/types"

import { arkSeedanceProvider } from "./ark-seedance"

export const videoGenerationProviders: VideoGenerationProvider[] = [arkSeedanceProvider]

export function resolveVideoGenerationProvider(request: VideoGenerationRequest) {
  if (request.provider) {
    const provider = videoGenerationProviders.find((candidate) => candidate.id === request.provider)
    if (provider) return provider
  }

  return videoGenerationProviders.find((provider) => provider.canHandle(request)) ?? videoGenerationProviders[0]
}
