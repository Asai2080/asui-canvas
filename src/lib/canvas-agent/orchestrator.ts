import {
  createImageGenerationAdapter,
  type ImageGenerationCredentials,
} from "./adapters/image-generation"
import {
  createVideoGenerationAdapter,
  type VideoGenerationCredentials,
} from "./adapters/video-generation"
import { createModel3dGenerationAdapter } from "./adapters/model3d-generation"
import { createTransparentImageProcessor } from "./adapters/transparent-image"
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
import {
  isIanXiaoheiSkillName,
  skillMediaIntent,
} from "./skills/identifiers"
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
  transparentImageProcessor?: ExecuteAgentTaskDependencies["transparentImageProcessor"]
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

const MAX_NORMALIZED_INSTRUCTION_LENGTH = 3_800

function boundedNormalizedInstruction(value: string) {
  const normalized = value.trim()
  if (normalized.length <= MAX_NORMALIZED_INSTRUCTION_LENGTH) {
    return normalized
  }

  const suffix =
    "\n\n【原始内容】完整原文已保留在任务输入中，生成阶段必须直接读取，不得以此摘要替代。"
  const available = MAX_NORMALIZED_INSTRUCTION_LENGTH - suffix.length
  const candidate = normalized.slice(0, available)
  const paragraphBoundary = candidate.lastIndexOf("\n\n")
  const sentenceBoundary = Math.max(
    candidate.lastIndexOf("。"),
    candidate.lastIndexOf("！"),
    candidate.lastIndexOf("？")
  )
  const minimumUsefulLength = Math.floor(available * 0.65)
  const boundary = Math.max(paragraphBoundary, sentenceBoundary)
  const compact =
    boundary >= minimumUsefulLength
      ? candidate.slice(0, boundary + 1).trim()
      : candidate.trim()
  return `${compact}${suffix}`
}

function ianArticleInterpretationBrief() {
  return [
    "【Ian 小蓝滴文章配图任务】",
    "完整原文已保留在任务输入中，生成阶段必须逐段读取，不在任务摘要中重复粘贴。",
    "",
    "【语义提炼】",
    "先提炼全文的核心观点、因果关系、方法步骤、决策冲突与结果反馈；每张图只承担一个不重复的认知锚点。",
    "",
    "【视觉转译】",
    "把认知锚点转译为小蓝滴亲自执行的具体动作，补齐道具、受力关系、环境反馈和结果状态；短标注只用于点题，不让文字代替画面叙事。",
    "",
    "【一致性】",
    "各张配图保持统一的小蓝滴角色、纯白背景、极简黑色手绘线条与红橙蓝点缀，但核心隐喻、动作和空间结构不得重复。",
  ].join("\n")
}

function buildInterpretationBrief(
  input: TextModelInterpretationInput,
  intent: "image" | "video"
) {
  if (isIanXiaoheiSkillName(input.skill?.name)) {
    return ianArticleInterpretationBrief()
  }
  return buildProfessionalCreativeBrief(input.userInstruction.trim(), intent)
}

function defaultNow() {
  return new Date().toISOString()
}

function skillSnapshotId(taskId: string) {
  return `${taskId.slice(0, 114)}-skill`
}

function creativeTaskSummary(
  intent: "image" | "video",
  executionMode: AgentTask["executionMode"]
) {
  if (executionMode === "confirm") {
    return intent === "video"
      ? "理解视频创作目标并等待提示词确认"
      : "理解图片创作目标并等待提示词确认"
  }
  return intent === "video"
    ? "理解视频创作目标并自动执行"
    : "理解图片创作目标并自动执行"
}

function inferExplicitCreativeIntent(
  instruction: string,
  skillName?: string,
  context?: CanvasContextSnapshot
): "image" | "video" | undefined {
  const lockedIntent = skillMediaIntent(skillName)
  if (lockedIntent) return lockedIntent

  if (/视频|动画|镜头|运镜|动起来|图生视频|短片|影片/i.test(instruction)) {
    return "video"
  }

  const directImageRequest = /生图|出图|生成图片|生成图像|画一[张幅]|绘制/i.test(
    instruction
  )
  const creationVerb =
    /生成|设计|制作|创建|画|绘制|做|修改|改成|优化|重做|排版|转成|变成/i
  const visualTarget =
    /图片|图像|海报|主视觉|封面|插画|照片|广告|logo|素材|画面|场景|分镜|APP\s*首页|应用首页|首页(?:界面|设计|页面)?|UI|UX|界面|页面|网页|落地页|启动页|弹窗|信息卡片|仪表盘|dashboard|小程序|图标|banner/i

  if (
    directImageRequest ||
    (creationVerb.test(instruction) && visualTarget.test(instruction)) ||
    context?.sourceNode?.media?.mediaType === "image"
  ) {
    return "image"
  }
  return undefined
}

