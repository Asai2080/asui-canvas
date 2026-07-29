import { createHash } from "node:crypto"
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { parseSkillDocument } from "./parser"
import {
  discoveredSkillSchema,
  skillRecordSchema,
  skillRegistrySchema,
  skillSnapshotSchema,
  type SkillRecord,
  type SkillRegistry,
  type SkillSnapshot,
  type DiscoveredSkill,
} from "./schema"

const EMPTY_REGISTRY: SkillRegistry = {
  version: 1,
  skills: [],
}

export class SkillNotFoundError extends Error {
  constructor(skillId: string) {
    super(`Skill not found: ${skillId}`)
    this.name = "SkillNotFoundError"
  }
}

export class SkillUnavailableError extends Error {
  constructor(skillId: string) {
    super(`Skill is unavailable: ${skillId}`)
    this.name = "SkillUnavailableError"
  }
}

function agentRoot(root?: string) {
  return root ?? process.env.ASUI_AGENT_ROOT_DIR ?? process.cwd()
}

function registryPath(root?: string) {
  return join(agentRoot(root), ".asui-agent", "skills", "registry.json")
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex")
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)

  return slug || "skill"
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveSkillSource(sourcePath: string) {
  const requestedPath = resolve(sourcePath)
  const canonicalPath = await realpath(sourcePath)
  const sourceStat = await stat(canonicalPath)
  const requestedDirectory = sourceStat.isDirectory()
    ? requestedPath
    : dirname(requestedPath)
  const directory = sourceStat.isDirectory() ? canonicalPath : dirname(canonicalPath)
  const documentPath = sourceStat.isDirectory()
    ? join(canonicalPath, "SKILL.md")
    : canonicalPath

  if (sourceStat.isFile() && !canonicalPath.endsWith("SKILL.md")) {
    throw new Error("Skill source file must be named SKILL.md")
  }

  const content = await readFile(documentPath, "utf8")
  const parsed = parseSkillDocument(content)
  return {
    directory,
    requestedDirectory,
    documentPath,
    content,
    parsed,
    hash: contentHash(content),
  }
}

async function readRegistry(root?: string): Promise<SkillRegistry> {
  try {
    const content = await readFile(registryPath(root), "utf8")
    return skillRegistrySchema.parse(JSON.parse(content))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(EMPTY_REGISTRY)
    }
    throw error
  }
}

async function writeRegistry(registry: SkillRegistry, root?: string) {
  const target = registryPath(root)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, "utf8")
  await rename(temporary, target)
}

function skillDocumentPath(skill: SkillRecord) {
  return skill.source.type === "imported"
    ? join(skill.source.managedPath, "SKILL.md")
    : join(skill.source.path, "SKILL.md")
}

async function saveRecord(
  registry: SkillRegistry,
  record: SkillRecord,
  root?: string
) {
  const index = registry.skills.findIndex((skill) => skill.id === record.id)
  if (index === -1) {
    registry.skills.push(record)
  } else {
    registry.skills[index] = record
  }
  await writeRegistry(registry, root)
  return record
}

export async function importSkill(
  sourcePath: string,
  root?: string
): Promise<SkillRecord> {
  const source = await resolveSkillSource(sourcePath)
  const registry = await readRegistry(root)
  const duplicate = registry.skills.find(
    (skill) => skill.contentHash === source.hash && skill.source.type === "imported"
  )

  if (duplicate) {
    const refreshed = skillRecordSchema.parse({
      ...duplicate,
      available: true,
      updatedAt: new Date().toISOString(),
    })
    return saveRecord(registry, refreshed, root)
  }

  const id = `${slugify(source.parsed.name)}-${source.hash.slice(0, 12)}`
  const managedPath = join(
    agentRoot(root),
    ".asui-agent",
    "skills",
    "imported",
    id
  )
  await mkdir(managedPath, { recursive: true })
  await copyFile(source.documentPath, join(managedPath, "SKILL.md"))

  const now = new Date().toISOString()
  const record = skillRecordSchema.parse({
    id,
    name: source.parsed.name,
    description: source.parsed.description,
    source: {
      type: "imported",
      originalPath: source.requestedDirectory,
      managedPath,
    },
    contentHash: source.hash,
    risks: source.parsed.risks,
    available: true,
    createdAt: now,
    updatedAt: now,
  })

  return saveRecord(registry, record, root)
}

