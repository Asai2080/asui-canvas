import { z } from "zod"

const canvasShapeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^shape:[A-Za-z0-9_-]+$/)

export const safe3dPreviewSpecSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal("multiview-proxy"),
    title: z.string().trim().min(1).max(120),
    referenceShapeIds: z
      .array(canvasShapeIdSchema)
      .min(2)
      .max(4)
      .refine(
        (shapeIds) => new Set(shapeIds).size === shapeIds.length,
        "3D preview references must be unique"
      ),
  })
  .strict()

export type Safe3dPreviewSpec = z.infer<typeof safe3dPreviewSpecSchema>

export function parseSafe3dPreviewSpec(value: unknown) {
  return safe3dPreviewSpecSchema.safeParse(value)
}
