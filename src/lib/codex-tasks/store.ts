import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { codexTaskSchema, type CodexTask } from "./schema"

const CODEX_TASK_ROOT = ".asui-codex"
const QUEUED_TASK_DIR = "tasks/queued"
const TASK_STATUS_DIRS = ["queued", "received", "processing", "done", "failed"] as const

export type CodexTaskStatus = (typeof TASK_STATUS_DIRS)[number]

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

function taskDirectory(rootDir: string, status: CodexTaskStatus) {
  return join(rootDir, CODEX_TASK_ROOT, "tasks", status)
}

function taskRelativePath(status: CodexTaskStatus, fileName: string) {
  return `${CODEX_TASK_ROOT}/tasks/${status}/${fileName}`
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readTaskFile(path: string) {
  return codexTaskSchema.parse(JSON.parse(await readFile(path, "utf8")))
}

export async function getCodexTask(taskId: string, rootDir = process.cwd()) {
  const fileName = `${taskId}.json`

  for (const status of TASK_STATUS_DIRS) {
    const path = join(taskDirectory(rootDir, status), fileName)
    if (!(await pathExists(path))) continue
    const task = await readTaskFile(path)

    return {
      task,
      file: {
        fileName,
        path,
        relativePath: taskRelativePath(status, fileName),
      },
    }
  }

  return null
}

export async function receiveNextCodexTask(receiver = "codex-local-listener", rootDir = process.cwd()) {
  const queuedDir = taskDirectory(rootDir, "queued")
  await mkdir(queuedDir, { recursive: true })
  const fileNames = (await readdir(queuedDir)).filter((fileName) => fileName.endsWith(".json")).sort()
  const fileName = fileNames[0]
  if (!fileName) return null

  const sourcePath = join(queuedDir, fileName)
  const receivedDir = taskDirectory(rootDir, "received")
  const receivedPath = join(receivedDir, fileName)
  const task = await readTaskFile(sourcePath)
  const receivedTask: CodexTask = {
    ...task,
    status: "received",
    receivedAt: new Date().toISOString(),
    receiver,
  }

  await mkdir(receivedDir, { recursive: true })
  await writeFile(sourcePath, `${JSON.stringify(receivedTask, null, 2)}\n`, "utf8")
  await rename(sourcePath, receivedPath)

  return {
    task: receivedTask,
    file: {
      fileName,
      path: receivedPath,
      relativePath: taskRelativePath("received", fileName),
    },
  }
}

export async function updateCodexTask(
  taskId: string,
  patch: Pick<CodexTask, "status"> & Partial<Pick<CodexTask, "result" | "error">>,
  rootDir = process.cwd()
) {
  const current = await getCodexTask(taskId, rootDir)
  if (!current) return null

  const now = new Date().toISOString()
  const nextTask: CodexTask = {
    ...current.task,
    ...patch,
    processingAt: patch.status === "processing" ? now : current.task.processingAt,
    completedAt: patch.status === "done" || patch.status === "failed" ? now : current.task.completedAt,
    error: patch.status === "failed" ? patch.error : undefined,
  }
  const nextStatus = patch.status as CodexTaskStatus
  const nextDirectory = taskDirectory(rootDir, nextStatus)
  const nextPath = join(nextDirectory, current.file.fileName)

  await mkdir(nextDirectory, { recursive: true })
  await writeFile(current.file.path, `${JSON.stringify(nextTask, null, 2)}\n`, "utf8")
  if (current.file.path !== nextPath) {
    await rename(current.file.path, nextPath)
  }

  return {
    task: nextTask,
    file: {
      fileName: current.file.fileName,
      path: nextPath,
      relativePath: taskRelativePath(nextStatus, current.file.fileName),
    },
  }
}