export async function registerLocalSkill(
  sourcePath: string,
  root?: string
): Promise<SkillRecord> {
  const source = await resolveSkillSource(sourcePath)
  const registry = await readRegistry(root)
  const duplicate = registry.skills.find(
    (skill) =>
      skill.contentHash === source.hash &&
      skill.source.type === "local" &&
      skill.source.path === source.directory
  )
  const now = new Date().toISOString()

  const record = skillRecordSchema.parse({
    id: duplicate?.id ?? `${slugify(source.parsed.name)}-${source.hash.slice(0, 12)}`,
    name: source.parsed.name,
    description: source.parsed.description,
    source: {
      type: "local",
      path: source.directory,
    },
    contentHash: source.hash,
    risks: source.parsed.risks,
    available: true,
    createdAt: duplicate?.createdAt ?? now,
    updatedAt: now,
  })

  return saveRecord(registry, record, root)
}

export async function listRegisteredSkills(root?: string): Promise<SkillRecord[]> {
  const registry = await readRegistry(root)
  let changed = false

  const skills = await Promise.all(
    registry.skills.map(async (skill) => {
      const available = await pathExists(skillDocumentPath(skill))
      if (available === skill.available) return skill
      changed = true
      return skillRecordSchema.parse({
        ...skill,
        available,
        updatedAt: new Date().toISOString(),
      })
    })
  )

  if (changed) {
    await writeRegistry({ ...registry, skills }, root)
  }

  return skills
}

export async function discoverLocalSkills(
  searchRoots: string[] = [
    join(homedir(), ".codex", "skills"),
    join(homedir(), ".gemini", "config", "skills"),
    join(process.cwd(), ".codex", "skills"),
  ]
): Promise<DiscoveredSkill[]> {
  const discovered: DiscoveredSkill[] = []
  const seenPaths = new Set<string>()

  for (const searchRoot of searchRoots) {
    let entries
    try {
      entries = await readdir(searchRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const requestedPath = resolve(searchRoot, entry.name)
      if (seenPaths.has(requestedPath)) continue

      try {
        const source = await resolveSkillSource(requestedPath)
        seenPaths.add(requestedPath)
        discovered.push(
          discoveredSkillSchema.parse({
            name: source.parsed.name,
            description: source.parsed.description,
            path: requestedPath,
            contentHash: source.hash,
            risks: source.parsed.risks,
            available: true,
          })
        )
      } catch {
        // Discovery is best-effort: malformed entries remain invisible until fixed.
      }
    }
  }

  return discovered.sort((left, right) => left.name.localeCompare(right.name))
}

export async function createSkillSnapshot(
  skillId: string,
  snapshotId: string,
  root?: string,
  options: { now?: string } = {}
): Promise<SkillSnapshot> {
  const skills = await listRegisteredSkills(root)
  const skill = skills.find((candidate) => candidate.id === skillId)
  if (!skill) throw new SkillNotFoundError(skillId)
  if (!skill.available) throw new SkillUnavailableError(skillId)

  const content = await readFile(skillDocumentPath(skill), "utf8")
  const parsed = parseSkillDocument(content)

  return skillSnapshotSchema.parse({
    id: snapshotId,
    skillId: skill.id,
    name: parsed.name,
    description: parsed.description,
    contentHash: contentHash(content),
    instructions: parsed.instructions,
    risks: parsed.risks,
    createdAt: options.now ?? new Date().toISOString(),
  })
}
