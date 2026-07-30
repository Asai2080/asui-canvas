import type { CanvasContextSnapshot } from "../context/schema"
import type { SkillSnapshot } from "../skills/schema"
import {
  compiledPromptSchema,
  type CompiledPrompt,
} from "../task-schema"

const DEFAULT_IMAGE_EDGE = 1024
const VARIANT_DIFFERENCES = [
  "主体明确、信息层级清晰的主视觉构图",
  "更具空间纵深和环境叙事的构图",
  "强调材质、光影和主体细节的近景构图",
  "留白更充分、适合排版延展的构图",
  "更具动势和视觉冲击力的构图",
  "更克制、适合品牌传播的构图",
  "强化色彩对比与氛围表达的构图",
  "实验性更强但仍保持核心要求的构图",
] as const
const IMAGE_CAMERA_DIRECTIONS = [
  "35mm 标准广角，中景平视，主体占据画面视觉中心，保留足够环境信息。",
  "24mm 广角，轻微低机位，利用前景引导线和透视纵深增强空间叙事。",
  "50mm 标准镜头，中近景构图，收紧视野并突出主体表情、轮廓和关键细节。",
  "65mm 中长焦，轻度压缩空间，在主体一侧保留可用于文案排版的干净留白。",
  "28mm 广角，斜向构图与明确运动趋势，形成更强的速度感和视觉冲击。",
  "50mm 标准镜头，稳定正面构图，控制透视变形，呈现克制可信的品牌气质。",
  "40mm 镜头，前中后景层次清楚，通过冷暖与明暗对比集中视觉焦点。",
  "35mm 镜头，非对称构图与克制的实验性视角，保持主体识别度和画面完整性。",
] as const

type ImageCreativeDirection = {
  subject: string
  style: string
  composition: string
  lighting: string
  color: string
  material: string
  quality: string
  negative: string
}

const STYLE_PRESERVATION_RULE =
  "严格保留用户目标中出现的全部风格、媒介、年代、流派、地域文化、艺术家式审美和渲染方式；任何未被预设识别的风格词都视为最高优先级视觉约束，不得替换、弱化或混成通用风格。"

