import { describe, expect, it } from "vitest"
import * as THREE from "three"

import { buildProcedural3dModel } from "./build-model"
import { procedural3dModelSpecSchema } from "./model-schema"

describe("procedural 3D model builder", () => {
  it("builds real geometry with preserved component hierarchy", () => {
    const spec = procedural3dModelSpecSchema.parse({
      version: 1,
      mode: "procedural-three",
      title: "台灯",
      sourceSummary: "旋转体底座与曲线灯臂。",
      qualityContract: "保持曲线、连接与灯罩轮廓。",
      suitability: "pass",
      components: [
        {
          id: "base",
          name: "底座",
          primitive: "lathe",
          primitiveOptions: {
            profile: [[0.2, -0.2], [0.7, -0.1], [0.45, 0.2]],
          },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: "#202024",
          roughness: 0.45,
          metalness: 0.55,
        },
        {
          id: "arm",
          name: "灯臂",
          primitive: "tube",
          primitiveOptions: {
            path: [[0, 0, 0], [0.1, 0.8, 0], [0.7, 1.2, 0]],
            tubeRadius: 0.05,
          },
          parentId: "base",
          position: [0, 0.2, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: "#505058",
          roughness: 0.35,
          metalness: 0.75,
        },
      ],
      camera: { position: [3, 2, 5], target: [0, 0.6, 0], fov: 40 },
      lighting: { ambientIntensity: 1, keyIntensity: 2, keyPosition: [4, 5, 6] },
      assumptions: [],
    })

    const model = buildProcedural3dModel(spec)
    const meshes: THREE.Mesh[] = []
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object)
    })

    expect(meshes).toHaveLength(2)
    expect(meshes[0].geometry).toBeInstanceOf(THREE.LatheGeometry)
    expect(meshes[1].geometry).toBeInstanceOf(THREE.TubeGeometry)
    expect(model.getObjectByName("灯臂")?.parent?.name).toBe("底座")
  })
})
