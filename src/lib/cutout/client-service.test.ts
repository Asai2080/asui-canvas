import { afterEach, describe, expect, it, vi } from "vitest"

import { runWithAutoManagedCutoutService } from "./client-service"

const jsonResponse = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("runWithAutoManagedCutoutService", () => {
  it("starts, waits for, and stops a service started by this operation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ running: false, managed: false }))
      .mockResolvedValueOnce(jsonResponse({ running: false, managed: true }))
      .mockResolvedValueOnce(jsonResponse({ running: true, managed: true }))
      .mockResolvedValueOnce(jsonResponse({ running: false, managed: false }))
    vi.stubGlobal("fetch", fetchMock)
    const phases: string[] = []

    const result = await runWithAutoManagedCutoutService({
      run: async () => "cutout-result",
      onPhase: (phase) => phases.push(phase),
      pollIntervalMs: 0,
      startupTimeoutMs: 100,
    })

    expect(result).toBe("cutout-result")
    expect(phases).toEqual(["starting", "processing", "stopping"])
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    })
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ action: "stop" }),
    })
  })

  it("does not stop a service that was already running", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ running: true, managed: true }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      runWithAutoManagedCutoutService({
        run: async () => "done",
      })
    ).resolves.toBe("done")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("stops an auto-started service when cutout processing fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ running: false, managed: false }))
      .mockResolvedValueOnce(jsonResponse({ running: true, managed: true }))
      .mockResolvedValueOnce(jsonResponse({ running: false, managed: false }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      runWithAutoManagedCutoutService({
        run: async () => {
          throw new Error("cutout failed")
        },
      })
    ).rejects.toThrow("cutout failed")
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ action: "stop" }),
    })
  })
})
