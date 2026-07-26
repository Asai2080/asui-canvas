import { describe, expect, it, vi } from "vitest"

import { createVideoGenerationAdapter } from "./video-generation"

describe("createVideoGenerationAdapter", () => {
  it("creates a provider job through the existing video API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        task: { taskId: "provider-job-1", status: "queued" },
        provider: { id: "volcengine" },
      })
    )
    const adapter = createVideoGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
    })

    const task = await adapter.create(
      {
        prompt: "让画面中的人物自然行走",
        negativePrompt: "不要改变镜头",
        sourceImageSrc: "data:image/png;base64,source",
        durationSeconds: 8,
        resolution: "1080p",
      },
      {
        videoBaseUrl: "https://video.example/v1",
        videoApiKey: "video-secret",
        videoModel: "video-model",
      }
    )

    expect(task).toEqual({
      taskId: "provider-job-1",
      status: "queued",
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3030/api/videos/generate",
      expect.objectContaining({ method: "POST" })
    )
    const body = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(body).toMatchObject({
      action: "create",
      prompt: expect.stringContaining("让画面中的人物自然行走"),
      sourceImageSrc: "data:image/png;base64,source",
      durationSeconds: 8,
      resolution: "1080p",
      videoApiKey: "video-secret",
    })
    expect(String(body.prompt)).toContain("不要改变镜头")
    expect(JSON.stringify(task)).not.toContain("video-secret")
  })

  it("polls an existing provider job without creating a new one", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        video: {
          src: "https://cdn.example/result.mp4",
          taskId: "provider-job-1",
          status: "succeeded",
          durationSeconds: 8,
          resolution: "1080p",
        },
      })
    )
    const adapter = createVideoGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
    })

    const result = await adapter.poll(
      "provider-job-1",
      {
        prompt: "让画面中的人物自然行走",
        durationSeconds: 8,
        resolution: "1080p",
      },
      { videoApiKey: "video-secret" }
    )

    expect(result).toEqual({
      state: "completed",
      artifact: expect.objectContaining({
        kind: "video",
        src: "https://cdn.example/result.mp4",
        taskId: "provider-job-1",
      }),
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(body).toMatchObject({
      action: "poll",
      taskId: "provider-job-1",
    })
  })

  it("returns a pending state while the provider job is still running", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        task: { taskId: "provider-job-1", status: "running" },
      })
    )
    const adapter = createVideoGenerationAdapter({
      apiOrigin: "http://localhost:3030",
      fetchImpl,
    })

    await expect(
      adapter.poll(
        "provider-job-1",
        {
          prompt: "生成视频",
          durationSeconds: 4,
          resolution: "720p",
        },
        {}
      )
    ).resolves.toEqual({
      state: "pending",
      task: { taskId: "provider-job-1", status: "running" },
    })
  })
})
