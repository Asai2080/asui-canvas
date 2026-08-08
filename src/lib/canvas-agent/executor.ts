import type {
  AgentImageArtifact as AdapterImageArtifact,
  AgentImageFeedbackItem,
  AgentImageGenerationInput,
  ImageGenerationCredentials,
} from "./adapters/image-generation"
import type {
  AgentVideoArtifact as AdapterVideoArtifact,
  AgentVideoGenerationInput,
  AgentVideoPollResult,
  VideoGenerationCredentials,
} from "./adapters/video-generation"
import type {
  Model3dGenerationInput,
  createModel3dGenerationAdapter,
} from "./adapters/model3d-generation"
import type { TextModelCredentials } from "./adapters/text-model"
import type { TransparentImageProcessor } from "./adapters/transparent-image"
import { getStoredCanvasContextSnapshot } from "./context/store"
import type { StructuredAgentPlanStep } from "./planner/schema"
import {
  agentTaskSchema,
  type AgentArtifact,
  type AgentTask,
} from "./task-schema"
import {
  AgentTaskNotFoundError,
  getStoredAgentTask,
  saveStoredAgentTask,
} from "./task-store"
import { isCanvas3dStickerVariantKey } from "./skills/identifiers"
import { registeredAgentTools } from "./tools/registry"

type ImageAdapter = {
  generate(
    input: AgentImageGenerationInput,
    credentials?: ImageGenerationCredentials
  ): Promise<AdapterImageArtifact[]>
}

type VideoAdapter = {
  create(
    input: AgentVideoGenerationInput,
    credentials?: VideoGenerationCredentials
  ): Promise<{ taskId: string; status?: string; statusText?: string }>
  poll(
    taskId: string,
    input: AgentVideoGenerationInput,
    credentials?: VideoGenerationCredentials
  ): Promise<AgentVideoPollResult>
}

type Model3dAdapter = ReturnType<typeof createModel3dGenerationAdapter>

export type ExecuteAgentTaskDependencies = {
  root?: string
  imageAdapter: ImageAdapter
  videoAdapter: VideoAdapter
  model3dAdapter?: Model3dAdapter
  imageCredentials?: ImageGenerationCredentials
  videoCredentials?: VideoGenerationCredentials
  textCredentials?: TextModelCredentials
  transparentImageProcessor?: TransparentImageProcessor
  now?: () => string
  createId?: (prefix: string) => string
}

function requiresTrueAlpha(task: AgentTask, step: StructuredAgentPlanStep) {
  if (step.tool !== "generate_image" && step.tool !== "edit_image") {
    return false
  }
  const input =
    step.tool === "generate_image"
      ? registeredAgentTools.generate_image.parse(step.input)
      : registeredAgentTools.edit_image.parse(step.input)
  const output = task.compiledPrompt?.outputs.find(
    (candidate) => candidate.id === input.promptOutputId
  )
  return isCanvas3dStickerVariantKey(output?.variantKey)
}

const GENERATION_TOOLS = new Set([
  "generate_image",
  "edit_image",
  "generate_video",
  "generate_3d_model",
])

const VIDEO_JOB_SUBMITTED_MESSAGE = "视频任务已提交，等待供应商生成"
const VIDEO_JOB_TIMEOUT_MS = 30 * 60 * 1_000

const CANVAS_3D_STICKER_STYLE_REFERENCE_SRCS = [
  "/builtin-skill-assets/canvas-3d-sticker-characters-chibi.png",
  "/builtin-skill-assets/canvas-3d-sticker-isometric-city.png",
  "/builtin-skill-assets/canvas-3d-sticker-characters-heroic.png",
] as const

function defaultNow() {
  return new Date().toISOString()
}

function defaultCreateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function sourceImageSrc(
  snapshot: Awaited<ReturnType<typeof getStoredCanvasContextSnapshot>>
) {
  const media = snapshot?.snapshot.sourceNode?.media
  return media?.referenceType === "url" && media.mediaType === "image"
    ? media.src
    : undefined
}

function referenceImageSrcs(
  snapshot: Awaited<ReturnType<typeof getStoredCanvasContextSnapshot>>
) {
  return (
    snapshot?.snapshot.references.flatMap((reference) => {
      const media = reference.media
      return media?.referenceType === "url" && media.mediaType === "image"
        ? [media.src]
        : []
    }) ?? []
  )
}

