import { z } from "zod"

import { structuredAgentPlanSchema } from "./planner/schema"
import { procedural3dModelSpecSchema } from "../canvas-3d/model-schema"

export const agentTaskIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const agentTaskStatusSchema = z.enum([
  "queued",
  "understanding",
  "reading-skill",
  "reading-canvas",
  "compiling-prompt",
  "awaiting-confirmation",
  "planning",
  "executing",
  "writing-canvas",
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

export const agentExecutionModeSchema = z.enum(["auto", "confirm"])

export const agentTaskHistoryEventSchema = z.object({
  id: agentTaskIdSchema,
  status: agentTaskStatusSchema,
  message: z.string().min(1),
  createdAt: z.iso.datetime(),
  stepId: agentTaskIdSchema.optional(),
})

export const compiledPromptOutputSchema = z.object({
  id: agentTaskIdSchema,
  mediaType: z.enum(["image", "video", "model3d"]),
  operation: z.enum(["create", "edit", "animate", "reconstruct"]).optional(),
  prompt: z.string().trim().min(1),
  negativePrompt: z.string().trim().min(1).optional(),
  variantKey: agentTaskIdSchema.optional(),
  variantDifference: z.string().trim().min(1).optional(),
  sourceContextSnapshotId: agentTaskIdSchema.optional(),
  preserveConstraints: z.array(z.string().trim().min(1)).optional(),
  regionalEdits: z
    .array(
      z.object({
        annotationId: z.string().trim().min(1),
        instruction: z.string().trim().min(1),
        region: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          w: z.number().finite().nonnegative(),
          h: z.number().finite().nonnegative(),
        }),
      })
    )
    .optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().int().min(1).max(15).optional(),
  resolution: z.string().trim().min(1).optional(),
})

export const compiledPromptSchema = z.object({
  originalGoal: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1),
  sharedConstraints: z.array(z.string().trim().min(1)).default([]),
  negativeConstraints: z.array(z.string().trim().min(1)).optional(),
  skillSnapshotId: agentTaskIdSchema.optional(),
  outputs: z.array(compiledPromptOutputSchema).min(1),
})

export const agentPlanStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
])

export const agentPlanStepSchema = z.object({
  id: agentTaskIdSchema,
  title: z.string().trim().min(1),
  tool: z.enum([
    "compile-prompt",
    "generate-image",
    "generate-video",
    "write-canvas",
  ]),
  dependsOn: z.array(agentTaskIdSchema).default([]),
  status: agentPlanStepStatusSchema.default("pending"),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
})

export const agentPlanSchema = z.object({
  summary: z.string().trim().min(1),
  steps: z.array(agentPlanStepSchema).min(1),
})

export const agentTaskErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  retryable: z.boolean(),
  stepId: agentTaskIdSchema.optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export const agentInterpretationSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  summary: z.string().trim().min(1).max(1_000),
  normalizedInstruction: z.string().trim().min(1).max(4_000),
  intent: z.enum(["image", "video", "conversation", "unsupported"]),
  source: z.enum(["text-model", "local-rules"]),
  target: z
    .object({
      mediaType: z.enum(["image", "video"]).optional(),
      count: z.number().int().min(1).max(12).optional(),
      width: z.number().int().positive().max(8192).optional(),
      height: z.number().int().positive().max(8192).optional(),
      durationSeconds: z.number().int().min(1).max(15).optional(),
      resolution: z.string().trim().min(1).max(40).optional(),
    })
    .optional(),
})

export const agentImageArtifactSchema = z.object({
  kind: z.literal("image"),
  id: agentTaskIdSchema,
  versionId: z.string().trim().min(1),
  parentVersionId: z.string().trim().min(1).optional(),
  src: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.iso.datetime(),
})

export const agentVideoArtifactSchema = z.object({
  kind: z.literal("video"),
  id: agentTaskIdSchema,
  src: z.string().trim().min(1),
  taskId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  durationSeconds: z.number().int().positive().optional(),
  resolution: z.string().trim().min(1).optional(),
})

export const agentModel3dArtifactSchema = z.object({
  kind: z.literal("model3d"),
  id: agentTaskIdSchema,
  sourceContextSnapshotId: agentTaskIdSchema,
  spec: procedural3dModelSpecSchema,
  createdAt: z.iso.datetime(),
})

export const agentArtifactSchema = z.discriminatedUnion("kind", [
  agentImageArtifactSchema,
  agentVideoArtifactSchema,
  agentModel3dArtifactSchema,
])

export const agentTaskSchema = z.object({
  id: agentTaskIdSchema,
  revision: z.number().int().nonnegative(),
  source: z.literal("asui-canvas-agent"),
  status: agentTaskStatusSchema,
  executionMode: agentExecutionModeSchema.optional(),
  userInstruction: z.string().trim().min(1),
  requestedOutputCount: z.number().int().min(1).max(12).optional(),
  requestedWidth: z.number().int().min(64).max(8192).optional(),
  requestedHeight: z.number().int().min(64).max(8192).optional(),
  selectedCanvasId: z.string().trim().min(1).optional(),
  skillId: agentTaskIdSchema.optional(),
  contextSnapshotId: agentTaskIdSchema.optional(),
  retryOfTaskId: agentTaskIdSchema.optional(),
  interpretation: agentInterpretationSchema.optional(),
  compiledPrompt: compiledPromptSchema.optional(),
  plan: agentPlanSchema.optional(),
  executionPlan: structuredAgentPlanSchema.optional(),
  artifacts: z
    .record(z.string(), z.array(agentArtifactSchema))
    .optional(),
  activeStepId: agentTaskIdSchema.optional(),
  providerJobIds: z.record(z.string(), z.string()).optional(),
  resultNodeIds: z.array(z.string().trim().min(1)),
  error: agentTaskErrorSchema.optional(),
  promptConfirmedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  history: z.array(agentTaskHistoryEventSchema),
})

export type AgentTaskId = z.infer<typeof agentTaskIdSchema>
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>
export type AgentExecutionMode = z.infer<typeof agentExecutionModeSchema>
export type AgentTaskHistoryEvent = z.infer<typeof agentTaskHistoryEventSchema>
export type CompiledPrompt = z.infer<typeof compiledPromptSchema>
export type AgentPlan = z.infer<typeof agentPlanSchema>
export type AgentTaskError = z.infer<typeof agentTaskErrorSchema>
export type AgentInterpretation = z.infer<typeof agentInterpretationSchema>
export type AgentImageArtifact = z.infer<typeof agentImageArtifactSchema>
export type AgentVideoArtifact = z.infer<typeof agentVideoArtifactSchema>
export type AgentModel3dArtifact = z.infer<typeof agentModel3dArtifactSchema>
export type AgentArtifact = z.infer<typeof agentArtifactSchema>
export type AgentTask = z.infer<typeof agentTaskSchema>
