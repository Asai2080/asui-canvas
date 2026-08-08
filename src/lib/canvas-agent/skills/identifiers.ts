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

export function isImageTo3dVariantKey(variantKey?: string) {
  return (
    variantKey === "procedural-three-model" ||
    variantKey?.startsWith("three-") ||
    false
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

export function isSocialCardSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "guizang-social-card-skill" ||
    normalized === "social-card-skill"
  )
}

export function isPortraitSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "人物写真-skill" ||
    normalized === "female-portrait-director"
  )
}

export function isHanddrawnVideoSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "story-to-handdrawn-video" ||
    normalized === "手绘故事视频-skill"
  )
}

export function isCanvas3dStickerSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "canvas-3d-sticker-stylizer" ||
    normalized === "画布-3d-贴纸风格转换" ||
    normalized === "3d-贴纸-skill"
  )
}

export function isCanvas3dStickerVariantKey(variantKey?: string) {
  return variantKey === "canvas-3d-sticker-v1"
}

export function isIanXiaoheiSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "ian-xiaohei-illustrations" ||
    normalized === "ian-小蓝滴配图" ||
    normalized === "小蓝滴配图-skill"
  )
}

export function isClassicalPoemSilkVideoSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return normalized === "hbg-classical-poem-silk-video" || normalized === "古诗词丝绸视频-skill"
}

export function isAntibesHolidaySkillName(name?: string) {
  if (!name) return false
  return normalizedSkillName(name) === "antibes-holiday"
}

export function isStillImageMotionDirectorSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return normalized === "gc-still-image-motion-director" || normalized === "静态图运镜导演-skill"
}

export function isBrandStickerPhotoSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return normalized === "generate-brand-sticker-photo" || normalized === "品牌贴纸写真-skill"
}

export function isMetalLogoSculptureSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "generate-metal-logo-sculpture" ||
    normalized === "金属-logo-雕塑-skill"
  )
}

export function isPlayfulAppIconsSkillName(name?: string) {
  if (!name) return false
  const normalized = normalizedSkillName(name)
  return (
    normalized === "design-playful-app-icons" ||
    normalized === "playful-app-icons" ||
    normalized === "趣味-app-图标-skill"
  )
}

export function isIanXiaoheiVariantKey(variantKey?: string) {
  return variantKey?.startsWith("ian-xiaohei-") ?? false
}

export function skillMediaIntent(name?: string): "image" | "video" | undefined {
  if (
    isStoryboardSkillName(name) ||
    isCoverSkillName(name) ||
    isImageTo3dSkillName(name) ||
    isSocialCardSkillName(name) ||
    isPortraitSkillName(name) ||
    isCanvas3dStickerSkillName(name) ||
    isIanXiaoheiSkillName(name) ||
    isPlayfulAppIconsSkillName(name)
  ) {
    return "image"
  }
  if (
    isAntibesHolidaySkillName(name) ||
    isBrandStickerPhotoSkillName(name) ||
    isMetalLogoSculptureSkillName(name)
  ) return "image"
  if (isStillImageMotionDirectorSkillName(name)) return "video"
  if (isClassicalPoemSilkVideoSkillName(name)) return undefined
  if (isHanddrawnVideoSkillName(name)) return "video"
  return undefined
}

export function skillDisplayName(name: string) {
  if (isStoryboardSkillName(name)) return "分镜 Skill"
  if (isCoverSkillName(name)) return "封面 Skill"
  if (isImageTo3dSkillName(name)) return "图片转 3D Skill"
  if (isWorldSkillName(name)) return "世界 Skill"
  if (isSocialCardSkillName(name)) return "guizang-social-card-skill"
  if (isPortraitSkillName(name)) return "人物写真 Skill"
  if (isHanddrawnVideoSkillName(name)) return "story-to-handdrawn-video"
  if (isCanvas3dStickerSkillName(name)) return "画布 3D 贴纸风格转换"
  if (isIanXiaoheiSkillName(name)) return "Ian 小蓝滴配图"
  if (isClassicalPoemSilkVideoSkillName(name)) return "古诗词丝绸视频 Skill"
  if (isAntibesHolidaySkillName(name)) return "Antibes Holiday Skill"
  if (isStillImageMotionDirectorSkillName(name)) return "静态图运镜导演 Skill"
  if (isBrandStickerPhotoSkillName(name)) return "品牌贴纸写真 Skill"
  if (isMetalLogoSculptureSkillName(name)) return "generate-metal-logo-sculpture"
  if (isPlayfulAppIconsSkillName(name)) return "design-playful-app-icons"
  return name
}

export function excludeRegisteredSkillDuplicates<T extends { name: string }>(
  registered: Array<{ name: string }>,
  candidates: T[]
) {
  const registeredNames = new Set(
    registered.map((skill) =>
      skillDisplayName(skill.name).trim().toLocaleLowerCase()
    )
  )

  return candidates.filter(
    (skill) =>
      !registeredNames.has(
        skillDisplayName(skill.name).trim().toLocaleLowerCase()
      )
  )
}
