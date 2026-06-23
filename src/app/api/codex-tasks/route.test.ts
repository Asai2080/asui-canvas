import { readFile, rm } from "node:fs/promises"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { POST } from "./route"

const createdRoot = join(process.cwd(), ".asui-codex")

afterEach(async () => {
  await rm(createdRoot, { recursive: true, force: true })
})

const createRequest = (body: unknown) =>
  new Request("http://localhost/api/codex-tasks", {
    method: "POST",
    body: JSON.stringify(body),
  })

describe("POST /api/codex-tasks", () => {
  it("creates a queued Codex task file", async () => {
    const response = await POST(
      createRequest({
        type: "image-generation",
        instruction: "用选中图片生成一版动感海报",
        canvasContext: {
          selectedShapeIds: ["shape:image"],
          annotationIds: ["shape:a"],
          width: 1024,
          height: 768,
          sizePreset: "web",
        },
      })
    )
    const payload = (await response.json()) as {
      task: { id: string; instruction: string }
      file: { relativePath: string }
    }
    const saved = JSON.parse(await readFile(join(process.cwd(), payload.file.relativePath), "utf8")) as {
      id: string
    }

    expect(response.status).toBe(200)
    expect(payload.task.instruction).toBe("用选中图片生成一版动感海报")
    expect(payload.file.relativePath).toBe(`.asui-codex/tasks/queued/${payload.task.id}.json`)
    expect(saved.id).toBe(payload.task.id)
  })

  it("rejects invalid task input", async () => {
    const response = await POST(
      createRequest({
        type: "code-change",
        instruction: "",
        canvasContext: {
          selectedShapeIds: [],
          annotationIds: [],
        },
      })
    )

    expect(response.status).toBe(400)
  })
})
