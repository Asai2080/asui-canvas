import { z } from "zod"

export const codexTaskCanvasContextSchema = z.object({
  selectedShapeIds: z.array(z.string()),
  sourceShapeId: z.string().optional(),
  versionId: z.string().optional(),
  annotationIds: z.array(z.string()),
  sourceImageSrc: z.string().optional(),
  referenceImageSrc: z.string().optional(),
  feedbackItems: z
    .array(
      z.object({
        label: z.string(),
        text: z.string(),
        taskType: z.enum(["color edit", "text replacement", "object replacement", "localized edit"]).optional(),
        targetHint: z.string().optional(),
        bounds: z
          .object({
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
          })
          .optional(),
      })
    )
    .optional(),
  prompt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizePreset: z.string().optional(),
})

export const codexTaskCreateSchema = z.object({
  type: z.literal("image-generation"),
  instruction: z.string().trim().min(1),
  canvasContext: codexTaskCanvasContextSchema,
})

export const codexTaskImageVersionSchema = z.object({
  versionId: z.string(),
  parentVersionId: z.string().optional(),
  prompt: z.string(),
  feedback: z.string().optional(),
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string().datetime(),
})

export const codexTaskSchema = codexTaskCreateSchema.extend({
  id: z.string(),
  status: z.enum(["queued", "received", "processing", "done", "failed"]),
  source: z.literal("asui-canvas"),
  createdAt: z.string().datetime(),
  receivedAt: z.string().datetime().optional(),
  processingAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  receiver: z.string().optional(),
  result: z
    .object({
      message: z.string().optional(),
      imageShapeId: z.string().optional(),
      versionId: z.string().optional(),
      version: codexTaskImageVersionSchema.optional(),
    })
    .optional(),
  error: z.string().optional(),
})

export type CodexTaskCreateInput = z.input<typeof codexTaskCreateSchema>
export type CodexTask = z.infer<typeof codexTaskSchema>

const createTaskId = () => `task-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID()}`

export function createCodexTask(input: unknown): CodexTask {
  const parsed = codexTaskCreateSchema.parse(input)

  return {
    ...parsed,
    id: createTaskId(),
    status: "queued",
    source: "asui-canvas",
    createdAt: new Date().toISOString(),
  }
}
