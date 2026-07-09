export type Bounds = {
  x: number
  y: number
  w: number
  h: number
}

export type NormalizedBounds = Bounds

export type CanvasSize = {
  width: number
  height: number
}

export type GenerationStatus = "idle" | "generating" | "editing" | "success" | "error"

export type ImageVersion = {
  versionId: string
  parentVersionId?: string
  prompt: string
  feedback?: string
  src: string
  width: number
  height: number
  createdAt: string
}

export type ReferenceImage = {
  id: string
  name: string
  src: string
  mediaType?: "image" | "video"
  mimeType?: string
}

export type CanvasSelection = {
  shapeId: string
  versionId?: string
  kind: "holder" | "image" | "video" | "other"
}
