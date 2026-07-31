import { z } from "zod"

import {
  procedural3dModelSpecSchema,
  type Procedural3dModelSpec,
} from "../../canvas-3d/model-schema"
import type { TextModelCredentials } from "./text-model"

export type Model3dGenerationInput = {
  prompt: string
  sourceImageSrc: string
}

type Model3dGenerationAdapterOptions = {
  apiOrigin: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  output_text?: string
}

const MAX_SOURCE_BYTES = 16 * 1024 * 1024

const reconstructionAssessmentSchema = z
  .object({
    objectClass: z.string().trim().min(1).max(160),
    complexity: z.enum(["simple", "moderate", "complex", "ultra-complex"]),
    suitability: z.enum(["pass", "conditional"]),
    observedStructure: z.array(z.string().trim().min(1).max(240)).min(2).max(32),
    identityFeatures: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
    materialZones: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
    hiddenAreas: z.array(z.string().trim().min(1).max(240)).max(16),
    qualityContract: z.string().trim().min(1).max(1_500),
  })
  .strict()

type ReconstructionAssessment = z.infer<typeof reconstructionAssessmentSchema>

const ASSESSMENT_SYSTEM_PROMPT = `You are the intake and pre-spec assessment stage of the img2threejs workflow.
Analyze the selected image before authoring geometry. Return one JSON object only:
{
  "objectClass": string,
  "complexity": "simple" | "moderate" | "complex" | "ultra-complex",
  "suitability": "pass" | "conditional",
  "observedStructure": string[],
  "identityFeatures": string[],
  "materialZones": string[],
  "hiddenAreas": string[],
  "qualityContract": string
}
Separate direct visual observations from uncertain hidden structure. The quality contract must name the silhouette, proportion, attachment, material, and interaction conditions that the result must satisfy. Mark people, animals, foliage, transparent objects, soft cloth, and complete environments as conditional when a primitive procedural reconstruction cannot preserve full likeness. Do not include code, markdown, URLs, or hidden reasoning.`

const MODEL_SYSTEM_PROMPT = `You are the geometry authoring stage of the img2threejs workflow inside ASUI Canvas.
Analyze the selected reference image and return one JSON object only. The result will be interpreted as a real procedural THREE.Group, not as an image, texture cube, collage, or multiview mockup.

Use this exact structure:
{
  "version": 1,
  "mode": "procedural-three",
  "title": string,
  "sourceSummary": string,
  "qualityContract": string,
  "suitability": "pass" | "conditional",
  "components": [{
    "id": ASCII kebab-case string,
    "name": string,
    "primitive": "box" | "sphere" | "ellipsoid" | "cylinder" | "cone" | "capsule" | "torus" | "tube" | "lathe" | "extrude",
    "primitiveOptions": optional {
      "radiusTop": positive number,
      "radiusBottom": positive number,
      "radius": positive number,
      "length": positive number,
      "tubeRadius": positive number,
      "path": [[x,y,z], ...],
      "closed": boolean,
      "profile": [[x,y], ...],
      "depth": positive number
    },
    "parentId": optional component id,
    "position": [x,y,z],
    "rotation": [x,y,z] in radians,
    "scale": [x,y,z],
    "color": six-digit hex color,
    "roughness": 0..1,
    "metalness": 0..1
  }],
  "camera": { "position": [x,y,z], "target": [x,y,z], "fov": 20..70 },
  "lighting": { "ambientIntensity": 0..3, "keyIntensity": 0..8, "keyPosition": [x,y,z] },
  "assumptions": string[]
}

Reconstruct visible three-dimensional structure conservatively. Decompose simple subjects into 6-20 meaningful parts and complex subjects into 20-48 parts when the evidence supports it. Match silhouette, proportions, pose, negative spaces, visible material zones, and ground contact. Use ellipsoids/capsules for organic masses, tube for curved rods or cables, lathe for rotational forms, extrude for authored silhouettes, and boxes/cylinders/cones/torus for manufactured forms. Root component positions use world coordinates. A child component's position, rotation, and scale are local to its parent. Keep the complete object near the origin and normally within a 6-unit cube. Never represent the source as a single box, a textured cube, or a flat card unless the actual subject is a simple box or panel. Do not include code, URLs, image data, hidden reasoning, markdown, or unsupported primitives. Carry the supplied quality contract into the output and list uncertain occluded structure in assumptions.`

