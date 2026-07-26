import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { POST } from "./route"

let root = ""
let source = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asui-agent-skill-route-"))
  source = join(root, "source-skill")
  await mkdir(source)
  await writeFile(
    join(source, "SKILL.md"),
    `---
name: product-visual
description: 产品视觉生成规范
---

先生成提示词，再执行生图。
`,
    "utf8"
  )
  process.env.ASUI_AGENT_ROOT_DIR = root
  process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED = "true"
})

afterEach(async () => {
  delete process.env.ASUI_AGENT_ROOT_DIR
  delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED
  await rm(root, { recursive: true, force: true })
})

function request(body: unknown) {
  return new Request("http://localhost/api/agent/skills/import", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("POST /api/agent/skills/import", () => {
  it("stays unavailable while the Agent feature flag is disabled", async () => {
    delete process.env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED

    const response = await POST(request({ mode: "import", sourcePath: source }))

    expect(response.status).toBe(404)
  })

  it("imports a Skill without exposing an editing endpoint", async () => {
    const response = await POST(request({ mode: "import", sourcePath: source }))
    const payload = (await response.json()) as {
      skill: { name: string; source: { type: string } }
    }

    expect(response.status).toBe(200)
    expect(payload.skill).toMatchObject({
      name: "product-visual",
      source: { type: "imported" },
    })
  })

  it("rejects unsupported registration modes", async () => {
    const response = await POST(request({ mode: "create", sourcePath: source }))
    expect(response.status).toBe(400)
  })
})
