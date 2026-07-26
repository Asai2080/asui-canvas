import { open, mkdir, readFile, readdir, rename, rm } from "node:fs/promises"
import { basename, join } from "node:path"

import {
  agentTaskIdSchema,
  agentTaskSchema,
  type AgentTask,
} from "./task-schema"

const AGENT_DIRECTORY = ".asui-agent"
const TASK_DIRECTORY = "tasks"

type StoredAgentTask = {
  task: AgentTask
  relativePath: string
}

function rootDirectory(root?: string) {
  return root ?? process.env.ASUI_AGENT_ROOT_DIR ?? process.cwd()
}

function tasksDirectory(root?: string) {
  return join(rootDirectory(root), AGENT_DIRECTORY, TASK_DIRECTORY)
}

function taskPath(taskId: string, root?: string) {
  return join(tasksDirectory(root), `${agentTaskIdSchema.parse(taskId)}.json`)
}

function taskRelativePath(taskId: string) {
  return `${AGENT_DIRECTORY}/${TASK_DIRECTORY}/${agentTaskIdSchema.parse(taskId)}.json`
}

async function readStoredTask(path: string): Promise<AgentTask | null> {
  try {
    const value = await readFile(path, "utf8")
    return agentTaskSchema.parse(JSON.parse(value))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function writeTaskAtomically(path: string, task: AgentTask) {
  await mkdir(join(path, ".."), { recursive: true })
  const temporaryPath = join(
    join(path, ".."),
    `.${basename(path)}.${crypto.randomUUID()}.tmp`
  )

  try {
    const file = await open(temporaryPath, "wx")
    try {
      await file.writeFile(`${JSON.stringify(task, null, 2)}\n`, "utf8")
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export class AgentTaskAlreadyExistsError extends Error {
  constructor(taskId: string) {
    super(`Canvas Agent task already exists: ${taskId}`)
    this.name = "AgentTaskAlreadyExistsError"
  }
}

export class AgentTaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Canvas Agent task not found: ${taskId}`)
    this.name = "AgentTaskNotFoundError"
  }
}

export class AgentTaskRevisionConflictError extends Error {
  constructor(taskId: string, expectedRevision: number, actualRevision: number) {
    super(
      `Canvas Agent task revision conflict for ${taskId}: expected ${expectedRevision}, actual ${actualRevision}`
    )
    this.name = "AgentTaskRevisionConflictError"
  }
}

export async function createStoredAgentTask(task: AgentTask, root?: string) {
  const parsed = agentTaskSchema.parse(task)
  const path = taskPath(parsed.id, root)
  if (await readStoredTask(path)) {
    throw new AgentTaskAlreadyExistsError(parsed.id)
  }

  await writeTaskAtomically(path, parsed)
  return {
    task: parsed,
    relativePath: taskRelativePath(parsed.id),
  } satisfies StoredAgentTask
}

export async function getStoredAgentTask(
  taskId: string,
  root?: string
): Promise<StoredAgentTask | null> {
  const parsedTaskId = agentTaskIdSchema.parse(taskId)
  const task = await readStoredTask(taskPath(parsedTaskId, root))
  return task
    ? {
        task,
        relativePath: taskRelativePath(parsedTaskId),
      }
    : null
}

export async function listStoredAgentTasks(root?: string) {
  const directory = tasksDirectory(root)
  let files: string[]
  try {
    files = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }

  const tasks = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => readStoredTask(join(directory, file)))
    )
  ).filter((task): task is AgentTask => Boolean(task))

  return tasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function saveStoredAgentTask(
  task: AgentTask,
  expectedRevision: number,
  root?: string
) {
  const parsed = agentTaskSchema.parse(task)
  const path = taskPath(parsed.id, root)
  const current = await readStoredTask(path)
  if (!current) {
    throw new AgentTaskNotFoundError(parsed.id)
  }
  if (current.revision !== expectedRevision) {
    throw new AgentTaskRevisionConflictError(
      parsed.id,
      expectedRevision,
      current.revision
    )
  }
  if (parsed.revision !== expectedRevision + 1) {
    throw new AgentTaskRevisionConflictError(
      parsed.id,
      expectedRevision + 1,
      parsed.revision
    )
  }

  await writeTaskAtomically(path, parsed)
  return {
    task: parsed,
    relativePath: taskRelativePath(parsed.id),
  } satisfies StoredAgentTask
}
