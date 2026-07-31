import { describe, expect, it } from "vitest"

import type { AgentArtifact, AgentTask } from "../task-schema"
import {
  buildAgentCanvasCommandBatch,
  flattenAgentTaskArtifacts,
  layoutAgentArtifacts,
} from "./layout"

const createdAt = "2026-07-25T08:00:00.000Z"

function image(id: string, width: number, height: number): AgentArtifact {
  return {
    kind: "image",
    id,
    versionId: `version-${id}`,
    src: `https://example.com/${id}.png`,
    prompt: id,
    width,
    height,
    createdAt,
  }
}

function video(id: string): AgentArtifact {
  return {
    kind: "video",
    id,
    src: `https://example.com/${id}.mp4`,
    durationSeconds: 8,
    resolution: "720p",
  }
}

function task(artifacts: Record<string, AgentArtifact[]>): AgentTask {
  return {
    id: "agent-task-layout",
    revision: 4,
    source: "asui-canvas-agent",
    status: "writing-canvas",
    userInstruction: "生成结果",
    selectedCanvasId: "shape-source",
    resultNodeIds: [],
    artifacts,
    createdAt,
    updatedAt: createdAt,
    history: [
      {
        id: "event-layout",
        status: "writing-canvas",
        message: "等待写入",
        createdAt,
      },
    ],
    executionPlan: {
      version: 1,
      taskId: "agent-task-layout",
      summary: "稳定顺序",
      maxParallelism: 1,
      maxGeneratedNodes: 4,
      steps: [
        {
          id: "step-b",
          title: "第二步",
          tool: "generate_image",
          dependsOn: [],
          status: "completed",
          attempts: 1,
          input: { prompt: "b", count: 1, width: 400, height: 300 },
          outputRefs: ["image-b"],
        },
        {
          id: "step-a",
          title: "第一步",
          tool: "generate_image",
          dependsOn: [],
          status: "completed",
          attempts: 1,
          input: { prompt: "a", count: 1, width: 300, height: 400 },
          outputRefs: ["image-a"],
        },
      ],
    },
  }
}

describe("flattenAgentTaskArtifacts", () => {
  it("follows execution plan order and keeps partial results", () => {
    const artifacts = flattenAgentTaskArtifacts(
      task({
        "step-a": [image("image-a", 300, 400)],
        "step-b": [image("image-b", 400, 300)],
        "step-failed": [],
      })
    )

    expect(artifacts.map((artifact) => artifact.id)).toEqual([
      "image-b",
      "image-a",
    ])
  })
})

describe("layoutAgentArtifacts", () => {
  it("places results to the right of a source and preserves image sizes", () => {
    const results = layoutAgentArtifacts({
      artifacts: [
        image("portrait", 300, 500),
        image("landscape", 640, 360),
        image("square", 400, 400),
      ],
      sourceBounds: { x: 100, y: 80, w: 500, h: 500 },
      viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
      gap: 80,
    })

    expect(results.map((result) => result.bounds)).toEqual([
      { x: 680, y: 80, w: 300, h: 500 },
      { x: 1060, y: 80, w: 640, h: 360 },
      { x: 680, y: 660, w: 400, h: 400 },
    ])
  })

  it("centers a stable grid in the viewport when there is no source", () => {
    const results = layoutAgentArtifacts({
      artifacts: [image("one", 200, 200), video("two")],
      viewportBounds: { x: 100, y: 50, w: 1200, h: 800 },
      videoSize: { width: 320, height: 180 },
      gap: 40,
    })

    expect(results).toEqual([
      {
        artifact: expect.objectContaining({ id: "one" }),
        bounds: { x: 420, y: 350, w: 200, h: 200 },
      },
      {
        artifact: expect.objectContaining({ id: "two" }),
        bounds: { x: 660, y: 350, w: 320, h: 180 },
      },
    ])
  })
})