function imageCreativeDirection(instruction: string): ImageCreativeDirection {
  if (/皮克斯|3D\s*动画|三维动画|动画电影|卡通渲染/i.test(instruction)) {
    return {
      subject:
        "以一位原创动画角色作为清晰主体，设计具有鲜明轮廓、可信结构和富有感染力的表情姿态；环境中加入少量能说明时间、地点与角色关系的叙事道具，形成一个一眼可读的故事瞬间。",
      style:
        "高品质电影级 3D 动画长片美术，圆润而精炼的造型语言，风格化比例与可信解剖并存，亲和但不幼稚；避免直接复刻任何现有影视角色、服装或标志性场景。",
      composition:
        "建立前景、主体、背景三层空间，角色视线和动作形成明确视觉动线，轮廓与背景保持可读分离。",
      lighting:
        "使用柔和电影主光塑造面部和体积，辅以暖色轮廓光分离主体，环境反射光自然回填暗部；保留高光层次，避免平光和过曝。",
      color:
        "采用明快但受控的电影色彩脚本，以一个主色、一个辅助色和少量互补强调色建立情绪，肤色与环境色保持协调。",
      material:
        "皮肤呈现细腻次表面散射，眼睛具有真实湿润高光，布料、毛发、木材与金属拥有可区分的粗糙度和微表面细节。",
      quality:
        "电影级全局光照、柔和接触阴影、自然景深、干净抗锯齿和高质量渲染；主体完整，手部、五官和边缘结构准确。",
      negative:
        "不要照搬现有动画角色或影视 IP，不要塑料玩具质感、僵硬表情、空洞眼神、过度磨皮、肢体畸形、多余手指、文字、水印、边框或拼图。",
    }
  }

  if (
    !/国风|东方|水墨|宋韵|新中式|敦煌|工笔/i.test(instruction) &&
    /产品|商品|广告|电商|包装|运动鞋|茶饮|饮料|香水|珠宝/i.test(instruction)
  ) {
    return {
      subject:
        "将产品作为唯一视觉主角，完整呈现品牌识别面、关键结构和卖点细节；道具和环境只用于解释使用场景、尺度与气质，不遮挡产品。",
      style:
        "高端商业广告主视觉，兼具真实产品摄影的可信度和精修广告的控制力，画面简洁、有记忆点并可直接用于品牌传播。",
      composition:
        "产品轮廓清晰，视觉重心稳定，利用台面、投影、结构线或道具建立空间层次，并预留可控的品牌文案安全区。",
      lighting:
        "采用大面积柔光塑造主体体积，以窄条轮廓光勾勒边缘和材质转折，控制反射高光形状，暗部保留可辨识细节。",
      color:
        "围绕产品主色建立克制的品牌色系统，背景与主体形成明确明度或冷暖分离，避免杂色抢夺注意力。",
      material:
        "准确呈现金属、玻璃、皮革、织物、液体和包装表面的粗糙度、透光、折射与微小纹理，边缘精修干净。",
      quality:
        "广告级精修、真实阴影与接触关系、准确透视、高清锐利卖点细节；产品文字与标志保持可读且不变形。",
      negative:
        "不要改变产品结构和品牌识别，不要错误文字、畸变包装、廉价塑料质感、脏污高光、悬浮接触、杂乱道具、水印、边框或拼图。",
    }
  }

  if (/国风|东方|水墨|宋韵|新中式|敦煌|工笔/i.test(instruction)) {
    return {
      subject:
        "围绕用户主题建立明确的东方叙事主体，以服饰、器物、植物、建筑或山水元素交代文化语境；元素选择克制且有依据，避免无关符号堆砌。",
      style:
        "当代东方视觉语言，融合传统工笔、水墨留白和现代设计秩序；线条、墨色、纹样与空间节奏统一，既有文化质感又具当代传播性。",
      composition:
        "使用东方散点透视与现代视觉层级结合，讲究疏密、虚实、开合和留白，主体落点明确，画面气韵连贯。",
      lighting:
        "采用柔和天光与雾化环境光，重点区域以克制暖光提亮，明暗过渡含蓄，保留纸张、丝绢或自然材质的层次。",
      color:
        "以低饱和矿物色、墨色和自然材质色为基底，使用少量朱砂、石青、茶绿或金色作为视觉强调。",
      material:
        "呈现宣纸纤维、墨色晕染、丝绢纹理、陶瓷釉面、木质与金属细节，传统纹样结构准确且不过度装饰。",
      quality:
        "线条清晰、墨色层次丰富、留白干净、细节经得起放大；避免古装影楼感和泛化的东方符号拼贴。",
      negative:
        "不要廉价古风滤镜、无意义纹样堆叠、现代物件穿帮、错误汉字、过饱和金色、画面脏乱、水印、边框或拼图。",
    }
  }

  if (/海报|封面|KV|主视觉|宣传|版式/i.test(instruction)) {
    return {
      subject:
        "提炼一个最具识别度的核心视觉符号作为主角，所有辅助图形、环境和装饰都服务于主题表达，并建立清晰的主信息与次信息层级。",
      style:
        "成熟的品牌海报与主视觉设计，概念明确、图形语言统一，既能在大尺寸展示中形成冲击，也能在缩略图中保持识别度。",
      composition:
        "采用稳定的视觉网格和明确焦点，控制图像区、标题安全区与呼吸空间，元素之间保持对齐、节奏和比例关系。",
      lighting:
        "根据主题选择具有方向性的主光和受控环境光，以光影强化核心符号而不是制造无意义效果。",
      color:
        "建立主色、辅助色和强调色三级系统，保证主体与背景的明度对比，并为文字叠加保留足够可读性。",
      material:
        "图像、字体承载区域、图形纹理和特效拥有统一的颗粒度与边缘品质，避免素材拼贴感和廉价滤镜。",
      quality:
        "商业交付级主视觉，焦点明确、边缘干净、细节完整、缩放后仍可读；画面四周保留安全边距。",
      negative:
        "不要信息层级混乱、元素拥挤、随机装饰、伪文字、错误标志、低清素材、廉价发光、水印、边框或拼图。",
    }
  }

  if (/摄影|照片|写实|真实|人像|风光|纪实/i.test(instruction)) {
    return {
      subject:
        "围绕用户指定对象捕捉一个自然、可信且具有叙事价值的瞬间；主体姿态、环境关系和物理尺度符合现实，背景提供必要语境但不喧宾夺主。",
      style:
        "高端商业摄影与电影静帧质感，真实光学成像、自然动态范围和克制后期，避免明显的合成感与过度 HDR。",
      composition:
        "主体轮廓完整，前中后景关系清楚，使用引导线、景深和明暗对比组织视线，地平线与透视保持准确。",
      lighting:
        "遵循真实光源逻辑，主光方向明确，环境反射和阴影强度一致，高光不过曝、暗部不死黑。",
      color:
        "使用统一白平衡和电影级色彩分离，肤色、植被、天空与材质颜色自然，局部强调色不过饱和。",
      material:
        "保留皮肤、毛发、织物、植物、石材和金属的真实纹理与微小瑕疵，边缘不过度锐化。",
      quality:
        "自然景深、准确焦点、合理快门与运动表现、真实颗粒和高动态范围；五官、手部与空间结构准确。",
      negative:
        "不要蜡像皮肤、过度 HDR、假景深、重复纹理、结构畸形、多余肢体、脏污噪点、文字、水印、边框或拼图。",
    }
  }

  return {
    subject:
      "把用户目标转化为一个单一、明确且可被立即识别的核心主体，并通过姿态、环境、道具与空间关系呈现清楚的叙事瞬间。",
    style:
      "高完成度商业视觉，风格语言统一，兼顾可信结构、审美表达和实际交付价值，避免无目的的效果堆叠。",
    composition:
      "建立清晰的视觉焦点和前中后景层次，控制主体比例、负空间与边缘安全距离，使画面在缩略图和大图下都保持可读。",
    lighting:
      "使用方向明确的主光、自然环境补光和克制轮廓光塑造体积，保留高光、半影和暗部细节。",
    color:
      "采用一个主色、一个辅助色和少量强调色，控制饱和度与明度层级，让主体从背景中清晰分离。",
    material:
      "根据对象准确呈现表面粗糙度、反射、透光和微纹理，边缘干净，空间接触关系真实。",
    quality:
      "商业交付级细节、准确结构与透视、自然景深和完整边缘；主体、文字承载区域与关键元素不得被裁切。",
    negative:
      "不要主题偏离、主体不清、结构畸形、重复元素、廉价滤镜、过度锐化、伪文字、水印、边框或拼图。",
  }
}

