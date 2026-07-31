import { describe, expect, it } from "vitest"

import { procedural3dModelSpecSchema } from "./model-schema"

describe("procedural 3D model schema", () => {
  it("rejects texture-card proxies and unsupported primitives", () => {
    const result = procedural3dModelSpecSchema.safeParse({
      version: 1,
      mode: "procedural-three",
      title: "代理",
      sourceSummary: "把图片贴到平面上",
      qualityContract: "必须生成真实三维几何。",
      suitability: "pass",
      components: [
        {
          id: "card",
          name: "图片卡片",
          primitive: "plane-card",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: "#ffffff",
          roughness: 1,
          metalness: 0,
        },
      ],
      camera: { position: [0, 0, 5], target: [0, 0, 0], fov: 40 },
      lighting: {
        ambientIntensity: 1,
        keyIntensity: 2,
        keyPosition: [3, 4, 5],
      },
      assumptions: [],
    })

    expect(result.success).toBe(false)
  })

  it("accepts authored profiles and curved paths", () => {
    const result = procedural3dModelSpecSchema.safeParse({
      version: 1,
      mode: "procedural-three",
      title: "台灯",
      sourceSummary: "曲线灯臂连接旋转体灯罩。",
      qualityContract: "保持灯臂曲线和灯罩轮廓。",
      suitability: "pass",
      components: [
        {
          id: "arm",
          name: "灯臂",
          primitive: "tube",
          primitiveOptions: {
            path: [[0, 0, 0], [0.2, 0.8, 0], [0.7, 1.2, 0]],
            tubeRadius: 0.06,
          },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: "#303034",
          roughness: 0.4,
          metalness: 0.6,
        },
        {
          id: "shade",
          name: "灯罩",
          primitive: "lathe",
          primitiveOptions: {
            profile: [[0.08, -0.4], [0.5, -0.15], [0.4, 0.35]],
          },
          position: [0.7, 1.2, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: "#d8d3ca",
          roughness: 0.7,
          metalness: 0.05,
        },
      ],
      camera: { position: [3, 2, 5], target: [0, 0.6, 0], fov: 40 },
      lighting: { ambientIntensity: 1, keyIntensity: 2, keyPosition: [4, 5, 6] },
      assumptions: [],
    })

    expect(result.success).toBe(true)
  })
})
