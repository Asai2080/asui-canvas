import type { CompiledPrompt } from "../task-schema"
import {
  isAgentToolName,
  parseAgentToolInput,
  type AgentToolName,
} from "../tools/registry"
import {
  structuredAgentPlanSchema,
  type StructuredAgentPlan,
  type StructuredAgentPlanStep,
} from "./schema"

const MAX_IMAGE_OUTPUTS = 8
const MAX_VIDEO_DURATION_SECONDS = 15

export type CreateAgentPlanInput = {
  taskId: string
  compiledPrompt: CompiledPrompt
  contextSnapshotId?: string
}

function step(
  id: string,
  title: string,
  tool: AgentToolName,
  dependsOn: string[],
  input: Record<string, unknown>
): StructuredAgentPlanStep {
  return {
    id,
    title,
    tool,
    dependsOn,
    status: "pending",
    attempts: 0,
    input,
    outputRefs: [],
  }
}

export function createAgentPlan({
  taskId,
  compiledPrompt,
  contextSnapshotId,
}: CreateAgentPlanInput): StructuredAgentPlan {
  const imageOutputs = compiledPrompt.outputs.filter(
    (output) => output.mediaType === "image"
  )
  if (imageOutputs.length > MAX_IMAGE_OUTPUTS) {
    throw new Error(`图片数量最多为 ${MAX_IMAGE_OUTPUTS} 张`)
  }

  for (const output of compiledPrompt.outputs) {
    if (
      output.mediaType === "video" &&
      (output.durationSeconds ?? 4) > MAX_VIDEO_DURATION_SECONDS
    ) {
      throw new Error(`视频时长最多为 ${MAX_VIDEO_DURATION_SECONDS} 秒`)
    }
  }

  if (compiledPrompt.outputs.length > MAX_IMAGE_OUTPUTS) {
    throw new Error(`单次任务最多生成 ${MAX_IMAGE_OUTPUTS} 个画布节点`)
  }

  const steps: StructuredAgentPlanStep[] = []
  let prerequisiteIds: string[] = []

  if (contextSnapshotId) {
    steps.push(
      step("read-context", "读取当前画布", "read_canvas_context", [], {
        snapshotId: contextSnapshotId,
      })
    )
    prerequisiteIds = ["read-context"]
  }

  steps.push(
    step(
      "compile-prompt",
      "整理最终提示词",
      "compile_generation_prompt",
      prerequisiteIds,
      {
        taskId,
        contextSnapshotId,
        skillSnapshotId: compiledPrompt.skillSnapshotId,
        userInstruction:
          compiledPrompt.originalGoal ?? compiledPrompt.summary,
      }
    )
  )

  const generationSteps: StructuredAgentPlanStep[] =
    compiledPrompt.outputs.map((output, index) => {
      const id = `generate-${index + 1}`
      if (output.mediaType === "video") {
        return step(id, `生成视频 ${index + 1}`, "generate_video", [
          "compile-prompt",
        ], {
          promptOutputId: output.id,
          prompt: output.prompt,
          negativePrompt: output.negativePrompt,
          contextSnapshotId:
            output.sourceContextSnapshotId ?? contextSnapshotId,
          durationSeconds: output.durationSeconds ?? 4,
          resolution: output.resolution ?? "720p",
        })
      }

      if (output.operation === "edit") {
        const editContextId =
          output.sourceContextSnapshotId ?? contextSnapshotId
        if (!editContextId) {
          throw new Error("图片编辑任务缺少画布上下文")
        }
        return step(id, `修改图片 ${index + 1}`, "edit_image", [
          "compile-prompt",
        ], {
          promptOutputId: output.id,
          contextSnapshotId: editContextId,
          prompt: output.prompt,
          negativePrompt: output.negativePrompt,
          width: output.width ?? 1024,
          height: output.height ?? 1024,
          regionalEdits: output.regionalEdits ?? [],
        })
      }

      return step(id, `生成图片 ${index + 1}`, "generate_image", [
        "compile-prompt",
      ], {
        promptOutputId: output.id,
        prompt: output.prompt,
        negativePrompt: output.negativePrompt,
        width: output.width ?? 1024,
        height: output.height ?? 1024,
        count: 1,
      })
    })

  steps.push(...generationSteps)
  const generationStepIds = generationSteps.map(({ id }) => id)
  steps.push(
    step(
      "create-canvas-nodes",
      "将结果写入画布",
      "create_canvas_nodes",
      generationStepIds,
      {
        generationStepIds,
        placement: "right-of-source",
        retainOriginal: true,
      }
    )
  )
  steps.push(
    step(
      "connect-canvas-nodes",
      "连接版本关系",
      "connect_canvas_nodes",
      ["create-canvas-nodes"],
      {
        createStepId: "create-canvas-nodes",
        generationStepIds,
        contextSnapshotId,
      }
    )
  )

  const plan: StructuredAgentPlan = {
    version: 1,
    taskId,
    summary: compiledPrompt.summary,
    steps,
    maxParallelism: Math.min(3, Math.max(1, generationSteps.length)),
    maxGeneratedNodes: compiledPrompt.outputs.length,
  }

  return validateAgentPlan(plan)
}

function assertAcyclic(steps: StructuredAgentPlanStep[]) {
  const dependencies = new Map(
    steps.map((item) => [item.id, item.dependsOn] as const)
  )
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string) => {
    if (visiting.has(id)) {
      throw new Error("执行计划包含循环依赖")
    }
    if (visited.has(id)) return

    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) {
      if (!dependencies.has(dependency)) {
        throw new Error(`执行计划引用了不存在的步骤：${dependency}`)
      }
      visit(dependency)
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of dependencies.keys()) visit(id)
}

export function validateAgentPlan(plan: unknown): StructuredAgentPlan {
  if (
    typeof plan === "object" &&
    plan !== null &&
    Array.isArray((plan as { steps?: unknown }).steps)
  ) {
    for (const rawStep of (plan as { steps: Array<{ tool?: unknown }> }).steps) {
      if (
        typeof rawStep.tool !== "string" ||
        !isAgentToolName(rawStep.tool)
      ) {
        throw new Error(`未注册工具：${String(rawStep.tool)}`)
      }
    }
  }

  const parsed = structuredAgentPlanSchema.parse(plan)
  const ids = new Set<string>()
  for (const item of parsed.steps) {
    if (ids.has(item.id)) {
      throw new Error(`执行计划包含重复步骤：${item.id}`)
    }
    ids.add(item.id)
    parseAgentToolInput(item.tool, item.input)
  }
  assertAcyclic(parsed.steps)
  return parsed
}
