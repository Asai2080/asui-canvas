import { z } from "zod"

import { AGENT_TOOL_NAMES } from "../tools/registry"

const safeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const agentToolNameSchema = z.enum(AGENT_TOOL_NAMES)

export const structuredAgentPlanStepSchema = z
  .object({
    id: safeId,
    title: z.string().trim().min(1),
    tool: agentToolNameSchema,
    dependsOn: z.array(safeId),
    status: z
      .enum(["pending", "running", "completed", "failed", "cancelled"])
      .default("pending"),
    attempts: z.number().int().nonnegative().default(0),
    input: z.record(z.string(), z.unknown()),
    outputRefs: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()

export const structuredAgentPlanSchema = z
  .object({
    version: z.literal(1),
    taskId: safeId,
    summary: z.string().trim().min(1),
    steps: z.array(structuredAgentPlanStepSchema).min(1),
    maxParallelism: z.number().int().min(1).max(4),
    maxGeneratedNodes: z.number().int().min(1).max(8),
  })
  .strict()

export type StructuredAgentPlanStep = z.infer<
  typeof structuredAgentPlanStepSchema
>
export type StructuredAgentPlan = z.infer<typeof structuredAgentPlanSchema>