function annotationFeedback(
  snapshot: Awaited<ReturnType<typeof getStoredCanvasContextSnapshot>>
): AgentImageFeedbackItem[] {
  return (
    snapshot?.snapshot.annotations.map((annotation) => ({
      label: annotation.id,
      text: annotation.text,
      taskType: "localized edit" as const,
      targetHint: annotation.text,
      bounds: annotation.normalizedBounds ?? annotation.bounds,
    })) ?? []
  )
}

function toStoredImageArtifact(
  artifact: AdapterImageArtifact,
  createId: (prefix: string) => string
): AgentArtifact {
  return {
    ...artifact,
    id: createId("artifact-image"),
  }
}

function toStoredVideoArtifact(
  artifact: AdapterVideoArtifact,
  createId: (prefix: string) => string
): AgentArtifact {
  return {
    ...artifact,
    id: createId("artifact-video"),
  }
}

async function model3dInputForStep(
  step: StructuredAgentPlanStep,
  root?: string
): Promise<Model3dGenerationInput & { contextSnapshotId: string }> {
  if (step.tool !== "generate_3d_model") {
    throw new Error(`步骤 ${step.id} 不是 3D 模型生成步骤`)
  }
  const input = registeredAgentTools.generate_3d_model.parse(step.input)
  const context = await loadContext(input.contextSnapshotId, root)
  const sourceImage = sourceImageSrc(context)
  if (!sourceImage) {
    throw new Error("图片转 3D 需要选中一个已保存的图片画布")
  }
  return {
    prompt: input.prompt,
    sourceImageSrc: sourceImage,
    contextSnapshotId: input.contextSnapshotId,
  }
}

function dependenciesCompleted(
  step: StructuredAgentPlanStep,
  steps: StructuredAgentPlanStep[]
) {
  return step.dependsOn.every(
    (dependencyId) =>
      steps.find((candidate) => candidate.id === dependencyId)?.status ===
      "completed"
  )
}

async function persistTask(
  task: AgentTask,
  root: string | undefined,
  now: () => string,
  mutate: (draft: AgentTask) => AgentTask
) {
  const next = agentTaskSchema.parse(
    mutate({
      ...task,
      revision: task.revision + 1,
      updatedAt: now(),
    })
  )
  return (await saveStoredAgentTask(next, task.revision, root)).task
}

async function loadContext(snapshotId: string, root?: string) {
  const stored = await getStoredCanvasContextSnapshot(snapshotId, root)
  if (!stored) {
    throw new Error(`画布上下文不存在：${snapshotId}`)
  }
  return stored
}

async function imageInputForStep(
  step: StructuredAgentPlanStep,
  root?: string
): Promise<AgentImageGenerationInput> {
  if (step.tool === "generate_image") {
    const input = registeredAgentTools.generate_image.parse(step.input)
    const context = input.contextSnapshotId
      ? await loadContext(input.contextSnapshotId, root)
      : null
    return {
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      width: input.width,
      height: input.height,
      count: 1,
      sourceImageSrc:
        input.referencePolicy === "none" ? undefined : sourceImageSrc(context),
      parentVersionId: context?.snapshot.sourceNode?.versionId,
      referenceImageSrcs:
        input.referencePolicy === "source-and-sticker-style"
          ? [...CANVAS_3D_STICKER_STYLE_REFERENCE_SRCS]
          : input.referencePolicy === "source-only" ||
              input.referencePolicy === "none"
            ? []
            : referenceImageSrcs(context),
    }
  }

  if (step.tool !== "edit_image") {
    throw new Error(`步骤 ${step.id} 不是图片生成步骤`)
  }

  const input = registeredAgentTools.edit_image.parse(step.input)
  const context = await loadContext(input.contextSnapshotId, root)
  const feedbackItems: AgentImageFeedbackItem[] = [
    ...annotationFeedback(context),
    ...input.regionalEdits.map((edit) => ({
      label: edit.annotationId,
      text: edit.instruction,
      taskType: "localized edit" as const,
      targetHint: edit.instruction,
      bounds: edit.region,
    })),
  ]

  return {
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    width: input.width,
    height: input.height,
    count: 1,
    sourceImageSrc: sourceImageSrc(context),
    parentVersionId: context.snapshot.sourceNode?.versionId,
    feedbackItems,
    referenceImageSrcs: referenceImageSrcs(context),
  }
}

