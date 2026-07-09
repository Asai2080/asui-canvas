export type VideoReferenceAsset = {
  src: string
  name?: string
  mediaType?: "image" | "video"
  mimeType?: string
}

export type VideoGenerationRequest = {
  action?: "create" | "poll" | "generate"
  provider?: string
  videoBaseUrl?: string
  videoApiKey?: string
  videoModel?: string
  taskId?: string
  prompt?: string
  sourceImageSrc?: string
  referenceAssets?: VideoReferenceAsset[]
  durationSeconds?: number
  resolution?: string
}

export type VideoGenerationResult = {
  src: string
  taskId?: string
  status?: string
  durationSeconds?: number
  resolution?: string
  raw?: unknown
}

export type VideoGenerationTask = {
  taskId: string
  status?: string
  statusText?: string
  raw?: unknown
}

export type VideoGenerationProvider = {
  id: string
  label: string
  supports: {
    textToVideo: boolean
    imageToVideo: boolean
    referenceImages: boolean
    referenceVideos: boolean
    asyncTasks: boolean
    duration: boolean
    resolution: boolean
  }
  canHandle: (request: VideoGenerationRequest) => boolean
  createTask?: (request: VideoGenerationRequest) => Promise<VideoGenerationTask>
  pollTask?: (request: VideoGenerationRequest & { taskId: string }) => Promise<VideoGenerationResult | VideoGenerationTask>
  generate: (request: VideoGenerationRequest) => Promise<VideoGenerationResult>
}