function videoCameraMovement(instruction: string) {
  if (/固定机位|固定镜头|静止镜头|锁定镜头|不运镜/i.test(instruction)) {
    return "固定机位锁定构图，只允许主体和环境内部发生运动；摄影机无平移、旋转或变焦，依靠表演和景深变化组织注意力。"
  }
  if (/环绕|绕拍|轨道/i.test(instruction)) {
    return "摄影机沿稳定圆弧轨道环绕主体 20–45 度，始终保持主体为视觉中心；运动半径、速度与视线方向连续，禁止突然反向或跳轴。"
  }
  if (/拉远|后退|拉镜/i.test(instruction)) {
    return "使用真实摄影机后移完成缓慢 dolly-out，从主体细节逐步揭示完整环境；焦距保持稳定，视差和空间尺度自然展开。"
  }
  if (/推进|推近|推镜|靠近/i.test(instruction)) {
    return "使用轨道或稳定器进行缓慢 dolly-in，摄影机真实向主体靠近而不是数字变焦；前景产生自然视差，焦点持续落在叙事核心。"
  }
  if (/跟随|跟拍|追踪|追拍/i.test(instruction)) {
    return "使用稳定器进行同速跟拍，摄影机与主体保持可控距离和屏幕运动方向；转弯时沿自然弧线调整机位，保持动作连续和背景视差。"
  }
  if (/横移|侧移|平移/i.test(instruction)) {
    return "摄影机沿水平轨道匀速横移，以前景遮挡和背景视差建立空间层次；主体位置在三分线附近稳定移动，不发生构图漂移。"
  }
  if (/升起|下降|升降|摇臂|航拍|俯冲/i.test(instruction)) {
    return "使用摇臂或航拍式垂直运动平滑改变机位高度，同时轻微调整俯仰角保持主体构图；加速和减速具有真实惯性。"
  }
  if (/手持|纪实|纪录片/i.test(instruction)) {
    return "采用克制的肩扛手持感，仅保留低幅度呼吸和步伐反馈；画面可感知摄影师存在，但主体始终可读，禁止高频随机抖动。"
  }
  if (/产品|商品|广告|运动鞋|茶饮|饮料|香水|珠宝/i.test(instruction)) {
    return "使用微距滑轨进行缓慢推进，并叠加不超过 25 度的克制弧形环绕；先揭示轮廓，再让高光沿材质表面移动，最终停在品牌识别面和核心卖点。"
  }
  if (/风景|城市|建筑|自然|山水|旅行/i.test(instruction)) {
    return "使用缓慢摇臂上升结合轻微前推，从前景逐步揭示环境全貌；速度稳定、地平线不漂移，利用前中后景视差体现空间尺度。"
  }
  if (/人物|角色|人像|表情|皮克斯|动画/i.test(instruction)) {
    return "以稳定中景开场，沿角色视线方向缓慢推近至中近景；摄影机移动服务于表情和动作节拍，在情绪落点前自然减速并稳定停住。"
  }
  return "使用稳定器完成一次有明确动机的缓慢推进，并辅以极轻微横移制造自然视差；运镜从静止开始、平滑加速、在叙事落点前减速停稳，全程不跳轴。"
}