async function videoInputForStep(
  step: StructuredAgentPlanStep,
  task: AgentTask,
  root?: string
): Promise<AgentVideoGenerationInput> {
  if (step.tool !== "generate_video") {
    throw new Error(`步骤 ${step.id} 不是视频生成步骤`)
  }
  const input = registeredAgentTools.generate_video.parse(step.input)
  const context = input.contextSnapshotId
    ? await loadContext(input.contextSnapshotId, root)
    : null
  const generatedSource = input.sourceStepId
    ? task.artifacts?.[input.sourceStepId]?.find(
        (artifact): artifact is Extract<AgentArtifact, { kind: "image" }> =>
          artifact.kind === "image"
      )
    : undefined

  return {
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    sourceImageSrc: generatedSource?.src ?? sourceImageSrc(context),
    referenceAssets:
      context?.snapshot.references.flatMap((reference) => {
        const media = reference.media
        return media?.referenceType === "url"
          ? [
              {
                id: reference.id,
                kind: media.mediaType,
                src: media.src,
                mimeType: media.mimeType,
              },
            ]
          : []
      }) ?? [],
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
  }
}

function withCompletedStep(
  task: AgentTask,
  stepId: string,
  artifacts: AgentArtifact[]
) {
  const outputRefs = artifacts.map((artifact) => artifact.id)
  return {
    ...task,
    artifacts: {
      ...task.artifacts,
      [stepId]: [...(task.artifacts?.[stepId] ?? []), ...artifacts],
    },
    executionPlan: task.executionPlan
      ? {
          ...task.executionPlan,
          steps: task.executionPlan.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status: "completed" as const,
                  outputRefs,
                }
              : step
          ),
        }
      : undefined,
    activeStepId: undefined,
  }
}

function generationIsComplete(task: AgentTask) {
  const generationSteps =
    task.executionPlan?.steps.filter((step) =>
      GENERATION_TOOLS.has(step.tool)
    ) ?? []
  return (
    generationSteps.length > 0 &&
    generationSteps.every((step) => step.status === "completed")
  )
}

function videoJobStartedAt(task: AgentTask, stepId: string) {
  return (
    [...task.history]
      .reverse()
      .find(
        (event) =>
          event.stepId === stepId &&
          event.message === VIDEO_JOB_SUBMITTED_MESSAGE
      )?.createdAt ?? task.updatedAt
  )
}

async function moveToWritingCanvas(
  task: AgentTask,
  dependencies: ExecuteAgentTaskDependencies,
  now: () => string
) {
  if (!generationIsComplete(task) || task.status === "writing-canvas") {
    return task
  }
  return persistTask(task, dependencies.root, now, (draft) => ({
    ...draft,
    status: "writing-canvas",
    history: [
      ...draft.history,
      {
        id: (dependencies.createId ?? defaultCreateId)("event"),
        status: "writing-canvas",
        message: "生成完成，等待写入画布",
        createdAt: now(),
      },
    ],
  }))
}

