import type { NormalizedBounds } from "./types"

export type ResolvedAnnotation = {
  annotationId: string
  imageId: string
  versionId: string
  text: string
  label?: string
  bounds?: NormalizedBounds
}

export type AnnotationFeedbackItem = {
  label: string
  text: string
  bounds?: NormalizedBounds
  taskType?: "color edit" | "text replacement" | "object replacement" | "localized edit"
  targetHint?: string
}

export function validateSameAnnotationTarget(annotations: ResolvedAnnotation[]) {
  const first = annotations[0]
  if (!first) return null

  const hasSameTarget = annotations.every(
    (annotation) => annotation.imageId === first.imageId && annotation.versionId === first.versionId
  )

  return hasSameTarget
    ? {
        imageId: first.imageId,
        versionId: first.versionId,
      }
    : null
}

export function buildAnnotationFeedbackItems(annotations: ResolvedAnnotation[]): AnnotationFeedbackItem[] {
  return annotations
    .map((annotation, index) => ({
      label: annotation.label?.trim() || `标注 ${index + 1}`,
      text: annotation.text.trim(),
      bounds: annotation.bounds,
    }))
    .filter((item) => item.text)
}
