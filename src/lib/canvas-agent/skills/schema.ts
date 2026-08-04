import { z } from "zod"

const safeIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)

export const skillRiskSchema = z.enum([
  "shell",
  "network",
  "secret-read",
  "arbitrary-write",
])

export const parsedSkillDocumentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  instructions: z.string().trim().min(1),
  risks: z.array(skillRiskSchema),
})

export const skillSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("builtin"),
    key: safeIdSchema,
    homepage: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("imported"),
    originalPath: z.string().min(1),
    managedPath: z.string().min(1),
  }),
  z.object({
    type: z.literal("local"),
    path: z.string().min(1),
  }),
])

export const skillRecordSchema = z.object({
  id: safeIdSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  source: skillSourceSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  risks: z.array(skillRiskSchema),
  available: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const skillRegistrySchema = z.object({
  version: z.literal(1),
  skills: z.array(skillRecordSchema),
})

export const skillSnapshotSchema = z.object({
  id: safeIdSchema,
  skillId: safeIdSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  instructions: z.string().trim().min(1),
  risks: z.array(skillRiskSchema),
  createdAt: z.string().datetime(),
})

export const discoveredSkillSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  path: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  risks: z.array(skillRiskSchema),
  available: z.literal(true),
})

export type ParsedSkillDocument = z.infer<typeof parsedSkillDocumentSchema>
export type SkillRisk = z.infer<typeof skillRiskSchema>
export type SkillRecord = z.infer<typeof skillRecordSchema>
export type SkillRegistry = z.infer<typeof skillRegistrySchema>
export type SkillSnapshot = z.infer<typeof skillSnapshotSchema>
export type DiscoveredSkill = z.infer<typeof discoveredSkillSchema>
