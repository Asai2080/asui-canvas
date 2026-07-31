function normalizedSkillName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, "-")
}

export function isStoryboardSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return normalized === "nb-fj" || normalized === "分镜-skill"
}

export function isCoverSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "封面-skill" ||
    normalized === "gbro-cover-design" ||
    normalized === "cover-design"
  )
}

export function isImageTo3dSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "图片转-3d-skill" ||
    normalized === "图片转3d-skill" ||
    normalized === "image-to-3d" ||
    normalized === "img2threejs"
  )
}

export function isWorldSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "世界-skill" ||
    normalized === "world-skill" ||
    normalized === "scroll-world"
  )
}

export function skillDisplayName(name: string) {
  if (isStoryboardSkillName(name)) return "分镜 Skill"
  if (isCoverSkillName(name)) return "封面 Skill"
  if (isImageTo3dSkillName(name)) return "图片转 3D Skill"
  if (isWorldSkillName(name)) return "世界 Skill"
  return name
}
