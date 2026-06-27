import { readFile, rm } from "node:fs/promises"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"
import { sendCodexTaskToAppServer } from "../../../lib/codex-bridge/app-server"

vi.mock("../../../lib/codex-bridge/app-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/codex-bridge/app-server")>()
  return {
    ...actual,
    sendCodexTaskToAppServer: vi.fn(async () => ({
      threadId: "thread-asui-test",
      turnId: "turn-asui-test",
      visible: true,
      notifications: ["turn/started", "turn/completed"],
    })),
  }
})

const createdRoot = join(process.cwd(), ".asui-codex")

afterEach(async () => {
  await rm(createdRoot, { recursive: true, force: true })
  vi.clearAllMocks()
})

const createRequest = (body: unknown) =>
  new Request("http://localhost/api/codex-bridge", {
    method: "POST",
    body: JSON.stringify(body),
  })

describe("POST /api/codex-bridge", () => {
  it("writes a task and sends it to Codex app-server", async () => {
    const response = await POST(
      createRequest({
        type: "image-generation",
        instruction: "把圈选主体变成玩偶",
        canvasContext: {
          selectedShapeIds: ["shape:image"],
          annotationIds: ["shape:draw"],
          width: 1024,
          height: 1024,
        },
      })
    )
    const payload = (await response.json()) as {
      task: { id: string }
      file: { relativePath: string }
      codex: { threadId: string; turnId: string; visible: boolean }
    }
    const saved = JSON.parse(await readFile(join(process.cwd(), payload.file.relativePath), "utf8")) as {
      id: string
    }

    expect(response.status).toBe(200)
    expect(payload.codex).toMatchObject({ threadId: "thread-asui-test", turnId: "turn-asui-test", visible: true })
    expect(saved.id).toBe(payload.task.id)
    expect(sendCodexTaskToAppServer).toHaveBeenCalledWith(expect.objectContaining({ id: payload.task.id }))
  })

  it("rejects invalid bridge tasks", async () => {
    const response = await POST(
      createRequest({
        type: "image-generation",
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
