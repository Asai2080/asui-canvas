import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createSkillSnapshot,
  discoverLocalSkills,
  importSkill,
  listRegisteredSkills,
  registerLocalSkill,
} from "./registry"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createRoot(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

async function writeSkill(parent: string, name = "poster-director") {
  const skillDirectory = join(parent, name)
  await mkdir(skillDirectory, { recursive: true })
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    `---
name: ${name}
description: 整理专业生图提示词
---

输出最终提示词，不展示隐藏思维过程。
`,
    "utf8"
  )
  return skillDirectory
}

describe("Canvas Agent personal Skill registry", () => {
  it("imports a managed copy and deduplicates it by content hash", async () => {
    const root = await createRoot("asui-agent-registry-")
    const sourceRoot = await createRoot("asui-agent-skill-")
    const source = await writeSkill(sourceRoot)

    const first = await importSkill(source, root)
    const second = await importSkill(source, root)
    const skills = await listRegisteredSkills(root)
    const imported = skills.filter((skill) => skill.source.type === "imported")

    expect(second.id).toBe(first.id)
    expect(imported).toHaveLength(1)
    expect(first).toMatchObject({
      name: "poster-director",
      available: true,
      source: {
        type: "imported",
        originalPath: source,
        managedPath: expect.stringContaining(".asui-agent/skills/imported/"),
      },
    })
  })

  it("marks a local Skill unavailable after its original path disappears", async () => {
    const root = await createRoot("asui-agent-registry-")
    const sourceRoot = await createRoot("asui-agent-skill-")
    const source = await writeSkill(sourceRoot, "local-style")
    const registered = await registerLocalSkill(source, root)

    await rm(source, { recursive: true, force: true })
    const skill = (await listRegisteredSkills(root)).find(
      (candidate) => candidate.id === registered.id
    )

    expect(skill?.id).toBe(registered.id)
    expect(skill?.available).toBe(false)
  })

  it("creates an immutable execution snapshot from the selected Skill", async () => {
    const root = await createRoot("asui-agent-registry-")
    const sourceRoot = await createRoot("asui-agent-skill-")
    const source = await writeSkill(sourceRoot)
    const registered = await importSkill(source, root)

    const snapshot = await createSkillSnapshot(registered.id, "snapshot-1", root, {
      now: "2026-07-25T03:00:00.000Z",
    })

    expect(snapshot).toMatchObject({
      id: "snapshot-1",
      skillId: registered.id,
      contentHash: registered.contentHash,
      instructions: expect.stringContaining("输出最终提示词"),
      createdAt: "2026-07-25T03:00:00.000Z",
    })
  })

  it("discovers valid local Skills without registering broken entries", async () => {
    const sourceRoot = await createRoot("asui-agent-discovery-")
    const source = await writeSkill(sourceRoot, "storyboard-director")
    await mkdir(join(sourceRoot, "broken-skill"))
    await writeFile(join(sourceRoot, "broken-skill", "SKILL.md"), "# no metadata", "utf8")

    const discovered = await discoverLocalSkills([sourceRoot])

    expect(discovered).toEqual([
      expect.objectContaining({
        name: "storyboard-director",
        path: source,
        available: true,
      }),
    ])
  })

  it("always exposes the built-in cover Skill and creates its snapshot", async () => {
    const root = await createRoot("asui-agent-registry-")
    const skills = await listRegisteredSkills(root)
    const cover = skills.find((skill) => skill.id === "builtin-cover-design")

    expect(cover).toMatchObject({
      name: "封面 Skill",
      available: true,
      source: {
        type: "builtin",
        key: "cover-design",
      },
    })

    const snapshot = await createSkillSnapshot(
      "builtin-cover-design",
      "snapshot-cover",
      root,
      { now: "2026-07-31T02:00:00.000Z" }
    )

    expect(snapshot).toMatchObject({
      skillId: "builtin-cover-design",
      name: "封面 Skill",
      instructions: expect.stringContaining("10 种构图风格"),
      createdAt: "2026-07-31T02:00:00.000Z",
    })
  })
})
