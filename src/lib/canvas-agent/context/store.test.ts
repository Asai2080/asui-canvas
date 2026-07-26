import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { buildCanvasContextSnapshot } from "./build-context"
import {
  CanvasContextSnapshotAlreadyExistsError,
  createStoredCanvasContextSnapshot,
  getStoredCanvasContextSnapshot,
} from "./store"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "asui-agent-context-"))
  roots.push(root)
  return root
}

function createSnapshot() {
  return buildCanvasContextSnapshot(
    {
      scope: "selection",
      selectedNodeId: "image-1",
      nodes: [
        {
          id: "image-1",
          kind: "image",
          bounds: { x: 0, y: 0, w: 320, h: 480 },
          media: {
            mediaType: "image",
            src: "/canvas-assets/image-1.png",
          },
        },
      ],
    },
    {
      snapshotId: "snapshot-1",
      createdAt: "2026-07-25T08:00:00.000Z",
    }
  )
}

describe("canvas context snapshot store", () => {
  it("persists snapshots in the isolated context namespace", async () => {
    const root = await createRoot()
    const snapshot = createSnapshot()

    const stored = await createStoredCanvasContextSnapshot(snapshot, root)
    const read = await getStoredCanvasContextSnapshot(snapshot.id, root)

    expect(stored.relativePath).toBe(".asui-agent/contexts/snapshot-1.json")
    expect(read?.snapshot).toEqual(snapshot)
    expect(await readdir(join(root, ".asui-agent", "contexts"))).toEqual(["snapshot-1.json"])
  })

  it("never writes inline Base64 media into a context file", async () => {
    const root = await createRoot()
    const snapshot = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: "image-1",
        nodes: [
          {
            id: "image-1",
            kind: "image",
            bounds: { x: 0, y: 0, w: 320, h: 480 },
            media: {
              mediaType: "image",
              src: "data:image/png;base64,AA==",
            },
          },
        ],
      },
      {
        snapshotId: "snapshot-inline",
        createdAt: "2026-07-25T08:00:00.000Z",
      }
    )

    await createStoredCanvasContextSnapshot(snapshot, root)
    const persisted = await readFile(
      join(root, ".asui-agent", "contexts", "snapshot-inline.json"),
      "utf8"
    )

    expect(persisted).not.toContain("base64")
    expect(persisted).toContain("inline-omitted")
  })

  it("does not overwrite an existing immutable snapshot", async () => {
    const root = await createRoot()
    const snapshot = createSnapshot()
    await createStoredCanvasContextSnapshot(snapshot, root)

    await expect(createStoredCanvasContextSnapshot(snapshot, root)).rejects.toBeInstanceOf(
      CanvasContextSnapshotAlreadyExistsError
    )
  })
})
