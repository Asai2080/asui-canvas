import { z } from "zod"

const vector3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

export const procedural3dPrimitiveSchema = z.enum([
  "box",
  "sphere",
  "ellipsoid",
  "cylinder",
  "cone",
  "capsule",
  "torus",
  "tube",
  "lathe",
  "extrude",
])

const vector2Schema = z.tuple([z.number().finite(), z.number().finite()])

const primitiveOptionsSchema = z
  .object({
    radiusTop: z.number().positive().max(20).optional(),
    radiusBottom: z.number().positive().max(20).optional(),
    radius: z.number().positive().max(20).optional(),
    length: z.number().positive().max(20).optional(),
    tubeRadius: z.number().positive().max(10).optional(),
    path: z.array(vector3Schema).min(2).max(32).optional(),
    closed: z.boolean().optional(),
    profile: z.array(vector2Schema).min(3).max(48).optional(),
    depth: z.number().positive().max(20).optional(),
  })
  .strict()

export const procedural3dComponentSchema = z
  .object({
    id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(1).max(120),
    primitive: procedural3dPrimitiveSchema,
    primitiveOptions: primitiveOptionsSchema.optional(),
    parentId: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),
    position: vector3Schema,
    rotation: vector3Schema,
    scale: vector3Schema.refine(
      (value) => value.every((item) => item > 0 && item <= 20),
      "3D component scale must be positive"
    ),
    color: colorSchema,
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((component, context) => {
    const options = component.primitiveOptions
    if (component.primitive === "tube" && !options?.path) {
      context.addIssue({ code: "custom", message: "Tube geometry requires a path" })
    }
    if (
      (component.primitive === "lathe" || component.primitive === "extrude") &&
      !options?.profile
    ) {
      context.addIssue({
        code: "custom",
        message: `${component.primitive} geometry requires a profile`,
      })
    }
  })

export const procedural3dModelSpecSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal("procedural-three"),
    title: z.string().trim().min(1).max(120),
    sourceSummary: z.string().trim().min(1).max(2_000),
    qualityContract: z
      .string()
      .trim()
      .min(1)
      .max(1_500)
      .default("按可见证据保持轮廓、比例、连接与材质分区。"),
    suitability: z.enum(["pass", "conditional"]),
    components: z.array(procedural3dComponentSchema).min(1).max(64),
    camera: z
      .object({
        position: vector3Schema,
        target: vector3Schema,
        fov: z.number().min(20).max(70),
      })
      .strict(),
    lighting: z
      .object({
        ambientIntensity: z.number().min(0).max(3),
        keyIntensity: z.number().min(0).max(8),
        keyPosition: vector3Schema,
      })
      .strict(),
    assumptions: z.array(z.string().trim().min(1).max(300)).max(12),
  })
  .strict()
  .superRefine((spec, context) => {
    const ids = new Set(spec.components.map((component) => component.id))
    if (ids.size !== spec.components.length) {
      context.addIssue({ code: "custom", message: "3D component IDs must be unique" })
    }
    for (const component of spec.components) {
      if (component.parentId && !ids.has(component.parentId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown 3D parent component: ${component.parentId}`,
        })
      }
      if (component.parentId === component.id) {
        context.addIssue({ code: "custom", message: "A 3D component cannot parent itself" })
      }
    }
  })

export type Procedural3dModelSpec = z.infer<
  typeof procedural3dModelSpecSchema
>

export function parseProcedural3dModelSpec(value: unknown) {
  return procedural3dModelSpecSchema.safeParse(value)
}
