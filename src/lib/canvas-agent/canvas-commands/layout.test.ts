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

function model3d(id: string): AgentArtifact {
  return {
    kind: "model3d",
    id,
    sourceContextSnapshotId: "context-model",
    createdAt,
    spec: {
      version: 1,
      mode: "procedural-three",
      title: "真实 3D 模型",
      sourceSummary: "一个程序化主体。",
      qualityContract: "保持主体轮廓和可交互结构。",
      suitability: "pass",
      components: [{
        id: "body",
        name: "主体",
        primitive: "box",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#303034",
        roughness: 0.7,
        metalness: 0.1,
      }],
      camera: { position: [3, 2, 5], target: [0, 0, 0], fov: 40 },
      lighting: {
        ambientIntensity: 1,
        keyIntensity: 2,
        keyPosition: [4, 5, 6],
      },
      assumptions: [],
    },
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
      { x: 1160, y: 80, w: 640, h: 360 },
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

  it("moves the whole aligned grid past occupied canvases", () => {
    const results = layoutAgentArtifacts({
      artifacts: [
        image("portrait", 300, 500),
        image("landscape", 640, 360),
        image("square", 400, 400),
        image("small", 240, 240),
      ],
      sourceBounds: { x: 100, y: 80, w: 500, h: 500 },
      viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
      occupiedBounds: [
        { x: 100, y: 80, w: 500, h: 500 },
        { x: 650, y: 40, w: 700, h: 1100 },
      ],
      gap: 80,
    })

    expect(results.map(({ bounds }) => bounds)).toEqual([
      { x: 1430, y: 80, w: 300, h: 500 },
      { x: 1910, y: 80, w: 640, h: 360 },
      { x: 1430, y: 660, w: 400, h: 400 },
      { x: 1910, y: 660, w: 240, h: 240 },
    ])
    expect(results[0]?.bounds.x).toBe(results[2]?.bounds.x)
    expect(results[1]?.bounds.x).toBe(results[3]?.bounds.x)
  })

  it("reserves the complete grid rectangle instead of filling its visual gaps", () => {
    const results = layoutAgentArtifacts({
      artifacts: [
        image("portrait", 300, 500),
        image("landscape", 640, 360),
        image("square", 400, 400),
        image("small", 240, 240),
      ],
      sourceBounds: { x: 100, y: 80, w: 500, h: 500 },
      viewportBounds: { x: 0, y: 0, w: 1600, h: 900 },
      occupiedBounds: [{ x: 1300, y: 540, w: 100, h: 10 }],
      gap: 80,
    })

    expect(results[0]?.bounds.x).toBe(1480)
    expect(results[1]?.bounds.x).toBe(1960)
    expect(results[2]?.bounds.x).toBe(1480)
    expect(results[3]?.bounds.x).toBe(1960)
  })
})

