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

export function skillDisplayName(name: string) {
  if (isStoryboardSkillName(name)) return "分镜 Skill"
  if (isCoverSkillName(name)) return "封面 Skill"
  return name
}