function videoTimeline(
  durationSeconds: number,
  animate: boolean
): string[] {
  const openingEnd = Math.max(0.2, durationSeconds * 0.2)
  const closingStart = Math.max(
    openingEnd + 0.1,
    durationSeconds * 0.78
  )
  const time = (value: number) =>
    Math.min(durationSeconds, value).toFixed(1)

  return [
    `0.0–${time(openingEnd)} 秒：${
      animate
        ? "首帧与参考图严格对齐，先保持短暂稳定，让主体身份、构图和光向清楚可读；随后由呼吸、视线、布料或环境微动自然启动。"
        : "用稳定建立帧交代主体、环境和空间关系，动作从静止或准备姿态自然启动，第一秒内明确观看重点。"
    }`,
    `${time(openingEnd)}–${time(closingStart)} 秒：完成主要动作与摄影机运动，动作只有一个清晰意图；主体运动、镜头速度、景深变化和环境反馈按照同一节奏推进。`,
    `${time(closingStart)}–${time(durationSeconds)} 秒：动作进入结果状态，摄影机平滑减速并稳定停住；保留一个清晰、可继续剪辑或衔接下一镜的结尾画面。`,
  ]
}
const STORYBOARD_DIRECTIONS = [
  {
    shot: "ELS / 环境建立镜头",
    beat: "建立完整环境、主体位置和空间关系，使用较深景深。",
    camera: "广角镜头，稳定缓慢推进，明确后续镜头的运动轴线。",
  },
  {
    shot: "LS / 起始动作",
    beat: "主体开始执行一个清晰、可连续衔接的简单动作。",
    camera: "中广角侧向跟随，保持主体的屏幕运动方向。",
  },
  {
    shot: "MLS / 关系建立",
    beat: "强化主体与关键环境元素之间的关系，推动情绪建立。",
    camera: "轻微横移或弧形运动，保持空间方位连续。",
  },
  {
    shot: "MS / 情节推进",
    beat: "动作进入关键阶段，画面信息比前一镜更集中。",
    camera: "标准镜头缓慢推近，动作在画面中完整可读。",
  },
  {
    shot: "MCU / 情绪靠近",
    beat: "突出主体的表情、姿态或材质变化，延续上一镜动作。",
    camera: "50mm 左右轻微推进，中浅景深聚焦主体。",
  },
  {
    shot: "CU / 亲密特写",
    beat: "呈现最重要的情绪反馈或动作细节。",
    camera: "稳定近景，自然浅景深，焦点准确落在叙事核心。",
  },
  {
    shot: "ECU / 极端细节",
    beat: "用一个真实可见的局部细节制造转折或强调。",
    camera: "微距式极近特写，只展示参考内容中真实存在的细节。",
  },
  {
    shot: "Low Angle / 力量镜头",
    beat: "用低机位强化关键动作的力量感，但不改变主体身份。",
    camera: "低机位轻微仰拍，保持光向、背景标志和运动轴线一致。",
  },
  {
    shot: "MS / 转折反应",
    beat: "主体对上一镜的变化作出明确、克制的可见反应。",
    camera: "回到中景，使用视线匹配或动作匹配完成衔接。",
  },
  {
    shot: "Tracking / 动作延续",
    beat: "延续动作并提高节奏，所有新增变化都来自现有场景。",
    camera: "平滑跟拍或横移，不跨越既定轴线。",
  },
  {
    shot: "CU / 情绪落点",
    beat: "让情绪达到高潮或得到释放，保持人物与材质连续。",
    camera: "近景轻微推近，统一色调下强调高光与暗部层次。",
  },
  {
    shot: "LS / 收束镜头",
    beat: "回到更完整的环境中收束故事，留下清楚的最终画面。",
    camera: "缓慢拉远或静止结束，与开场镜头形成视觉呼应。",
  },
] as const

export type CompileGenerationPromptInput = {
  taskId: string
  userInstruction: string
  sourceInstruction?: string
  context?: CanvasContextSnapshot
  skill?: SkillSnapshot
  target?: {
    mediaType?: "image" | "video"
    count?: number
    width?: number
    height?: number
    durationSeconds?: number
    resolution?: string
  }
}

