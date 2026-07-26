import { describe, expect, it } from "vitest"

import {
  agentArtifactSchema,
  agentTaskSchema,
  compiledPromptSchema,
  type AgentTask,
  type CompiledPrompt,
} from "./task-schema"

describe("canvas agent schemas", () => {
  it("serializes and parses a queued task without losing its execution history", () => {
    const task: AgentTask = {
      id: "agent-task-123",
      revision: 0,
      source: "asui-canvas-agent",
      status: "queued",
      userInstruction: "生成 4 张国风茶饮海报",
      contextSnapshotId: "context-123",
      resultNodeIds: [],
      createdAt: "2026-07-25T01:00:00.000Z",
      updatedAt: "2026-07-25T01:00:00.000Z",
      history: [
        {
          id: "event-123",
          status: "queued",
          message: "任务已进入队列",
          createdAt: "2026-07-25T01:00:00.000Z",
        },
      ],
    }

    expect(agentTaskSchema.parse(JSON.parse(JSON.stringify(task)))).toEqual(task)
  })

  it("rejects task ids that could escape the task directory", () => {
    expect(() =>
      agentTaskSchema.parse({
        id: "../outside",
        revision: 0,
        source: "asui-canvas-agent",
        status: "queued",
        userInstruction: "生成图片",
        resultNodeIds: [],
        createdAt: "2026-07-25T01:00:00.000Z",
        updatedAt: "2026-07-25T01:00:00.000Z",
        history: [],
      })
    ).toThrow()
  })

  it("represents the final prompts shown to the user", () => {
    const prompt: CompiledPrompt = {
      summary: "四张统一视觉风格的国风茶饮海报",
      sharedConstraints: ["3:4", "保留品牌识别"],
      outputs: [
        {
          id: "output-1",
          mediaType: "image",
          prompt: "国风茶饮海报，竹影与青瓷",
          negativePrompt: "避免模糊文字",
          width: 768,
          height: 1024,
        },
      ],
    }

    expect(compiledPromptSchema.parse(prompt)).toEqual(prompt)
  })

  it("persists a structured execution plan and generated artifacts", () => {
    const parsed = agentTaskSchema.parse({
      id: "agent-task-structured",
      revision: 3,
      source: "asui-canvas-agent",
      status: "executing",
      userInstruction: "生成一张海报",
      executionPlan: {
        version: 1,
        taskId: "agent-task-structured",
        summary: "生成海报",
        maxParallelism: 1,
        maxGeneratedNodes: 1,
        steps: [
          {
            id: "generate-1",
            title: "生成图片 1",
            tool: "generate_image",
            dependsOn: [],
            status: "completed",
            attempts: 1,
            input: {
              prompt: "绿色环保海报",
              width: 768,
              height: 1024,
              count: 1,
            },
            outputRefs: ["artifact-image-1"],
          },
        ],
      },
      artifacts: {
        "generate-1": [
          {
            kind: "image",
            id: "artifact-image-1",
            versionId: "version-image-1",
            src: "data:image/png;base64,abc",
            prompt: "绿色环保海报",
            width: 768,
            height: 1024,
            createdAt: "2026-07-25T01:01:00.000Z",
          },
        ],
      },
      resultNodeIds: [],
      createdAt: "2026-07-25T01:00:00.000Z",
      updatedAt: "2026-07-25T01:01:00.000Z",
      history: [],
    })

    expect(parsed.executionPlan?.steps[0]?.outputRefs).toEqual([
      "artifact-image-1",
    ])
    expect(
      agentArtifactSchema.parse(parsed.artifacts?.["generate-1"]?.[0])
    ).toMatchObject({
      kind: "image",
      id: "artifact-image-1",
      width: 768,
      height: 1024,
    })
  })

  it("never keeps generation credentials in the persisted task", () => {
    const parsed = agentTaskSchema.parse({
      id: "agent-task-no-secrets",
      revision: 0,
      source: "asui-canvas-agent",
      status: "queued",
      userInstruction: "生成图片",
      imageApiKey: "sk-secret",
      videoApiKey: "ark-secret",
      baseUrl: "https://secret.example.com",
      credentials: {
        apiKey: "nested-secret",
      },
      resultNodeIds: [],
      createdAt: "2026-07-25T01:00:00.000Z",
      updatedAt: "2026-07-25T01:00:00.000Z",
      history: [],
    })

    expect(parsed).not.toHaveProperty("credentials")
    expect(parsed).not.toHaveProperty("imageApiKey")
    expect(parsed).not.toHaveProperty("videoApiKey")
    expect(parsed).not.toHaveProperty("baseUrl")
  })
})
