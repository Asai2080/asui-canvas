import {
  createImageGenerationAdapter,
  type ImageGenerationCredentials,
} from "./adapters/image-generation"
import {
  createVideoGenerationAdapter,
  type VideoGenerationCredentials,
} from "./adapters/video-generation"
import { createModel3dGenerationAdapter } from "./adapters/model3d-generation"
import {
  createTextModelAdapter,
  type TextModelCredentials,
  type TextModelConversationMessage,
  type TextModelInterpretationInput,
} from "./adapters/text-model"
import { getStoredCanvasContextSnapshot } from "./context/store"
import type { CanvasContextSnapshot } from "./context/schema"
import {
  executeAgentTask,
  type ExecuteAgentTaskDependencies,
} from "./executor"
import { createAgentPlan } from "./planner/planner"
import {
  buildProfessionalCreativeBrief,
  compileGenerationPrompt,
} from "./prompts/compiler"
import { resolveBuiltinSkillIntake } from "./skills/intake"
import { createSkillSnapshot } from "./skills/registry"
import {
  agentTaskSchema,
  type AgentInterpretation,
  type AgentTask,
} from "./task-schema"
import { transitionAgentTask } from "./task-machine"
import {
  AgentTaskNotFoundError,
  AgentTaskRevisionConflictError,
  getStoredAgentTask,
  saveStoredAgentTask,
} from "./task-store"

export type RunAgentTaskDependencies = {
  root?: string
  apiOrigin: string
  imageCredentials?: ImageGenerationCredentials
  videoCredentials?: VideoGenerationCredentials
  textCredentials?: TextModelCredentials
  imageAdapter?: ExecuteAgentTaskDependencies["imageAdapter"]
  videoAdapter?: ExecuteAgentTaskDependencies["videoAdapter"]
  textAdapter?: ReturnType<typeof createTextModelAdapter>
  conversationHistory?: TextModelConversationMessage[]
  now?: () => string
  createId?: (prefix: string) => string
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
])

function defaultNow() {
  return new Date().toISOString()
}

function skillSnapshotId(taskId: string) {
  return `${taskId.slice(0, 114)}-skill`
}

function localInterpretation(
  input: TextModelInterpretationInput,
  modelFallback = false,
  executionMode: AgentTask["executionMode"] = "confirm"
): AgentInterpretation {
  const instruction = input.userInstruction.trim()
  const video = /视频|动画|镜头|动起来|图生视频/.test(instruction)
  const creative = Boolean(
    input.skill ||
      input.context?.sourceNode ||
      /图|海报|主视觉|封面|插画|照片|广告|设计|logo|素材|画面|场景|分镜|做饭|烹饪|标注|修改|替换|抠图|动画|镜头|视频/i.test(
        instruction
      )
  )
  if (!creative) {
    const unsafeOperation =
      /代码|编程|shell|终端|命令|文件系统|读取文件|写入文件|密钥|API Key|联网搜索|网络请求/i.test(
        instruction
      )
    return {
      message: unsafeOperation
        ? "我目前专注于图片和视频创作，不能执行代码、文件、密钥或任意网络操作。你可以告诉我希望生成或修改什么画面。"
        : "有什么我可以帮你的吗？比如：\n\n• 生成图片\n• 生成视频\n\n请告诉我你的需求！",
      summary: unsafeOperation ? "超出图片和视频创作范围" : "普通对话",
      normalizedInstruction: instruction,
      intent: unsafeOperation ? "unsupported" : "conversation",
      source: "local-rules",
    }
  }
  return {
    message: modelFallback
      ? executionMode === "confirm"
        ? "文字模型暂时不可用，我已切换到本地规则整理专业提示词，确认后再执行。"
        : "文字模型暂时不可用，我已切换到本地规则规划，会继续生成并写回画布。"
      : executionMode === "confirm"
        ? "我会先整理专业提示词并同步到画布，等你确认后再开始生成。"
        : "我会先整理专业提示词和执行步骤，然后自动生成并写回画布。",
    summary:
      executionMode === "confirm"
        ? video
          ? "理解视频创作目标并等待提示词确认"
          : "理解图片创作目标并等待提示词确认"
        : video
          ? "理解视频创作目标并自动执行"
          : "理解图片创作目标并自动执行",
    normalizedInstruction: buildProfessionalCreativeBrief(
      instruction,
      video ? "video" : "image"
    ),
    intent: video ? "video" : "image",
    source: "local-rules",
    target: { mediaType: video ? "video" : "image" },
  }
}

function needsProfessionalExpansion(
  sourceInstruction: string,
  normalizedInstruction: string
) {
  const source = sourceInstruction.replace(/\s+/g, "").trim()
  const normalized = normalizedInstruction.replace(/\s+/g, "").trim()
  return (
    normalized.length < 180 ||
    normalized.length < Math.max(180, source.length * 2)
  )
}

function hasTextModelCredentials(credentials?: TextModelCredentials) {
  return Boolean(
    credentials?.baseUrl?.trim() &&
      credentials.apiKey?.trim() &&
      credentials.model?.trim()
  )
}

