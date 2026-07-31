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

export type ExecuteAgentTaskDependencies = {
  root?: string
  imageAdapter: ImageAdapter
  videoAdapter: VideoAdapter
  imageCredentials?: ImageGenerationCredentials
  videoCredentials?: VideoGenerationCredentials
  now?: () => string
  createId?: (prefix: string) => string
}

const GENERATION_TOOLS = new Set([
  "generate_image",
  "edit_image",
  "generate_video",
])

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
      sourceImageSrc: sourceImageSrc(context),
      parentVersionId: context?.snapshot.sourceNode?.versionId,
      referenceImageSrcs: referenceImageSrcs(context),
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
    const artifacts = (
      await dependencies.imageAdapter.generate(
        input,
        dependencies.imageCredentials ?? {}
      )
    ).map((artifact) => toStoredImageArtifact(artifact, createId))
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
    }))
  }

  const pollResult = await dependencies.videoAdapter.poll(
    providerJobId,
    input,
    dependencies.videoCredentials ?? {}
  )
  if (pollResult.state === "pending") {
    return task
  }

  task = await persistTask(task, dependencies.root, now, (draft) =>
    withCompletedStep(draft, generationStep.id, [
      toStoredVideoArtifact(pollResult.artifact, createId),
    ])
  )
  return moveToWritingCanvas(task, dependencies, now)
}
