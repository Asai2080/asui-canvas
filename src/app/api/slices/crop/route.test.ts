import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { POST } from "./route"

describe("POST /api/slices/crop", () => {
  it("crops exact source pixel regions", async () => {
    const source = await sharp({
      create: { width: 100, height: 80, channels: 4, background: "#ff0000" },
    }).png().toBuffer()
    const response = await POST(new Request("http://localhost/api/slices/crop", {
      method: "POST",
      body: JSON.stringify({
        sourceImageSrc: `data:image/png;base64,${source.toString("base64")}`,
        candidates: [{
          id: "manual-1",
          name: "manual-1",
          assetType: "region",
          cropMode: "rectangle",
          x: 10,
          y: 20,
          width: 30,
          height: 25,
          confidence: 1,
          recommended: true,
        }],
      }),
    }))
    const payload = await response.json()
    const result = Buffer.from(payload.slices[0].src.split(",")[1], "base64")
    const metadata = await sharp(result).metadata()

    expect(response.status).toBe(200)
    expect(metadata).toMatchObject({ width: 30, height: 25 })
  })
})
