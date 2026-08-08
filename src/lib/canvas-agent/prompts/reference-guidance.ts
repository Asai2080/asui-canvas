import type { CanvasContextSnapshot } from "../context/schema"
import type { VisualPromptTemplateId } from "./template-router"

function imageReferenceCount(context?: CanvasContextSnapshot) {
  if (!context) return 0
  return [context.sourceNode, ...context.references].filter(
    (node) => node?.media?.mediaType === "image"
  ).length
}

export function hasGenerationImageReference(context?: CanvasContextSnapshot) {
  return imageReferenceCount(context) > 0
}

export function buildReferenceImageGuidance(
  templateId: VisualPromptTemplateId,
  context?: CanvasContextSnapshot,
  instruction = ""
) {
  const count = imageReferenceCount(context)
  if (count === 0) return []

  const primaryRule =
    "参考图 1 是当前画布中主动选中的主参考；其余参考图只补充风格、构图或细节。不得读取未选中的画布、旧任务提示词或其他 Skill 产物。"
  const sharedRules = [
    `本次共有 ${count} 张明确选中的参考图。`,
    primaryRule,
    "先识别每张参考图中可见的主体、结构、构图、色彩、材质、文字与设计语言，再按本类别分配用途；用户文字目标和明确约束高于参考图。",
    "只吸收与当前任务相关的视觉证据，不复制画布边框、选择框、控制点、批注、上传缩略图、设备外壳、浏览器外壳、水印或无关背景。",
  ]
  const strictUiStyleReference =
    templateId === "ui-interface" &&
    /(?:严格|高度|尽量)?参考(?:这|该|当前|选中|我给你的)?.{0,10}(?:图|图片|截图)|沿用参考图|参考图.{0,8}(?:风格|设计|排版|配色)/i.test(
      instruction
    )

  const categoryRules: Record<VisualPromptTemplateId, string[]> = {
    "ui-interface": [
      "把参考图作为 UI 设计依据：提取信息架构、模块顺序、栅格、间距节奏、信息密度、字体层级、组件几何、图标风格、颜色角色和交互状态。",
      "保留用户指定的产品、页面任务、平台、尺寸和准确文案；不要照抄参考图中的品牌名、业务数据、人物、原文案或无关模块。",
      "参考图只提供结构关系和空间层级，不继承它的绝对坐标、贴边位置、裁切或溢出，也不照搬固定间距；先提取外边距、区块间距、组件间距与内部留白的相对关系，再按当前空间 token 在目标画布中从零重建栅格，把标题、图标、卡片、列表和导航全部重新排入当前安全区。参考图中任何被边缘截断的元素都视为缺陷，不得复现；在比例适配或模型裁切风险存在时，左右额外保留约 12% 的纯背景安全带。",
      strictUiStyleReference
        ? "用户已明确要求参考设计风格：把参考图的颜色角色、明度关系、渐变方式和色彩比例作为强视觉约束，同时替换第三方品牌、原文案和业务数据；不得再用领域默认配色覆盖参考图。"
        : "除非用户明确说沿用参考图配色，否则参考图颜色只作为可识别性观察，不是生成约束；优先使用当前产品语义和当前提示词确定的调色板。",
      "若参考图是整机截图，只参考屏幕内部界面；不要生成手机外壳、系统状态栏、浏览器栏、作品集背景或透视样机。",
    ],
    infographic: [
      "参考其信息分组、阅读路径、图表编码和标注方式；事实、数字、标题与关系必须来自当前用户目标，不能沿用参考图数据。",
    ],
    poster: [
      "参考其主视觉比例、标题层级、网格、留白、色彩节奏和图文关系；替换为当前任务的准确标题与主体，不复制原海报文案、Logo 或活动信息。",
    ],
    product: [
      "主参考中的产品身份、外形结构、包装比例、品牌识别面和关键材质是强约束；只按用户要求改变场景、机位、光线、道具或广告表达。",
      "不要重设计产品、改写包装文字、增加不存在的接口或遮挡卖点。",
    ],
    brand: [
      "官方 Logo、字标、品牌色和识别资产必须保持比例、拼写和颜色一致；参考图只扩展到用户要求的触点，不自行发明替代标志。",
    ],
    architecture: [
      "参考空间结构、尺度、材质、开口、动线和光向；在用户未要求重建时，不改变承重逻辑、层高、家具尺度或主要空间关系。",
    ],
    photography: [
      "若主参考含人物或产品，锁定其可见身份特征、比例、服装或产品结构；参考摄影的机位、焦段感、光源和色调，但按用户目标创建新的可信瞬间。",
      "不照搬第三方照片的独特构图，不把参考图中的瑕疵、文字或水印带入结果。",
    ],
    illustration: [
      "分别判断参考图提供的是主体身份、媒介笔触、造型语言、色彩脚本还是构图；只保留用户要求的维度，不机械复制第三方作品。",
    ],
    character: [
      "锁定角色身份锚点：脸型、五官、发型、体型比例、服装分件、配色、道具和轮廓；变化只来自用户指定的角度、动作、表情或场景。",
    ],
    "story-scene": [
      "锁定需要延续的人物、场景方位、时间、天气、光向和关键道具，再按新事件调整动作、景别和叙事瞬间。",
    ],
    classical: [
      "参考可见的时代、地域、服饰、建筑、器物和媒介特征；不得混入其他朝代、现代物件或无依据符号。",
    ],
    document: [
      "参考分栏、标题层级、页边距、图表与页码系统；当前文案和数据必须重新排入，不复制参考文档内容。",
    ],
    general: [
      "把主参考中的核心主体与用户明确点名的视觉特征作为锚点，其余风格、构图和场景只在不改变任务目标时借鉴。",
    ],
  }

  return ["【参考图使用协议】", ...sharedRules, ...categoryRules[templateId]]
}
