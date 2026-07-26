import { describe, expect, it, vi } from "vitest"

import { createImageGenerationAdapter } from "./image-generation"

describe("createImageGenerationAdapter", () => {
  it("reuses the existing image API and returns one artifact per requested output", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          version: {
            versionId: "version-1",
            parentVersionId: "source-version",
            prompt: "first",
            src: "data:image/png;base64,first",
            width: 480,
            height: 270,
            createdAt: "2026-07-25T00:00:00.000Z",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          version: {
            versionId: "version-2",
            parentVersionId: "source-version",
            prompt: "second",
            src: "data:image/png;base64,second",
            width: 480,
            height: 270,
            createdAt: "2026-07-25T00:00:01.000Z",
          },
        })
      )

    const adapter = createImageGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
    })
    const artifacts = await adapter.generate(
      {
        prompt: "保留原图，只替换标题",
        negativePrompt: "不要改变构图",
        width: 480,
        height: 270,
        count: 2,
        sourceImageSrc: "data:image/png;base64,source",
        parentVersionId: "source-version",
        feedbackItems: [
          {
            label: "标题",
            text: "改为其他文案",
            taskType: "text replacement",
            bounds: { x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
          },
        ],
      },
      {
        baseUrl: "https://provider.example/v1",
        apiKey: "secret-key",
        model: "image-model",
      }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3030/api/images/generate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    )
    const firstBody = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(firstBody).toMatchObject({
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-key",
      model: "image-model",
      width: 480,
      height: 270,
      sourceImageSrc: "data:image/png;base64,source",
      parentVersionId: "source-version",
    })
    expect(firstBody.prompt).toContain("保留原图，只替换标题")
    expect(firstBody.prompt).toContain("不要改变构图")
    expect(artifacts).toEqual([
      expect.objectContaining({
        kind: "image",
        versionId: "version-1",
        src: "data:image/png;base64,first",
        width: 480,
        height: 270,
      }),
      expect.objectContaining({
        kind: "image",
        versionId: "version-2",
        src: "data:image/png;base64,second",
        width: 480,
        height: 270,
      }),
    ])
    expect(JSON.stringify(artifacts)).not.toContain("secret-key")
  })

  it("surfaces the existing image API error without leaking credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: "Insufficient credits", debug: { apiKey: "secret-key" } },
        { status: 402 }
      )
    )

    const adapter = createImageGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
    })

    await expect(
      adapter.generate(
        {
          prompt: "生成海报",
          width: 1024,
          height: 1024,
          count: 1,
        },
        { apiKey: "secret-key" }
      )
    ).rejects.toThrow("Insufficient credits")
  })
})
