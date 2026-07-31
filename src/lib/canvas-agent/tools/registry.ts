import { z } from "zod"

const safeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

const regionalEditSchema = z
  .object({
    annotationId: z.string().trim().min(1),
    instruction: z.string().trim().min(1),
    region: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().finite().nonnegative(),
        h: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict()

export const AGENT_TOOL_NAMES = [
  "read_canvas_context",
  "compile_generation_prompt",
  "generate_image",
  "edit_image",
  "generate_video",
  "generate_3d_model",
  "get_generation_job",
  "cancel_generation_job",
  "create_canvas_nodes",
  "connect_canvas_nodes",
  "mark_recommended_node",
] as const

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number]

export const registeredAgentTools = {
  read_canvas_context: z
    .object({
      snapshotId: safeId,
    })
    .strict(),
  compile_generation_prompt: z
    .object({
      taskId: safeId,
      contextSnapshotId: safeId.optional(),
      skillSnapshotId: safeId.optional(),
      userInstruction: z.string().trim().min(1),
    })
    .strict(),
  generate_image: z
    .object({
      promptOutputId: safeId,
      contextSnapshotId: safeId.optional(),
      prompt: z.string().trim().min(1),
      negativePrompt: z.string().trim().min(1).optional(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      count: z.literal(1),
      referencePolicy: z.enum(["all", "source-only", "none"]).optional(),
    })
    .strict(),
  edit_image: z
    .object({
      promptOutputId: safeId,
      contextSnapshotId: safeId,
      prompt: z.string().trim().min(1),
      negativePrompt: z.string().trim().min(1).optional(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      regionalEdits: z.array(regionalEditSchema).min(1),
    })
    .strict(),
  generate_video: z
    .object({
      promptOutputId: safeId,
      prompt: z.string().trim().min(1),
      negativePrompt: z.string().trim().min(1).optional(),
      contextSnapshotId: safeId.optional(),
      sourceStepId: safeId.optional(),
      durationSeconds: z.number().int().min(1).max(15),
      resolution: z.string().trim().min(1),
    })
    .strict(),
  generate_3d_model: z
    .object({
      promptOutputId: safeId,
      contextSnapshotId: safeId,
      prompt: z.string().trim().min(1),
    })
    .strict(),
  get_generation_job: z
    .object({
      providerJobId: z.string().trim().min(1),
    })
    .strict(),
  cancel_generation_job: z
    .object({
      providerJobId: z.string().trim().min(1),
    })
    .strict(),
  create_canvas_nodes: z
    .object({
      generationStepIds: z.array(safeId).min(1).max(12),
      placement: z.literal("right-of-source"),
      retainOriginal: z.literal(true),
    })
    .strict(),
  connect_canvas_nodes: z
    .object({
      createStepId: safeId,
      generationStepIds: z.array(safeId).min(1).max(12),
      contextSnapshotId: safeId.optional(),
    })
    .strict(),
  mark_recommended_node: z
    .object({
      createStepId: safeId,
      outputIndex: z.number().int().nonnegative().max(11),
    })
    .strict(),
} satisfies Record<AgentToolName, z.ZodType>

export function isAgentToolName(value: string): value is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(value)
}

export function parseAgentToolInput(
  tool: AgentToolName,
  input: unknown
): unknown {
  if (!isAgentToolName(tool)) {
    throw new Error(`未注册工具：${String(tool)}`)
  }

  return registeredAgentTools[tool].parse(input)
}