function extractCount(instruction: string): number {
  const arabic = instruction.match(
    /(?:生成|制作|做|输出)?\s*(\d{1,2})\s*(?:张|个版本|版|个)/
  )
  if (arabic) return Number(arabic[1])

  const chinese: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  const match = instruction.match(
    /(?:生成|制作|做|输出)?\s*([一二两三四五六七八九])\s*(?:张|个版本|版|个)/
  )
  return match ? chinese[match[1]] : 1
}

function extractAspectRatio(instruction: string): [number, number] | undefined {
  const match = instruction.match(/(\d{1,3})\s*[:：]\s*(\d{1,3})/)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  if (width <= 0 || height <= 0) return undefined
  return [width, height]
}

function dimensionsForRatio(
  ratio: [number, number] | undefined
): { width: number; height: number } {
  if (!ratio) {
    return { width: DEFAULT_IMAGE_EDGE, height: DEFAULT_IMAGE_EDGE }
  }
  const [ratioWidth, ratioHeight] = ratio
  if (ratioWidth <= ratioHeight) {
    return {
      width: Math.max(1, Math.round((DEFAULT_IMAGE_EDGE * ratioWidth) / ratioHeight)),
      height: DEFAULT_IMAGE_EDGE,
    }
  }
  return {
    width: DEFAULT_IMAGE_EDGE,
    height: Math.max(1, Math.round((DEFAULT_IMAGE_EDGE * ratioHeight) / ratioWidth)),
  }
}

function sourceDimensions(context?: CanvasContextSnapshot) {
  const media = context?.sourceNode?.media
  const bounds = context?.sourceNode?.bounds
  const width = media?.width ?? (bounds ? Math.round(bounds.w) : undefined)
  const height = media?.height ?? (bounds ? Math.round(bounds.h) : undefined)
  return width && height ? { width, height } : undefined
}

function hasEditableImage(context?: CanvasContextSnapshot): boolean {
  return (
    context?.sourceNode?.media?.mediaType === "image" &&
    context.annotations.length > 0
  )
}

function annotationLines(context?: CanvasContextSnapshot): string[] {
  return (
    context?.annotations.map((annotation, index) => {
      const region = annotation.normalizedBounds ?? annotation.bounds
      return `${index + 1}. 区域 ${JSON.stringify(region)}：${annotation.text}`
    }) ?? []
  )
}

function isStoryboardSkill(skill?: SkillSnapshot) {
  return skill?.name.trim().toLocaleLowerCase() === "nb-fj"
}