function hasImageGenerationCredentials(
  credentials?: ImageGenerationCredentials
) {
  return Boolean(credentials?.baseUrl?.trim() && credentials.apiKey?.trim())
}

function hasVideoGenerationCredentials(
  credentials?: VideoGenerationCredentials
) {
  return Boolean(
    credentials?.videoBaseUrl?.trim() &&
      credentials.videoApiKey?.trim() &&
      credentials.videoModel?.trim()
  )
}

function creativeContextForTask(context?: CanvasContextSnapshot) {
  if (!context) return context
  const source = context.sourceNode
  return {
    ...context,
    connectedNodes: context.connectedNodes.filter(
      (node) =>
        node.parentNodeId === source?.id ||
        source?.parentNodeId === node.id
    ),
  }
}

async function understandTask(
  task: AgentTask,
  dependencies: RunAgentTaskDependencies
): Promise<AgentInterpretation> {
  const timestamp = (dependencies.now ?? defaultNow)()
  const [context, skill] = await Promise.all([
    loadContext(task, dependencies.root),
    loadSkill(task, dependencies.root, timestamp),
  ])
  const creativeContext = creativeContextForTask(context)
  const intake = resolveBuiltinSkillIntake({
    userInstruction: task.userInstruction,
    context: creativeContext,
    skill,
    conversationHistory: dependencies.conversationHistory,
    generationCapabilities: {
      image: Boolean(
        dependencies.imageAdapter ||
          hasImageGenerationCredentials(dependencies.imageCredentials)
      ),
      video: Boolean(
        dependencies.videoAdapter ||
          hasVideoGenerationCredentials(dependencies.videoCredentials)
      ),
    },
  })
  if (intake.clarification) return intake.clarification
  const input = {
    userInstruction: task.userInstruction,
    context: creativeContext,
    skill,
    conversationHistory: dependencies.conversationHistory,
  }
  const resolvedInput = {
    ...input,
    userInstruction: intake.resolvedInstruction,
  }
  const useTextModel = Boolean(
    dependencies.textAdapter || hasTextModelCredentials(dependencies.textCredentials)
  )
  if (!useTextModel) {
    return localInterpretation(resolvedInput, false, task.executionMode)
  }

  try {
    const interpreted = await (
      dependencies.textAdapter ?? createTextModelAdapter()
    ).interpret(resolvedInput, dependencies.textCredentials ?? {})
    const creativeIntent =
      interpreted.intent === "image" || interpreted.intent === "video"
        ? interpreted.intent
        : undefined
    const normalizedInstruction =
      creativeIntent &&
      needsProfessionalExpansion(
        intake.resolvedInstruction,
        interpreted.normalizedInstruction
      )
        ? [
            interpreted.normalizedInstruction.trim(),
            buildProfessionalCreativeBrief(
              intake.resolvedInstruction,
              creativeIntent
            ),
          ]
            .filter(Boolean)
            .join("\n\n")
        : interpreted.normalizedInstruction

    return {
      ...interpreted,
      normalizedInstruction,
      source: "text-model",
      target:
        interpreted.intent === "unsupported" ||
        interpreted.intent === "conversation"
          ? undefined
          : {
              ...interpreted.target,
              mediaType: interpreted.intent,
            },
    }
  } catch {
    return localInterpretation(resolvedInput, true, task.executionMode)
  }
}

async function loadContext(task: AgentTask, root?: string) {
  if (!task.contextSnapshotId) return undefined
  const stored = await getStoredCanvasContextSnapshot(
    task.contextSnapshotId,
    root
  )
  if (!stored) {
    throw new Error(`画布上下文不存在：${task.contextSnapshotId}`)
  }
  return stored.snapshot
}

async function loadSkill(task: AgentTask, root?: string, now?: string) {
  if (!task.skillId) return undefined
  return createSkillSnapshot(task.skillId, skillSnapshotId(task.id), root, {
    now,
  })
}

async function persistTransition(
  task: AgentTask,
  status: Parameters<typeof transitionAgentTask>[1],
  dependencies: RunAgentTaskDependencies,
  extend?: (next: AgentTask) => AgentTask
) {
  const next = transitionAgentTask(task, status, {
    now: (dependencies.now ?? defaultNow)(),
    eventId: (dependencies.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`))(
      "event"
    ),
  })
  const parsed = agentTaskSchema.parse(extend ? extend(next) : next)
  return (await saveStoredAgentTask(parsed, task.revision, dependencies.root))
    .task
}

function sanitizedMessage(
  error: unknown,
  dependencies: RunAgentTaskDependencies
) {
  let message = error instanceof Error ? error.message : "Agent 任务执行失败"
  const secrets = [
    dependencies.imageCredentials?.apiKey,
    dependencies.videoCredentials?.videoApiKey,
    dependencies.textCredentials?.apiKey,
  ].filter((value): value is string => Boolean(value))
  for (const secret of secrets) {
    message = message.split(secret).join("[REDACTED]")
  }
  return message.slice(0, 1200)
}

async function failTask(
  task: AgentTask,
  error: unknown,
  dependencies: RunAgentTaskDependencies
) {
  if (TERMINAL_STATUSES.has(task.status)) return task
  const next = transitionAgentTask(task, "failed", {
    now: (dependencies.now ?? defaultNow)(),
    eventId: (dependencies.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`))(
      "event"
    ),
    error: {
      code: "AGENT_EXECUTION_FAILED",
      message: sanitizedMessage(error, dependencies),
      retryable: true,
      stepId: task.activeStepId,
    },
  })
  return (await saveStoredAgentTask(next, task.revision, dependencies.root)).task
}