describe("buildAgentCanvasCommandBatch", () => {
  it("creates typed nodes, links them to the source, recommends and focuses", () => {
    const source = task({
      "step-a": [image("image-a", 300, 400)],
      "step-b": [video("video-b")],
    })
    const batch = buildAgentCanvasCommandBatch({
      task: source,
      sourceBounds: { x: 0, y: 0, w: 480, h: 270 },
      viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
    })

    expect(batch.commands.map((command) => command.type)).toEqual([
      "create-video-node",
      "connect-nodes",
      "create-image-node",
      "connect-nodes",
      "set-recommended-result",
      "focus-results",
    ])
    expect(batch.commands[0]).toMatchObject({
      type: "create-video-node",
      nodeRef: "result-video-b",
      bounds: { w: 480, h: 270 },
    })
    expect(batch.commands[2]).toMatchObject({
      type: "create-image-node",
      nodeRef: "result-image-a",
      bounds: { w: 300, h: 400 },
    })
    expect(batch.commands[1]).toEqual({
      type: "connect-nodes",
      sourceNodeId: "shape-source",
      targetNodeRef: "result-video-b",
    })
  })

  it("accepts a valid maximum-length task id when deriving the batch id", () => {
    const source = task({
      "step-a": [image("image-a", 300, 400)],
    })
    source.id = `task-${"a".repeat(123)}`

    expect(() =>
      buildAgentCanvasCommandBatch({
        task: source,
        viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
      })
    ).not.toThrow()
  })

  it("adds a typed interactive 3D proxy after four image-to-3D views", () => {
    const source = task({
      "generate-1": [image("front", 1024, 1024)],
      "generate-2": [image("side", 1024, 1024)],
      "generate-3": [image("back", 1024, 1024)],
      "generate-4": [image("top", 1024, 1024)],
      "generate-5": [video("turntable")],
    })
    source.compiledPrompt = {
      originalGoal: "把复古相机转成 3D 参考",
      summary: "图片转 3D：四视角参考与环绕预览",
      sharedConstraints: [],
      negativeConstraints: [],
      skillSnapshotId: "skill-image-to-3d",
      outputs: [
        {
          id: "output-front",
          mediaType: "image",
          operation: "create",
          prompt: "front",
          variantKey: "three-front-three-quarter",
          width: 1024,
          height: 1024,
        },
        {
          id: "output-side",
          mediaType: "image",
          operation: "create",
          prompt: "side",
          variantKey: "three-side-profile",
          width: 1024,
          height: 1024,
        },
        {
          id: "output-back",
          mediaType: "image",
          operation: "create",
          prompt: "back",
          variantKey: "three-rear-three-quarter",
          width: 1024,
          height: 1024,
        },
        {
          id: "output-top",
          mediaType: "image",
          operation: "create",
          prompt: "top",
          variantKey: "three-top-detail",
          width: 1024,
          height: 1024,
        },
        {
          id: "output-turntable",
          mediaType: "video",
          operation: "animate",
          prompt: "turntable",
          variantKey: "three-turntable",
          durationSeconds: 8,
          resolution: "720p",
        },
      ],
    }

    const batch = buildAgentCanvasCommandBatch({
      task: source,
      sourceBounds: { x: 0, y: 0, w: 480, h: 480 },
      viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
      gap: 64,
    })
    const preview = batch.commands.find(
      (command) => command.type === "create-3d-preview-node"
    )

    expect(preview).toEqual({
      type: "create-3d-preview-node",
      nodeRef: "safe-3d-preview",
      title: "3D 多视角代理",
      referenceNodeRefs: [
        "result-front",
        "result-side",
        "result-back",
        "result-top",
      ],
      bounds: {
        x: 544,
        y: 2720,
        w: 640,
        h: 640,
      },
    })
    expect(batch.commands).toContainEqual({
      type: "set-recommended-result",
      nodeRef: "safe-3d-preview",
    })
    expect(batch.commands).toContainEqual({
      type: "connect-nodes",
      sourceNodeId: "shape-source",
      targetNodeRef: "safe-3d-preview",
    })
  })
})
