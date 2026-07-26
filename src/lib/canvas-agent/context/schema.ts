import { z } from "zod"

import { agentTaskIdSchema } from "../task-schema"

export const canvasContextScopeSchema = z.enum(["selection", "whole-canvas"])
export const canvasContextNodeKindSchema = z.enum([
  "image",
  "video",
  "holder",
  "annotation",
  "other",
])

export const canvasContextBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().nonnegative(),
  h: z.number().finite().nonnegative(),
})

export const canvasContextInputMediaSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  src: z.string(),
  mimeType: z.string().trim().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export const canvasContextMediaSchema = z.discriminatedUnion("referenceType", [
  z.object({
    referenceType: z.literal("url"),
    mediaType: z.enum(["image", "video"]),
    src: z.string().trim().min(1),
    mimeType: z.string().trim().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),
  z.object({
    referenceType: z.literal("inline-omitted"),
    mediaType: z.enum(["image", "video"]),
    mimeType: z.string().trim().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),
])

export const canvasContextInputNodeSchema = z.object({
  id: z.string().trim().min(1),
  kind: canvasContextNodeKindSchema,
  bounds: canvasContextBoundsSchema,
  text: z.string().optional(),
  versionId: z.string().trim().min(1).optional(),
  sourceNodeId: z.string().trim().min(1).optional(),
  parentNodeId: z.string().trim().min(1).optional(),
  media: canvasContextInputMediaSchema.optional(),
  referenceIds: z.array(z.string().trim().min(1)).default([]),
})

export const canvasContextNodeSchema = canvasContextInputNodeSchema
  .omit({ media: true })
  .extend({
    media: canvasContextMediaSchema.optional(),
  })

export const canvasContextAnnotationSchema = z.object({
  id: z.string().trim().min(1),
  sourceNodeId: z.string().trim().min(1),
  text: z.string().trim().min(1),
  bounds: canvasContextBoundsSchema,
  normalizedBounds: canvasContextBoundsSchema.optional(),
})

export const canvasContextSnapshotSchema = z.object({
  id: agentTaskIdSchema,
  createdAt: z.iso.datetime(),
  scope: canvasContextScopeSchema,
  selectedNodeId: z.string().trim().min(1).optional(),
  sourceNode: canvasContextNodeSchema.optional(),
  annotations: z.array(canvasContextAnnotationSchema),
  connectedNodes: z.array(canvasContextNodeSchema),
  references: z.array(canvasContextNodeSchema),
  canvasNodes: z.array(canvasContextNodeSchema).optional(),
})

export type CanvasContextScope = z.infer<typeof canvasContextScopeSchema>
export type CanvasContextInputMedia = z.infer<typeof canvasContextInputMediaSchema>
export type CanvasContextMedia = z.infer<typeof canvasContextMediaSchema>
export type CanvasContextInputNode = z.input<typeof canvasContextInputNodeSchema>
export type ParsedCanvasContextInputNode = z.output<
  typeof canvasContextInputNodeSchema
>
export type CanvasContextNode = z.infer<typeof canvasContextNodeSchema>
export type CanvasContextAnnotation = z.infer<typeof canvasContextAnnotationSchema>
export type CanvasContextSnapshot = z.infer<typeof canvasContextSnapshotSchema>
