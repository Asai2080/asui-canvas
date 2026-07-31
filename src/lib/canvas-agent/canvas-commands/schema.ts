import { z } from "zod"

import {
  agentImageArtifactSchema,
  agentTaskIdSchema,
  agentVideoArtifactSchema,
} from "../task-schema"

const nodeRefSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

const canvasCommandBatchIdSchema = z
  .string()
  .min(1)
  .max(192)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const canvasCommandBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite().positive(),
    h: z.number().finite().positive(),
  })
  .strict()

const createImageNodeCommandSchema = z
  .object({
    type: z.literal("create-image-node"),
    nodeRef: nodeRefSchema,
    artifact: agentImageArtifactSchema,
    bounds: canvasCommandBoundsSchema,
  })
  .strict()

const createVideoNodeCommandSchema = z
  .object({
    type: z.literal("create-video-node"),
    nodeRef: nodeRefSchema,
    artifact: agentVideoArtifactSchema,
    prompt: z.string().trim().min(1),
    bounds: canvasCommandBoundsSchema,
  })
  .strict()

const createPromptNodeCommandSchema = z
  .object({
    type: z.literal("create-prompt-node"),
    nodeRef: nodeRefSchema,
    title: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(40_000),
    bounds: canvasCommandBoundsSchema,
  })
  .strict()

const create3dPreviewNodeCommandSchema = z
  .object({
    type: z.literal("create-3d-preview-node"),
    nodeRef: nodeRefSchema,
    title: z.string().trim().min(1).max(120),
    referenceNodeRefs: z.array(nodeRefSchema).min(2).max(4),
    bounds: canvasCommandBoundsSchema,
  })
  .strict()

const connectNodesCommandSchema = z
  .object({
    type: z.literal("connect-nodes"),
    sourceNodeId: z.string().trim().min(1),
    targetNodeRef: nodeRefSchema,
  })
  .strict()

const setRecommendedResultCommandSchema = z
  .object({
    type: z.literal("set-recommended-result"),
    nodeRef: nodeRefSchema,
  })
  .strict()

const focusResultsCommandSchema = z
  .object({
    type: z.literal("focus-results"),
    nodeRefs: z.array(nodeRefSchema).min(1),
  })
  .strict()

export const agentCanvasCommandSchema = z.discriminatedUnion("type", [
  createImageNodeCommandSchema,
  createVideoNodeCommandSchema,
  createPromptNodeCommandSchema,
  create3dPreviewNodeCommandSchema,
  connectNodesCommandSchema,
  setRecommendedResultCommandSchema,
  focusResultsCommandSchema,
])

export const agentCanvasCommandBatchSchema = z
  .object({
    id: canvasCommandBatchIdSchema,
    taskId: agentTaskIdSchema,
    createdAt: z.iso.datetime(),
    commands: z.array(agentCanvasCommandSchema).min(1),
  })
  .strict()

export const agentCanvasCommandErrorSchema = z
  .object({
    commandIndex: z.number().int().nonnegative().optional(),
    message: z.string().trim().min(1),
  })
  .strict()

export const agentCanvasCommandAcknowledgementSchema = z
  .object({
    batchId: canvasCommandBatchIdSchema,
    taskId: agentTaskIdSchema,
    status: z.enum(["applied", "partial", "rejected"]),
    resultNodeIds: z.array(z.string().trim().min(1)),
    artifactNodeIds: z.record(z.string(), z.string().trim().min(1)),
    errors: z.array(agentCanvasCommandErrorSchema),
  })
  .strict()

export type CanvasCommandBounds = z.infer<typeof canvasCommandBoundsSchema>
export type AgentCanvasCommand = z.infer<typeof agentCanvasCommandSchema>
export type AgentCanvasCommandBatch = z.infer<
  typeof agentCanvasCommandBatchSchema
>
export type AgentCanvasCommandAcknowledgement = z.infer<
  typeof agentCanvasCommandAcknowledgementSchema
>
