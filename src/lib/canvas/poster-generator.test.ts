import { describe, expect, it } from "vitest"

import { generatePoster } from "./poster-generator"

describe("poster generator adapter", () => {
  it("creates an embeddable poster asset", async () => {
    const poster = await generatePoster({ prompt: "牛肉拉面品牌海报" })

    expect(poster.versionId).toMatch(/^version-/)
    expect(poster.parentVersionId).toBeUndefined()
    expect(poster.prompt).toBe("牛肉拉面品牌海报")
    expect(poster.src).toMatch(/^data:image\/svg\+xml/)
    expect(poster.width).toBe(768)
    expect(poster.height).toBe(1024)
  })

  it("creates a child version containing the edit feedback", async () => {
    const poster = await generatePoster({
      prompt: "牛肉拉面品牌海报",
      feedback: "标题下移，汤底改白",
      parentVersionId: "version-source",
    })

    expect(poster.parentVersionId).toBe("version-source")
    expect(poster.feedback).toBe("标题下移，汤底改白")
    expect(decodeURIComponent(poster.src)).toContain("已根据 2 条反馈优化")
  })

  it("escapes text before embedding it in SVG", async () => {
    const poster = await generatePoster({ prompt: "<script>alert('x')</script>" })
    const decoded = decodeURIComponent(poster.src)

    expect(decoded).not.toContain("<script>")
    expect(decoded).toContain("&lt;script&gt;")
  })
})
