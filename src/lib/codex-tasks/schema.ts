import { z } from "zod"

export const codexTaskCanvasContextSchema = z.object({
  selectedShapeIds: z.array(z.string()),
  sourceShapeId: z.string().optional(),
  versionId: z.string().optional(),
  annotationIds: z.array(z.string()),
  prompt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizePreset: z.string().optional(),
})

export const codexTaskCreateSchema = z.object({
  type: z.enum(["code-change", "image-generation"]),
  instruction: z.string().trim().min(1),
  canvasContext: codexTaskCanvasContextSchema,
})

export const codexTaskSchema = codexTaskCreateSchema.extend({
  id: z.string(),
  status: z.literal("queued"),
  source: z.literal("asui-canvas"),
  createdAt: z.string().datetime(),
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