function createEndpoint(baseUrl: string) {
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    throw new Error("文字模型 Base URL 无效")
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("文字模型 Base URL 无效")
  }
  if (!url.pathname.endsWith("/chat/completions")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`
  }
  url.search = ""
  url.hash = ""
  return url.toString()
}

function responseText(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("")
  }
  return payload.output_text ?? ""
}

function parseJsonObject(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]
  const candidate = fenced ?? trimmed
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start < 0 || end <= start) {
      throw new Error("3D 模型没有返回可用的结构规格")
    }
    return JSON.parse(candidate.slice(start, end + 1)) as unknown
  }
}

async function inlineLocalImage(
  src: string,
  apiOrigin: string,
  fetchImpl: typeof fetch
) {
  if (src.startsWith("data:image/")) return src
  const resolved = new URL(src, apiOrigin)
  const origin = new URL(apiOrigin)
  if (resolved.origin !== origin.origin) return resolved.toString()

  const response = await fetchImpl(resolved, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error("无法读取选中的图片画布")
  const contentType = response.headers.get("content-type")?.split(";")[0]
  if (!contentType?.startsWith("image/")) {
    throw new Error("选中的画布不是可用图片")
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new Error("选中的图片超过 16 MB，无法进行 3D 结构分析")
  }
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
}

function assertHierarchyIsAcyclic(spec: Procedural3dModelSpec) {
  const parents = new Map(
    spec.components.map((component) => [component.id, component.parentId])
  )
  for (const component of spec.components) {
    const visited = new Set<string>()
    let current: string | undefined = component.id
    while (current) {
      if (visited.has(current)) {
        throw new Error("3D 模型部件层级存在循环")
      }
      visited.add(current)
      current = parents.get(current)
    }
  }
}

async function requestVisionJson({
  endpoint,
  apiKey,
  model,
  systemPrompt,
  userText,
  imageUrl,
  fetchImpl,
  signal,
}: {
  endpoint: string
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  imageUrl: string
  fetchImpl: typeof fetch
  signal: AbortSignal
}) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
    }),
    signal,
  })
  if (!response.ok) {
    throw new Error(`3D 结构分析失败（HTTP ${response.status}）`)
  }
  const payload = (await response.json()) as ChatCompletionPayload
  return parseJsonObject(responseText(payload))
}

export function createModel3dGenerationAdapter({
  apiOrigin,
  fetchImpl = fetch,
  timeoutMs = 90_000,
}: Model3dGenerationAdapterOptions) {
  return {
    async generate(
      input: Model3dGenerationInput,
      credentials: TextModelCredentials
    ): Promise<Procedural3dModelSpec> {
      const apiKey = credentials.apiKey?.trim()
      const model = credentials.model?.trim()
      const baseUrl = credentials.baseUrl?.trim()
      if (!apiKey || !model || !baseUrl) {
        throw new Error("图片转 3D 需要先配置支持图片理解的文字模型")
      }

      const imageUrl = await inlineLocalImage(
        input.sourceImageSrc,
        apiOrigin,
        fetchImpl
      )
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const endpoint = createEndpoint(baseUrl)
        const assessment = reconstructionAssessmentSchema.parse(
          await requestVisionJson({
            endpoint,
            apiKey,
            model,
            systemPrompt: ASSESSMENT_SYSTEM_PROMPT,
            userText: input.prompt,
            imageUrl,
            fetchImpl,
            signal: controller.signal,
          })
        )
        const spec = procedural3dModelSpecSchema.parse(
          await requestVisionJson({
            endpoint,
            apiKey,
            model,
            systemPrompt: MODEL_SYSTEM_PROMPT,
            userText: buildGeometryRequest(input.prompt, assessment),
            imageUrl,
            fetchImpl,
            signal: controller.signal,
          })
        )
        assertHierarchyIsAcyclic(spec)
        return spec
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("3D 结构分析超时")
        }
        if (error instanceof z.ZodError) {
          throw new Error("文字模型返回的 3D 结构规格不完整")
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

function buildGeometryRequest(
  userPrompt: string,
  assessment: ReconstructionAssessment
) {
  return [
    `User request: ${userPrompt}`,
    "Validated pre-spec assessment:",
    JSON.stringify(assessment),
    "Author the procedural model from this assessment and the attached reference image.",
  ].join("\n")
}
