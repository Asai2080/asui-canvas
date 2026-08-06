import { unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { POST } from "./route"

describe("POST /api/slices/archive", () => {
  it("packages the original, slices and manifest", async () => {
    const pixel = "data:image/png;base64,iVBORw0KGgo="
    const response = await POST(new Request("http://localhost/api/slices/archive", {
      method: "POST",
      body: JSON.stringify({
        archiveName: "screen-assets",
        original: { name: "screen.png", src: pixel },
        slices: [{ name: "logo.png", src: pixel }],
        manifest: { version: "2.1.2" },
      }),
    }))
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()))

    expect(response.status).toBe(200)
    expect(Object.keys(files).sort()).toEqual([
      "manifest.json",
      "original/screen.png",
      "slices/logo.png",
    ])
  })
})
