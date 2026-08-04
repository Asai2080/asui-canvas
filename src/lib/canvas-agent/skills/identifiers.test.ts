import { describe, expect, it } from "vitest"

import {
  excludeRegisteredSkillDuplicates,
  isCanvas3dStickerSkillName,
  isCanvas3dStickerVariantKey,
  isCoverSkillName,
  isImageTo3dSkillName,
  isImageTo3dVariantKey,
  isIanXiaoheiSkillName,
  isIanXiaoheiVariantKey,
  isHanddrawnVideoSkillName,
  isPortraitSkillName,
  isSocialCardSkillName,
  isStoryboardSkillName,
  isWorldSkillName,
  skillMediaIntent,
  skillDisplayName,
} from "./identifiers"

describe("Canvas Agent Skill identifiers", () => {
  it("hides discovered aliases when their fully connected built-in Skill exists", () => {
    const discovered = [
      { name: "canvas-3d-sticker-stylizer", path: "/local/sticker" },
      { name: "animation-systems", path: "/local/animation" },
    ]

    expect(
      excludeRegisteredSkillDuplicates(
        [{ name: "画布 3D 贴纸风格转换" }],
        discovered
      )
    ).toEqual([{ name: "animation-systems", path: "/local/animation" }])
  })

  it("shows the legacy nb-fj Skill with a product-facing name", () => {
    expect(isStoryboardSkillName("nb-fj")).toBe(true)
    expect(skillDisplayName("nb-fj")).toBe("分镜 Skill")
    expect(skillDisplayName("分镜 Skill")).toBe("分镜 Skill")
  })

  it("recognizes the built-in and upstream cover Skill names", () => {
    expect(isCoverSkillName("封面 Skill")).toBe(true)
    expect(isCoverSkillName("gbro-cover-design")).toBe(true)
    expect(skillDisplayName("gbro-cover-design")).toBe("封面 Skill")
  })

  it("recognizes the built-in and upstream image-to-3D Skill names", () => {
    expect(isImageTo3dSkillName("图片转 3D Skill")).toBe(true)
    expect(isImageTo3dSkillName("img2threejs")).toBe(true)
    expect(skillDisplayName("img2threejs")).toBe("图片转 3D Skill")
    expect(isImageTo3dVariantKey("three-front-three-quarter")).toBe(true)
    expect(isImageTo3dVariantKey("three-turntable")).toBe(true)
    expect(isImageTo3dVariantKey("storyboard-frame-01")).toBe(false)
  })

  it("recognizes the built-in and upstream world Skill names", () => {
    expect(isWorldSkillName("世界 Skill")).toBe(true)
    expect(isWorldSkillName("scroll-world")).toBe(true)
    expect(skillDisplayName("scroll-world")).toBe("世界 Skill")
  })

  it("keeps the social-card Skill name and recognizes its workflow", () => {
    expect(isSocialCardSkillName("guizang-social-card-skill")).toBe(true)
    expect(skillDisplayName("guizang-social-card-skill")).toBe(
      "guizang-social-card-skill"
    )
  })

  it("uses the product name for the portrait director Skill", () => {
    expect(isPortraitSkillName("female-portrait-director")).toBe(true)
    expect(isPortraitSkillName("人物写真 Skill")).toBe(true)
    expect(skillDisplayName("female-portrait-director")).toBe("人物写真 Skill")
  })

  it("locks built-in Skills to their supported media type", () => {
    expect(skillMediaIntent("人物写真 Skill")).toBe("image")
    expect(skillMediaIntent("封面 Skill")).toBe("image")
    expect(skillMediaIntent("guizang-social-card-skill")).toBe("image")
    expect(skillMediaIntent("图片转 3D Skill")).toBe("image")
    expect(skillMediaIntent("分镜 Skill")).toBe("image")
    expect(skillMediaIntent("canvas-3d-sticker-stylizer")).toBe("image")
    expect(skillMediaIntent("story-to-handdrawn-video")).toBe("video")
    expect(skillMediaIntent("世界 Skill")).toBeUndefined()
  })

  it("recognizes the canvas 3D sticker workflow", () => {
    expect(isCanvas3dStickerSkillName("canvas-3d-sticker-stylizer")).toBe(true)
    expect(isCanvas3dStickerSkillName("画布 3D 贴纸风格转换")).toBe(true)
    expect(skillDisplayName("canvas-3d-sticker-stylizer")).toBe(
      "画布 3D 贴纸风格转换"
    )
    expect(isCanvas3dStickerVariantKey("canvas-3d-sticker-v1")).toBe(true)
    expect(isCanvas3dStickerVariantKey("three-front-three-quarter")).toBe(false)
  })

  it("recognizes the hand-drawn story video workflow", () => {
    expect(isHanddrawnVideoSkillName("story-to-handdrawn-video")).toBe(true)
    expect(skillDisplayName("story-to-handdrawn-video")).toBe(
      "story-to-handdrawn-video"
    )
  })

  it("recognizes and media-locks the Ian Xiaohei illustration workflow", () => {
    expect(isIanXiaoheiSkillName("ian-xiaohei-illustrations")).toBe(true)
    expect(isIanXiaoheiSkillName("Ian 小蓝滴配图")).toBe(true)
    expect(skillDisplayName("ian-xiaohei-illustrations")).toBe(
      "Ian 小蓝滴配图"
    )
    expect(skillMediaIntent("Ian 小蓝滴配图")).toBe("image")
    expect(isIanXiaoheiVariantKey("ian-xiaohei-article-01")).toBe(true)
    expect(isIanXiaoheiVariantKey("storyboard-frame-01")).toBe(false)
  })
})
