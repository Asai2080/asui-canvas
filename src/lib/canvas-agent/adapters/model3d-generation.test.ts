import { describe, expect, it, vi } from "vitest"

import { createModel3dGenerationAdapter } from "./model3d-generation"

const modelSpec = {
  version: 1,
  mode: "procedural-three",
  title: "复古相机",
  sourceSummary: "一台黑色复古相机，带圆柱形镜头。",
  qualityContract: "保持机身轮廓、镜头比例、连接关系和金属材质分区。",
  suitability: "pass",
  components: [
    {
      id: "camera-body",
      name: "机身",
      primitive: "box",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2, 1.2, 0.8],
      color: "#202124",
      roughness: 0.62,
      metalness: 0.18,
    },
    {
      id: "lens",
      name: "镜头",
      primitive: "cylinder",
      parentId: "camera-body",
      position: [0, 0, 0.58],
      rotation: [Math.PI / 2, 0, 0],
      scale: [0.72, 0.75, 0.72],
      color: "#151517",
      roughness: 0.35,
      metalness: 0.55,
    },
  ],
  camera: { position: [4, 3, 6], target: [0, 0, 0], fov: 38 },
  lighting: {
    ambientIntensity: 1.2,
    keyIntensity: 2.4,
    keyPosition: [4, 6, 5],
  },
  assumptions: ["背面控制结构按可见机身厚度保守闭合。"],
}

describe("model3d generation adapter", () => {
  it("sends the selected image to a vision model and validates real geometry", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "http://localhost:3030/api/canvas-assets/source.png") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        })
      }
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: unknown }>
      }
      expect(JSON.stringify(body.messages)).toContain("image_url")
      expect(JSON.stringify(body.messages)).toContain("data:image/png;base64")
      const isGeometryRequest = JSON.stringify(body.messages).includes(
        "Validated pre-spec assessment"
      )
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify(
              isGeometryRequest
                ? modelSpec
                : {
                    objectClass: "复古旁轴相机",
                    complexity: "moderate",
                    suitability: "pass",
                    observedStructure: ["矩形机身", "前置圆柱镜头"],
                    identityFeatures: ["镜头与机身的比例"],
                    materialZones: ["黑色机身与金属镜头"],
                    hiddenAreas: ["机身背面"],
                    qualityContract: modelSpec.qualityContract,
                  }
            ),
          },
        }],
      })
    })
    const adapter = createModel3dGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
    })

    const result = await adapter.generate(
      {
        prompt: "把选中的复古相机重建为 3D",
        sourceImageSrc: "/api/canvas-assets/source.png",
      },
      {
        baseUrl: "https://text.example.com/v1",
        apiKey: "secret",
        model: "vision-model",
      }
    )

    expect(result.components).toHaveLength(2)
    expect(result.components[1]).toMatchObject({
      primitive: "cylinder",
      parentId: "camera-body",
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("rejects cyclic component hierarchies", async () => {
    const cyclic = {
      ...modelSpec,
      components: modelSpec.components.map((component, index) => ({
        ...component,
        parentId: index === 0 ? "lens" : "camera-body",
      })),
    }
    const adapter = createModel3dGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(Response.json({
          choices: [{ message: { content: JSON.stringify({
            objectClass: "复古相机",
            complexity: "moderate",
            suitability: "pass",
            observedStructure: ["机身", "镜头"],
            identityFeatures: ["镜头"],
            materialZones: ["金属"],
            hiddenAreas: [],
            qualityContract: modelSpec.qualityContract,
          }) } }],
        }))
        .mockResolvedValueOnce(Response.json({
          choices: [{ message: { content: JSON.stringify(cyclic) } }],
        })),
    })

    await expect(
      adapter.generate(
        { prompt: "重建", sourceImageSrc: "https://example.com/source.png" },
        { baseUrl: "https://text.example.com/v1", apiKey: "secret", model: "vision" }
      )
    ).rejects.toThrow("层级存在循环")
  })
})
