import { z } from "zod"

export const sliceAssetTypeSchema = z.enum([
  "icon",
  "logo",
  "avatar",
  "illustration",
  "banner",
  "decoration",
  "region",
])

export const sliceElementTypeSchema = z.enum([
  "icon",
  "logo",
  "avatar",
  "product",
  "illustration",
  "banner",
  "decoration",
  "text",
  "background",
  "button",
  "card",
  "input",
  "system-control",
  "unknown",
])

export const sliceDecisionSchema = z.enum(["extract", "skip"])

export const sliceCropModeSchema = z.enum(["rectangle", "transparent"])

export const sliceRectSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const sliceCandidateSchema = sliceRectSchema.extend({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  assetType: sliceAssetTypeSchema,
  elementType: sliceElementTypeSchema.optional(),
  decision: sliceDecisionSchema.optional(),
  cropMode: sliceCropModeSchema.default("rectangle"),
  confidence: z.number().min(0).max(1).default(1),
  recommended: z.boolean().default(true),
  reason: z.string().trim().max(240).optional(),
})

export const sliceMetadataSchema = z.object({
  sourceHolderId: z.string().trim().min(1),
  sourceImageId: z.string().trim().min(1),
  sourceVersionId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1),
  mode: z.enum(["automatic", "manual"]),
  assetType: sliceAssetTypeSchema,
  cropMode: sliceCropModeSchema,
  sourceRect: sliceRectSchema,
  sourceImageSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  createdAt: z.iso.datetime(),
})

export type SliceAssetType = z.infer<typeof sliceAssetTypeSchema>
export type SliceElementType = z.infer<typeof sliceElementTypeSchema>
export type SliceDecision = z.infer<typeof sliceDecisionSchema>
export type SliceCropMode = z.infer<typeof sliceCropModeSchema>
export type SliceRect = z.infer<typeof sliceRectSchema>
export type SliceCandidate = z.infer<typeof sliceCandidateSchema>
export type SliceMetadata = z.infer<typeof sliceMetadataSchema>