function completePreparationSteps(task: AgentTask) {
  if (!task.executionPlan) return task
  return {
    ...task,
    executionPlan: {
      ...task.executionPlan,
      steps: task.executionPlan.steps.map((step) =>
        step.id === "read-context" || step.id === "compile-prompt"
          ? { ...step, status: "completed" as const, attempts: 1 }
          : step
      ),
    },
  }
}

export async function runAgentTaskTick(
  taskId: string,
  dependencies: RunAgentTaskDependencies
): Promise<AgentTask> {
  const stored = await getStoredAgentTask(taskId, dependencies.root)
  if (!stored) throw new AgentTaskNotFoundError(taskId)
  const task = stored.task

  if (
    TERMINAL_STATUSES.has(task.status) ||
    task.status === "writing-canvas" ||
    task.status === "awaiting-confirmation"
  ) {
    return task
  }

  try {
    if (task.status === "queued") {
      return await persistTransition(task, "understanding", dependencies)
    }

    if (task.status === "understanding") {
      const interpretation = await understandTask(task, dependencies)
      if (
        interpretation.intent === "unsupported" ||
        interpretation.intent === "conversation"
      ) {
        return await persistTransition(task, "completed", dependencies, (next) => ({
          ...next,
          interpretation,
        }))
      }
      const next = task.skillId
        ? "reading-skill"
        : task.contextSnapshotId
          ? "reading-canvas"
          : "compiling-prompt"
      return await persistTransition(task, next, dependencies, (nextTask) => ({
        ...nextTask,
        interpretation,
      }))
    }

    if (task.status === "reading-skill") {
      await loadSkill(task, dependencies.root, (dependencies.now ?? defaultNow)())
      return await persistTransition(
        task,
        task.contextSnapshotId ? "reading-canvas" : "compiling-prompt",
        dependencies
      )
    }

    if (task.status === "reading-canvas") {
      await loadContext(task, dependencies.root)
      return await persistTransition(task, "compiling-prompt", dependencies)
    }

    if (task.status === "compiling-prompt") {
      const timestamp = (dependencies.now ?? defaultNow)()
      const [context, skill] = await Promise.all([
        loadContext(task, dependencies.root),
        loadSkill(task, dependencies.root, timestamp),
      ])
      const creativeContext = creativeContextForTask(context)
      const compiledPrompt = compileGenerationPrompt({
        taskId: task.id,
        userInstruction:
          task.interpretation?.normalizedInstruction ?? task.userInstruction,
        sourceInstruction: task.userInstruction,
        context: creativeContext,
        skill,
        target: {
          ...task.interpretation?.target,
          count:
            task.requestedOutputCount ??
            task.interpretation?.target?.count,
          width:
            task.requestedWidth ??
            task.interpretation?.target?.width,
          height:
            task.requestedHeight ??
            task.interpretation?.target?.height,
        },
      })
      return await persistTransition(
        task,
        task.executionMode === "confirm"
          ? "awaiting-confirmation"
          : "planning",
        dependencies,
        (next) => ({
          ...next,
          compiledPrompt,
        })
      )
    }

    if (task.status === "planning") {
      if (!task.compiledPrompt) throw new Error("任务缺少已编译提示词")
      const executionPlan = createAgentPlan({
        taskId: task.id,
        compiledPrompt: task.compiledPrompt,
        contextSnapshotId: task.contextSnapshotId,
      })
      return await persistTransition(task, "executing", dependencies, (next) =>
        completePreparationSteps({ ...next, executionPlan })
      )
    }

    if (task.status === "executing") {
      return await executeAgentTask(task.id, {
        root: dependencies.root,
        imageAdapter:
          dependencies.imageAdapter ??
          createImageGenerationAdapter({ apiOrigin: dependencies.apiOrigin }),
        videoAdapter:
          dependencies.videoAdapter ??
          createVideoGenerationAdapter({ apiOrigin: dependencies.apiOrigin }),
        model3dAdapter: createModel3dGenerationAdapter({
          apiOrigin: dependencies.apiOrigin,
        }),
        imageCredentials: dependencies.imageCredentials,
        videoCredentials: dependencies.videoCredentials,
        textCredentials: dependencies.textCredentials,
        now: dependencies.now,
        createId: dependencies.createId,
      })
    }

    return task
  } catch (error) {
    const latest = await getStoredAgentTask(task.id, dependencies.root)
    if (error instanceof AgentTaskRevisionConflictError && latest) {
      return latest.task
    }
    return failTask(latest?.task ?? task, error, dependencies)
  }
}