export async function executeAgentTask(
  taskId: string,
  dependencies: ExecuteAgentTaskDependencies
) {
  const stored = await getStoredAgentTask(taskId, dependencies.root)
  if (!stored) {
    throw new AgentTaskNotFoundError(taskId)
  }

  let task = stored.task
  if (task.status !== "executing" || !task.executionPlan) {
    return task
  }

  const now = dependencies.now ?? defaultNow
  const createId = dependencies.createId ?? defaultCreateId
  const generationStep = task.executionPlan.steps.find(
    (step) =>
      GENERATION_TOOLS.has(step.tool) &&
      (step.status === "pending" || step.status === "running") &&
      dependenciesCompleted(step, task.executionPlan?.steps ?? [])
  )

  if (!generationStep) {
    return moveToWritingCanvas(task, dependencies, now)
  }

  if (
    generationStep.tool === "generate_image" ||
    generationStep.tool === "edit_image"
  ) {
    const input = await imageInputForStep(generationStep, dependencies.root)
    const generatedArtifacts = await dependencies.imageAdapter.generate(
      input,
      dependencies.imageCredentials ?? {}
    )
    const readyArtifacts = requiresTrueAlpha(task, generationStep)
      ? await Promise.all(
          generatedArtifacts.map(async (artifact) => {
            if (!dependencies.transparentImageProcessor) {
              throw new Error("画布 3D 贴纸缺少透明背景校验与抠图处理器")
            }
            return dependencies.transparentImageProcessor(artifact)
          })
        )
      : generatedArtifacts
    const artifacts = readyArtifacts.map((artifact) =>
      toStoredImageArtifact(artifact, createId)
    )
    task = await persistTask(task, dependencies.root, now, (draft) =>
      withCompletedStep(
        {
          ...draft,
          executionPlan: draft.executionPlan
            ? {
                ...draft.executionPlan,
                steps: draft.executionPlan.steps.map((step) =>
                  step.id === generationStep.id
                    ? { ...step, attempts: step.attempts + 1 }
                    : step
                ),
              }
            : undefined,
        },
        generationStep.id,
        artifacts
      )
    )
    return moveToWritingCanvas(task, dependencies, now)
  }

  if (generationStep.tool === "generate_3d_model") {
    if (!dependencies.model3dAdapter) {
      throw new Error("3D 模型生成器未配置")
    }
    const input = await model3dInputForStep(
      generationStep,
      dependencies.root
    )
    const spec = await dependencies.model3dAdapter.generate(
      input,
      dependencies.textCredentials ?? {}
    )
    task = await persistTask(task, dependencies.root, now, (draft) =>
      withCompletedStep(
        {
          ...draft,
          executionPlan: draft.executionPlan
            ? {
                ...draft.executionPlan,
                steps: draft.executionPlan.steps.map((step) =>
                  step.id === generationStep.id
                    ? { ...step, attempts: step.attempts + 1 }
                    : step
                ),
              }
            : undefined,
        },
        generationStep.id,
        [
          {
            kind: "model3d",
            id: createId("artifact-model3d"),
            sourceContextSnapshotId: input.contextSnapshotId,
            spec,
            createdAt: now(),
          },
        ]
      )
    )
    return moveToWritingCanvas(task, dependencies, now)
  }

  const input = await videoInputForStep(
    generationStep,
    task,
    dependencies.root
  )
  const providerJobId = task.providerJobIds?.[generationStep.id]
  if (!providerJobId) {
    const providerTask = await dependencies.videoAdapter.create(
      input,
      dependencies.videoCredentials ?? {}
    )
    const submittedAt = now()
    return persistTask(task, dependencies.root, now, (draft) => ({
      ...draft,
      activeStepId: generationStep.id,
      providerJobIds: {
        ...draft.providerJobIds,
        [generationStep.id]: providerTask.taskId,
      },
      executionPlan: draft.executionPlan
        ? {
            ...draft.executionPlan,
            steps: draft.executionPlan.steps.map((step) =>
              step.id === generationStep.id
                ? {
                    ...step,
                    status: "running" as const,
                    attempts: step.attempts + 1,
                  }
                : step
            ),
          }
        : undefined,
      history: [
        ...draft.history,
        {
          id: createId("event"),
          status: "executing" as const,
          message: VIDEO_JOB_SUBMITTED_MESSAGE,
          createdAt: submittedAt,
          stepId: generationStep.id,
        },
      ],
    }))
  }

  const pollResult = await dependencies.videoAdapter.poll(
    providerJobId,
    input,
    dependencies.videoCredentials ?? {}
  )
  if (pollResult.state === "pending") {
    const elapsed =
      Date.parse(now()) - Date.parse(videoJobStartedAt(task, generationStep.id))
    if (Number.isFinite(elapsed) && elapsed > VIDEO_JOB_TIMEOUT_MS) {
      throw new Error(
        `视频任务等待超过 30 分钟（任务 ID：${providerJobId}），请重试或检查供应商控制台`
      )
    }
    // Persist every provider status check so the client receives a new
    // revision and schedules the next poll. Returning the unchanged task
    // leaves the client-side revision guard permanently locked.
    return persistTask(task, dependencies.root, now, (draft) => draft)
  }

  task = await persistTask(task, dependencies.root, now, (draft) =>
    withCompletedStep(draft, generationStep.id, [
      toStoredVideoArtifact(pollResult.artifact, createId),
    ])
  )
  return moveToWritingCanvas(task, dependencies, now)
}