function localInterpretation(
  input: TextModelInterpretationInput,
  modelFallback = false,
  executionMode: AgentTask["executionMode"] = "confirm"
): AgentInterpretation {
  const instruction = input.userInstruction.trim()
  const explicitIntent = inferExplicitCreativeIntent(
    instruction,
    input.skill?.name,
    input.context
  )
  const intent =
    explicitIntent ??
    (/视频|动画|镜头|动起来|图生视频/.test(instruction)
      ? "video"
      : "image")
  const video = intent === "video"
  const creative = Boolean(
    explicitIntent ||
      input.skill ||
      input.context?.sourceNode ||
      /图|海报|主视觉|封面|插画|照片|广告|设计|logo|素材|画面|场景|分镜|做饭|烹饪|标注|修改|替换|抠图|动画|镜头|视频|APP\s*首页|应用首页|UI|UX|界面|页面|网页|落地页|启动页|弹窗|仪表盘|dashboard|小程序/i.test(
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
      normalizedInstruction: boundedNormalizedInstruction(instruction),
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
    summary: creativeTaskSummary(intent, executionMode),
    normalizedInstruction: boundedNormalizedInstruction(
      buildInterpretationBrief(input, video ? "video" : "image")
    ),
    intent,
    source: "local-rules",
    target: { mediaType: intent },
  }
}

function isGenericCreativeBrief(
  sourceInstruction: string,
  normalizedInstruction: string
) {
  const scenarioChecks = [
    {
      active: /足球|踢球|射门/i.test(sourceInstruction),
      markers: [
        /支撑脚|重心/,
        /触球|摆腿|球路|射门/,
        /草叶|草屑|草坪/,
        /追球|前爪|耳朵|尾巴/,
        /专注|兴奋|笑意|视线.*球/,
      ],
    },
    {
      active: /做饭|烹饪|炒菜|厨房|备菜|下厨/i.test(sourceInstruction),
      markers: [
        /切配|下锅|装盘|翻炒/,
        /蒸汽|油光|食材/,
        /砧板|厨刀|炒锅/,
        /手部|视线|重心/,
      ],
    },
  ]
  const lacksScenarioDetail = scenarioChecks.some(
    ({ active, markers }) =>
      active && markers.filter((marker) => marker.test(normalizedInstruction)).length < 3
  )
  const genericPhrases = [
    /完整保留用户原始要求/,
    /主体明确/,
    /视觉层级清晰/,
    /高完成度/,
    /可直接交付/,
    /明确面部朝向/,
    /自然动作/,
  ].filter((phrase) => phrase.test(normalizedInstruction)).length
  const concreteEvidence = [
    /刚刚|刚要|即将|短暂|瞬间/,
    /支撑脚|重心转移|手指|脚内侧|前爪/,
    /追随|锁定|回望|凝视/,
    /压弯|扬起|飞溅|飘动|反射/,
    /侧后方|三角动线|前景.+中景|中景.+远景/,
  ].filter((marker) => marker.test(normalizedInstruction)).length
  return lacksScenarioDetail || (genericPhrases >= 3 && concreteEvidence < 2)
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
    conversationHistory: isIanXiaoheiSkillName(skill?.name)
      ? undefined
      : dependencies.conversationHistory,
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
    const explicitCreativeIntent = inferExplicitCreativeIntent(
      intake.resolvedInstruction,
      skill?.name,
      creativeContext
    )
    const modelCreativeIntent =
      interpreted.intent === "image" || interpreted.intent === "video"
        ? interpreted.intent
        : undefined
    const creativeIntent =
      skillMediaIntent(skill?.name) ??
      explicitCreativeIntent ??
      modelCreativeIntent
    const correctedSkillIntent =
      Boolean(creativeIntent) && creativeIntent !== modelCreativeIntent
    const modelBriefIsGeneric =
      creativeIntent &&
      isGenericCreativeBrief(
        intake.resolvedInstruction,
        interpreted.normalizedInstruction
      )
    const modelBriefConflictsWithIanSkill =
      isIanXiaoheiSkillName(skill?.name) && correctedSkillIntent
    const localBrief = creativeIntent
      ? buildInterpretationBrief(resolvedInput, creativeIntent)
      : undefined
    const modelBrief =
      !modelCreativeIntent || modelBriefIsGeneric || modelBriefConflictsWithIanSkill
        ? undefined
        : interpreted.normalizedInstruction.trim()
    const normalizedInstruction = boundedNormalizedInstruction(
      creativeIntent
        ? isIanXiaoheiSkillName(skill?.name)
          ? [localBrief, modelBrief].filter(Boolean).join("\n\n")
          : [modelBrief, localBrief].filter(Boolean).join("\n\n")
        : interpreted.normalizedInstruction
    )

    return {
      ...interpreted,
      message: correctedSkillIntent
        ? task.executionMode === "confirm"
          ? skill
            ? "我会按所选 Skill 整理专业图片提示词，确认后再开始生成。"
            : "我已识别为视觉设计任务，会先整理专业图片提示词，确认后再开始生成。"
          : skill
            ? "我会按所选 Skill 整理专业图片提示词，并自动生成后写回画布。"
            : "我已识别为视觉设计任务，会整理专业提示词并自动生成后写回画布。"
        : interpreted.message,
      summary:
        correctedSkillIntent && creativeIntent
          ? creativeTaskSummary(creativeIntent, task.executionMode)
          : interpreted.summary,
      normalizedInstruction,
      intent: creativeIntent ?? interpreted.intent,
      source: "text-model",
      target:
        !creativeIntent
          ? undefined
          : {
              ...interpreted.target,
              mediaType: creativeIntent,
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
  if (
    /normalizedInstruction/.test(message) &&
    /too_big|4000|4_000|<=\s*4000/i.test(message)
  ) {
    message =
      "文章内容较长，任务摘要未能完成压缩。完整原文仍已保留，请重试。"
  }
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
        transparentImageProcessor:
          dependencies.transparentImageProcessor ??
          createTransparentImageProcessor({
            apiOrigin: dependencies.apiOrigin,
          }),
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