function compileStoryboardPrompt({
  taskId,
  originalGoal,
  professionalBrief,
  context,
  skill,
  target,
}: {
  taskId: string
  originalGoal: string
  professionalBrief?: string
  context?: CanvasContextSnapshot
  skill: SkillSnapshot
  target?: CompileGenerationPromptInput["target"]
}): CompiledPrompt {
  const requestedCount = target?.count ?? extractCount(originalGoal)
  if (requestedCount > STORYBOARD_DIRECTIONS.length) {
    throw new Error(`分镜数量最多为 ${STORYBOARD_DIRECTIONS.length} 张`)
  }
  const count = Math.max(1, requestedCount)
  const defaultSize = dimensionsForRatio([16, 9])
  const requestedWidth = target?.width
  const requestedHeight = target?.height
  const hasSixteenNineTarget =
    requestedWidth !== undefined &&
    requestedHeight !== undefined &&
    requestedWidth * 9 === requestedHeight * 16
  const width = hasSixteenNineTarget ? requestedWidth : defaultSize.width
  const height = hasSixteenNineTarget ? requestedHeight : defaultSize.height
  const referenceLabel = context?.sourceNode
    ? "以当前选中的图片画布为唯一视觉参考"
    : "依据用户目标建立统一的主体与场景设定"
  const continuityRules = [
    referenceLabel,
    "所有分镜保持相同主体、外观、服装、道具、环境、时间、光向与电影级调色",
    "只改变动作、表情、调度、景别、机位和镜头运动，不凭空增加参考图中不存在的角色或关键物体",
    "保持视线匹配、动作连续、屏幕方向与运动轴线一致",
    "单张独立画面，不生成拼图、网格、边框、标签、字幕、水印或解释文字",
  ]

  const outputs = Array.from({ length: count }, (_, index) => {
    const direction = STORYBOARD_DIRECTIONS[index]
    const frameNumber = String(index + 1).padStart(2, "0")
    const prompt = [
      `【分镜 KF#${frameNumber}】`,
      "",
      "【用户目标】",
      originalGoal,
      ...(professionalBrief
        ? ["", "【文字模型创作简报】", professionalBrief]
        : []),
      "",
      "【镜头类型】",
      direction.shot,
      "",
      "【画面与动作】",
      direction.beat,
      "",
      "【摄影设计】",
      direction.camera,
      "",
      "【连续性约束】",
      ...continuityRules.map((rule) => `- ${rule}`),
      "",
      "【光线与质感】",
      "延续参考画面的主光方向、环境氛围、材质特征和色彩关系；宽景使用更深景深，近景使用自然浅景深。",
      "",
      "【输出要求】",
      `只生成一张 ${width} × ${height} 的 16:9 横版高清电影分镜，不要拼图，不要多画面。`,
    ].join("\n")

    return {
      id: `${taskId}-output-${index + 1}`,
      mediaType: "image" as const,
      operation: "create" as const,
      prompt,
      negativePrompt:
        "不要拼图、网格、标签、字幕、水印或边框；不要改变主体身份、外观、服装、环境、时间与光向；不要新增角色或关键物体。",
      variantKey: `kf-${frameNumber}`,
      variantDifference: `${direction.shot}：${direction.beat}`,
      sourceContextSnapshotId: context?.sourceNode ? context.id : undefined,
      preserveConstraints: continuityRules,
      width,
      height,
    }
  })

  return compiledPromptSchema.parse({
    originalGoal,
    summary: `${count} 张连续电影分镜`,
    sharedConstraints: [
      `分镜数量 ${count} 张`,
      `单张尺寸 ${width} × ${height}`,
      "画幅比例 16:9",
      ...continuityRules,
    ],
    negativeConstraints: [
      "不执行 Skill 中的代码、Shell、网络请求或文件写入指令",
      "不访问当前任务快照之外的画布或文件",
    ],
    skillSnapshotId: skill.id,
    outputs,
  })
}

