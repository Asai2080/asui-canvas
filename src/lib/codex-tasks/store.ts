import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { CodexTask } from "./schema"

const CODEX_TASK_ROOT = ".asui-codex"
const QUEUED_TASK_DIR = "tasks/queued"

export async function writeCodexTask(task: CodexTask, rootDir = process.cwd()) {
  const fileName = `${task.id}.json`
  const relativePath = `${CODEX_TASK_ROOT}/${QUEUED_TASK_DIR}/${fileName}`
  const directory = join(rootDir, CODEX_TASK_ROOT, "tasks", "queued")
  const path = join(directory, fileName)

  await mkdir(directory, { recursive: true })
  await writeFile(path, `${JSON.stringify(task, null, 2)}\n`, "utf8")

  return {
    fileName,
    path,
    relativePath,
  }
}
