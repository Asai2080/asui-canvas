import { describe, expect, it } from "vitest"

import {
  isCoverSkillName,
  isImageTo3dSkillName,
  isStoryboardSkillName,
  isWorldSkillName,
  skillDisplayName,
} from "./identifiers"

describe("Canvas Agent Skill identifiers", () => {
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
  })

  it("recognizes the built-in and upstream world Skill names", () => {
    expect(isWorldSkillName("世界 Skill")).toBe(true)
    expect(isWorldSkillName("scroll-world")).toBe(true)
    expect(skillDisplayName("scroll-world")).toBe("世界 Skill")
  })
})