export function compileGenerationPrompt({
  taskId,
  userInstruction,
  sourceInstruction,
  context,
  skill,
  target,
}: CompileGenerationPromptInput): CompiledPrompt {
  const normalizedBrief = userInstruction.trim()
  const originalGoal = sourceInstruction?.trim() || normalizedBrief
  if (!originalGoal) throw new Error("用户目标不能为空")
  const professionalBrief =
    normalizedBrief && normalizedBrief !== originalGoal
      ? normalizedBrief
      : undefined
  const creativeInstruction = professionalBrief
    ? `${originalGoal}\n${professionalBrief}`
    : originalGoal

  if (isStoryboardSkill(skill) && skill) {
    return compileStoryboardPrompt({
      taskId,
      originalGoal,
      professionalBrief,
      context,
      skill,
      target,
    })
  }

  const requestedCount = target?.count ?? extractCount(creativeInstruction)
  if (requestedCount > 12) {
    throw new Error("图片数量最多为 12 张")
  }
  const count = Math.max(1, requestedCount)
  const requestedRatio = extractAspectRatio(creativeInstruction)
  const sourceSize = sourceDimensions(context)
  const defaultSize = dimensionsForRatio(requestedRatio)
  const width = target?.width ?? sourceSize?.width ?? defaultSize.width
  const height = target?.height ?? sourceSize?.height ?? defaultSize.height
  const mediaType =
    target?.mediaType ??
    (/视频|动画|动起来|镜头/.test(creativeInstruction) ? "video" : "image")
  const edit = mediaType === "image" && hasEditableImage(context)
  const animate =
    mediaType === "video" &&
    context?.sourceNode?.media?.mediaType === "image"
  const annotations = annotationLines(context)
  const skillRule = skill?.instructions.trim()
  const imageDirection = imageCreativeDirection(creativeInstruction)
  const durationSeconds =
    target?.durationSeconds ??
    Number(creativeInstruction.match(/(\d{1,2})\s*秒/)?.[1] ?? 4)
  const resolution =
    target?.resolution ??
    creativeInstruction.match(/(480p|720p|1080p|4k)/i)?.[1] ??
    "720p"
  const videoFrameRule = requestedRatio
    ? `画幅比例 ${requestedRatio[0]}:${requestedRatio[1]}`
    : animate
      ? "保持参考图原始画幅和构图边界"
      : "严格遵循用户或交付平台指定画幅；未指定时选择最适合主题的画幅"

  const preserveConstraints = edit
    ? [
        "以当前画布中的源图片为唯一编辑源",
        `保持源图片尺寸 ${width} × ${height} 和原宽高比`,
        "保持所有未标注区域不变",
        "禁止把局部修改理解为重新设计整张图片",
      ]
    : []

  const sharedConstraints = [
    `输出尺寸 ${width} × ${height}`,
    ...(requestedRatio
      ? [`宽高比 ${requestedRatio[0]}:${requestedRatio[1]}`]
      : []),
    ...preserveConstraints,
    ...(skillRule ? [`Skill 规则：${skillRule}`] : []),
  ]

  const operation = edit ? "edit" : animate ? "animate" : "create"
  const outputs = Array.from({ length: Math.max(1, count) }, (_, index) => {
    const difference = VARIANT_DIFFERENCES[index % VARIANT_DIFFERENCES.length]
    const creationAnnotations =
      !edit && annotations.length > 0
        ? `\n画布内创作要求：\n${annotations.join("\n")}`
        : ""
    const regionalInstructions =
      edit && annotations.length > 0
        ? `\n逐条区域修改：\n${annotations.join("\n")}`
        : ""
    const visualDirection =
      mediaType === "video"
        ? "镜头运动自然连贯，主体动作与环境反馈符合真实物理逻辑，起承转合清楚。"
        : "主体明确，视觉层级清楚，画面焦点集中，构图完整且具备可直接交付的成片质量。"
    const lightingDirection =
      "使用与主题匹配的自然光影、协调而有层次的色彩关系，保留高光与暗部细节。"
    const detailDirection =
      "材质真实，边缘干净，空间关系准确，细节丰富但不过度堆叠，避免廉价滤镜感。"
    const imageCreationPrompt = [
      "【创作简报】",
      `用户目标：${originalGoal}`,
      ...(professionalBrief
        ? [`文字模型创作简报：${professionalBrief}`]
        : []),
      `成片定位：${imageDirection.style}`,
      "",
      "【主体与场景】",
      imageDirection.subject,
      "",
      "【风格与媒介】",
      imageDirection.style,
      STYLE_PRESERVATION_RULE,
      "",
      "【构图与镜头】",
      `${difference}。${imageDirection.composition}`,
      IMAGE_CAMERA_DIRECTIONS[index % IMAGE_CAMERA_DIRECTIONS.length],
      "",
      "【光线设计】",
      imageDirection.lighting,
      "",
      "【色彩脚本】",
      imageDirection.color,
      "",
      "【材质与细节】",
      imageDirection.material,
      "",
      "【质量控制】",
      imageDirection.quality,
      "",
      ...(creationAnnotations
        ? ["【画布补充要求】", ...annotations, ""]
        : []),
      ...(skillRule
        ? ["【Skill 约束】", skillRule, ""]
        : []),
      "【输出规范】",
      `生成一张 ${width} × ${height} 的完整成片，保持主体、环境和边缘元素完整；画面内不主动生成解释文字、标注线、水印、边框或拼图。`,
    ].join("\n")
    const videoDirectorPrompt = [
      "【导演创作简报】",
      `用户目标：${originalGoal}`,
      ...(professionalBrief
        ? [`文字模型创作简报：${professionalBrief}`]
        : []),
      `成片类型：${animate ? "基于当前参考图的单镜头图生视频" : "原创单镜头视频"}`,
      `版本方向：${difference}`,
      "",
      "【风格与美术指导】",
      imageDirection.style,
      STYLE_PRESERVATION_RULE,
      "",
      "【主体、场景与表演】",
      animate
        ? "以参考图为唯一首帧和视觉身份依据，锁定主体外观、服装、材质、道具、环境布局、时间、天气、光向和色彩关系；只让用户要求的动作与合理的次级运动发生。"
        : imageDirection.subject,
      "表演和动作必须有明确起点、发展与落点，重心转移、视线、步伐、手势和环境反馈符合真实动力学，不做无意义循环动作。",
      "",
      "【时间轴与动作调度】",
      ...videoTimeline(durationSeconds, animate).map((line) => `- ${line}`),
      "",
      "【摄影机、焦段与运镜】",
      `机位与焦段：${IMAGE_CAMERA_DIRECTIONS[index % IMAGE_CAMERA_DIRECTIONS.length]}`,
      `运镜路径：${videoCameraMovement(creativeInstruction)}`,
      "摄影机运动必须由叙事动机驱动，保持 180 度轴线、屏幕方向、视线匹配和空间方位连续；使用真实位移产生视差，禁止用焦距突变伪装推进。",
      "",
      "【构图与空间连续性】",
      imageDirection.composition,
      "主体在运动中保持稳定比例和清晰轮廓，画面边缘不切断关键肢体或产品卖点；前景、主体和背景的遮挡关系随摄影机移动自然变化。",
      "",
      "【光线与色彩连续性】",
      imageDirection.lighting,
      imageDirection.color,
      "光源方向、阴影长度、曝光、白平衡和调色在整段视频中连续稳定，不随帧闪烁或漂移。",
      "",
      "【材质、动态与物理】",
      imageDirection.material,
      "头发、布料、植物、烟雾、液体和反射只产生与主体动作和环境力相匹配的次级运动；接触、惯性、重力和碰撞关系可信。",
      "",
      "【结尾帧】",
      "在动作完成和情绪落点后保留稳定结尾帧，主体身份、构图、光线和材质完整可读；结尾不能突然冻结、变形、黑场或与首帧无关。",
      "",
      ...(skillRule
        ? ["【Skill 约束】", skillRule, ""]
        : []),
      "【技术与交付规范】",
      `时长 ${durationSeconds} 秒，分辨率 ${resolution}，${videoFrameRule}，单镜头连续生成；除非用户明确要求剪辑，不主动切镜、转场或改变画幅。不要生成字幕、标注线、水印、边框或拼图。`,
    ].join("\n")
    const generalPrompt = [
      "【创作目标】",
      originalGoal,
      ...(professionalBrief
        ? ["", "【文字模型创作简报】", professionalBrief]
        : []),
      "",
      "【版本方向】",
      `版本 ${index + 1}：${difference}`,
      "",
      "【构图与叙事】",
      visualDirection,
      "",
      "【光线与色彩】",
      lightingDirection,
      "",
      "【材质与细节】",
      detailDirection,
      "",
      "【输出要求】",
      mediaType === "video"
        ? `生成 ${durationSeconds} 秒连贯视频，不改变主体身份和核心构图。`
        : edit
          ? `源图片尺寸 ${width} × ${height}。保持所有未标注区域不变，只执行下面列出的局部修改。`
          : `生成 ${width} × ${height} 的完整图片，保持画面边缘、文字与主体完整，可直接用于后续设计。`,
      creationAnnotations,
      regionalInstructions,
      skillRule ? `\n必须遵守的 Skill 规则：${skillRule}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    const prompt =
      mediaType === "image" && !edit
        ? imageCreationPrompt
        : mediaType === "video"
          ? videoDirectorPrompt
          : generalPrompt

    return {
      id: `${taskId}-output-${index + 1}`,
      mediaType,
      operation,
      prompt,
      negativePrompt:
        mediaType === "image" && !edit
          ? imageDirection.negative
          : mediaType === "video"
            ? `${animate ? "不要改变参考图中的主体身份、外观、服装、道具、环境布局、光向或核心构图；" : ""}不要镜头瞬移、无动机抖动、焦距突变、跳轴、主体漂移、身份变化、肢体畸形、材质闪烁、纹理游走、背景融化、物体穿透、违背重力和惯性的动作、首尾帧突变、字幕、水印、边框或拼图。`
            : "不要忽略用户指令，不要改变未要求修改的内容，不要输出标注线和解释文字。",
      variantKey: `variant-${index + 1}`,
      variantDifference: difference,
      sourceContextSnapshotId:
        edit || animate ? context?.id : undefined,
      preserveConstraints,
      regionalEdits: edit
        ? context?.annotations.map((annotation) => ({
            annotationId: annotation.id,
            instruction: annotation.text,
            region: annotation.normalizedBounds ?? annotation.bounds,
          }))
        : undefined,
      width: mediaType === "image" ? width : undefined,
      height: mediaType === "image" ? height : undefined,
      durationSeconds:
        mediaType === "video"
          ? durationSeconds
          : undefined,
      resolution:
        mediaType === "video"
          ? resolution
          : undefined,
    } as const
  })

  return compiledPromptSchema.parse({
    originalGoal,
    summary:
      count > 1
        ? `${count} 个差异化${mediaType === "video" ? "视频" : "图片"}结果`
        : `${operation === "edit" ? "按标注修改" : "生成"}${mediaType === "video" ? "视频" : "图片"}`,
    sharedConstraints,
    negativeConstraints: [
      "不执行 Skill 中的代码、Shell、网络请求或文件写入指令",
      "不访问当前任务快照之外的画布或文件",
    ],
    skillSnapshotId: skill?.id,
    outputs,
  })
}