describe("buildAgentCanvasCommandBatch", () => {
  it("places generated media directly beside its task prompt canvas", () => {
    const source = task({
      "step-a": [image("image-a", 300, 400)],
    })
    const batch = buildAgentCanvasCommandBatch({
      task: source,
      sourceBounds: { x: 0, y: 0, w: 480, h: 270 },
      viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
      occupiedBounds: [
        { x: 0, y: 0, w: 480, h: 270 },
        {
          x: 560,
          y: 40,
          w: 440,
          h: 760,
          taskId: source.id,
        },
      ],
    })

    const imageCommand = batch.commands.find(
      (command) => command.type === "create-image-node"
    )
    expect(imageCommand).toMatchObject({
      type: "create-image-node",
      bounds: { x: 1064, y: 40, w: 300, h: 400 },
    })
  })

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

  it("lays out the four image-to-3D reference views in a stable 2 by 2 grid", () => {
    const source = task({
      "generate-1": [image("front", 1024, 1024)],
      "generate-2": [image("side", 1024, 1024)],
      "generate-3": [image("back", 1024, 1024)],
      "generate-4": [image("top", 1024, 1024)],
    })
    source.compiledPrompt = {
      originalGoal: "把复古相机转成 3D 参考",
      summary: "图片转 3D：四视角建模参考",
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
      ],
    }

    const batch = buildAgentCanvasCommandBatch({
      task: source,
      sourceBounds: { x: 0, y: 0, w: 480, h: 480 },
      viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
      gap: 64,
    })
    expect(
      batch.commands.some(
        (command) =>
          command.type === "create-3d-preview-node" ||
          command.type === "create-3d-model-node" ||
          command.type === "create-video-node"
      )
    ).toBe(false)
    expect(
      batch.commands
        .filter((command) => command.type === "create-image-node")
        .map((command) => command.bounds)
    ).toEqual([
      { x: 544, y: 0, w: 1024, h: 1024 },
      { x: 1632, y: 0, w: 1024, h: 1024 },
      { x: 544, y: 1088, w: 1024, h: 1024 },
      { x: 1632, y: 1088, w: 1024, h: 1024 },
    ])
    expect(batch.commands).toContainEqual({
      type: "set-recommended-result",
      nodeRef: "result-front",
    })
    expect(batch.commands).toContainEqual({
      type: "focus-results",
      nodeRefs: [
        "result-front",
        "result-side",
        "result-back",
        "result-top",
      ],
    })
  })

  it("links each world video to its generated scene image on the canvas", () => {
    const source = task({
      "generate-1": [image("world-image-1", 1024, 576)],
      "generate-2": [video("world-video-1")],
      "generate-3": [image("world-image-2", 1024, 576)],
      "generate-4": [video("world-video-2")],
    })
    source.executionPlan = {
      version: 1,
      taskId: source.id,
      summary: "世界 Skill",
      maxParallelism: 2,
      maxGeneratedNodes: 4,
      steps: [1, 2, 3, 4].map((index) => ({
        id: `generate-${index}`,
        title: `生成 ${index}`,
        tool: index % 2 === 0 ? "generate_video" as const : "generate_image" as const,
        dependsOn: [],
        status: "completed" as const,
        attempts: 1,
        input: {},
        outputRefs: [],
      })),
    }
    source.compiledPrompt = {
      originalGoal: "创建连续世界",
      summary: "世界 Skill：2 个连续场景",
      sharedConstraints: [],
      outputs: [1, 2].flatMap((scene) => {
        const number = String(scene).padStart(2, "0")
        return [
          {
            id: `world-image-output-${scene}`,
            mediaType: "image" as const,
            operation: "create" as const,
            prompt: `场景 ${scene}`,
            variantKey: `world-scene-${number}-image`,
            width: 1024,
            height: 576,
          },
          {
            id: `world-video-output-${scene}`,
            mediaType: "video" as const,
            operation: "animate" as const,
            prompt: `运镜 ${scene}`,
            variantKey: `world-scene-${number}-video`,
            durationSeconds: 5,
            resolution: "720p",
          },
        ]
      }),
    }

    const batch = buildAgentCanvasCommandBatch({
      task: source,
      sourceBounds: { x: 0, y: 0, w: 480, h: 270 },
      viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
    })

    expect(batch.commands).toContainEqual({
      type: "connect-nodes",
      sourceNodeRef: "result-world-image-1",
      targetNodeRef: "result-world-video-1",
    })
    expect(batch.commands).toContainEqual({
      type: "connect-nodes",
      sourceNodeRef: "result-world-image-2",
      targetNodeRef: "result-world-video-2",
    })
    expect(batch.commands).not.toContainEqual({
      type: "connect-nodes",
      sourceNodeId: "shape-source",
      targetNodeRef: "result-world-video-1",
    })
  })

  it("writes a real model artifact with a dedicated 3D command", () => {
    const source = task({ "generate-model": [model3d("model-1")] })
    const batch = buildAgentCanvasCommandBatch({
      task: source,
      sourceBounds: { x: 0, y: 0, w: 480, h: 480 },
      viewportBounds: { x: 0, y: 0, w: 1440, h: 900 },
    })

    expect(batch.commands).toContainEqual(expect.objectContaining({
      type: "create-3d-model-node",
      nodeRef: "result-model-1",
      bounds: expect.objectContaining({ w: 720, h: 720 }),
    }))
    expect(batch.commands.some(
      (command) => command.type === "create-image-node" || command.type === "create-video-node"
    )).toBe(false)
  })
})
