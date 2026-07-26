import { mkdir, open, readFile, rm } from "node:fs/promises"
import { join } from "node:path"

import { agentTaskIdSchema } from "../task-schema"
import {
  canvasContextSnapshotSchema,
  type CanvasContextSnapshot,
} from "./schema"

const AGENT_DIRECTORY = ".asui-agent"
const CONTEXT_DIRECTORY = "contexts"

type StoredCanvasContextSnapshot = {
  snapshot: CanvasContextSnapshot
  relativePath: string
}
function rootDirectory(root?: string) {
  return root ?? process.env.ASUI_AGENT_ROOT_DIR ?? process.cwd()
}

function contextsDirectory(root?: string) {
  return join(rootDirectory(root), AGENT_DIRECTORY, CONTEXT_DIRECTORY)
}

function snapshotPath(snapshotId: string, root?: string) {
  return join(
    contextsDirectory(root),
    `${agentTaskIdSchema.parse(snapshotId)}.json`
  )
}

function snapshotRelativePath(snapshotId: string) {
  return `${AGENT_DIRECTORY}/${CONTEXT_DIRECTORY}/${agentTaskIdSchema.parse(snapshotId)}.json`
}

async function readStoredSnapshot(path: string): Promise<CanvasContextSnapshot | null> {
  try {
    const value = await readFile(path, "utf8")
    return canvasContextSnapshotSchema.parse(JSON.parse(value))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

export class CanvasContextSnapshotAlreadyExistsError extends Error {
  constructor(snapshotId: string) {
    super(`Canvas context snapshot already exists: ${snapshotId}`)
    this.name = "CanvasContextSnapshotAlreadyExistsError"
  }
}

export async function createStoredCanvasContextSnapshot(
  snapshot: CanvasContextSnapshot,
  root?: string
) {
  const parsed = canvasContextSnapshotSchema.parse(snapshot)
  const directory = contextsDirectory(root)
  const path = snapshotPath(parsed.id, root)
  await mkdir(directory, { recursive: true })

  let file
  try {
    file = await open(path, "wx")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CanvasContextSnapshotAlreadyExistsError(parsed.id)
    }
    throw error
  }

  try {
    await file.writeFile(`${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    await file.sync()
  } catch (error) {
    await rm(path, { force: true })
    throw error
  } finally {
    await file.close()
  }

  return {
    snapshot: parsed,
    relativePath: snapshotRelativePath(parsed.id),
  } satisfies StoredCanvasContextSnapshot
}

export async function getStoredCanvasContextSnapshot(
  snapshotId: string,
  root?: string
): Promise<StoredCanvasContextSnapshot | null> {
  const parsedSnapshotId = agentTaskIdSchema.parse(snapshotId)
  const snapshot = await readStoredSnapshot(snapshotPath(parsedSnapshotId, root))
  return snapshot
    ? {
        snapshot,
        relativePath: snapshotRelativePath(parsedSnapshotId),
      }
    : null
}
