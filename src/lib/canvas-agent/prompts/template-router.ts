export type VisualPromptTemplateId =
  | "ui-interface"
  | "infographic"
  | "poster"
  | "product"
  | "brand"
  | "architecture"
  | "photography"
  | "illustration"
  | "character"
  | "story-scene"
  | "classical"
  | "document"
  | "general"

export type VisualPromptTemplate = {
  id: VisualPromptTemplateId
  label: string
  category: string
  guidance: string[]
  negative: string[]
}

export type VisualPromptMethod = {
  id: string
  label: string
  templateId: VisualPromptTemplateId
  match?: RegExp
  guidance: string[]
  negative?: string[]
}

const TEMPLATES: readonly VisualPromptTemplate[] = [
  {
    id: "ui-interface",
    label: "UI 与产品界面",
    category: "UI & Interfaces",
    guidance: [
      "锁定产品、目标用户、平台、页面任务、信息层级和准确可见文案。",
      "补齐导航、主操作、关键内容模块和与当前场景相关的产品状态。",
    ],
    negative: ["设备样机", "多屏拼图", "伪文字", "空洞营销页", "无法落地的组件"],
  },
  {
    id: "infographic",
    label: "信息图与结构化图解",
    category: "Charts & Infographics",
    guidance: [
      "把内容压缩为 3 至 6 个短模块，明确阅读顺序、信息流和图表类型。",
      "使用颜色分组、连接线、箭头或编号表达真实关系，不用装饰替代逻辑。",
    ],
    negative: ["长段正文", "模块数量失控", "无意义图标", "关系线交叉混乱"],
  },
  {
    id: "product",
    label: "商品与商业视觉",
    category: "Products & E-commerce",
    guidance: [
      "锁定商品结构、品牌识别面、材质、核心卖点、使用场景和交付平台。",
      "主商品保持唯一视觉中心，道具只解释尺度、功能与品牌气质。",
    ],
    negative: ["产品变形", "错误包装文字", "无关道具", "廉价塑料质感", "卖点被遮挡"],
  },
  {
    id: "brand",
    label: "品牌与视觉识别",
    category: "Brand & Logos",
    guidance: [
      "明确品牌名、定位、受众、识别资产、配色、字体气质和触点用途。",
      "所有触点共享同一标志比例、留白、色彩与版式语言。",
    ],
    negative: ["伪造官方 Logo", "品牌名错拼", "无关标志变体", "触点风格割裂"],
  },
  {
    id: "poster",
    label: "海报与字体主视觉",
    category: "Posters & Typography",
    guidance: [
      "锁定唯一主视觉、准确标题、信息层级、版式网格、传播场景和画幅。",
      "标题和主体形成明确关系，辅助元素只服务主题，不平均分配注意力。",
    ],
    negative: ["标题错字", "无关小字", "素材拼贴感", "过程展示板", "多个主视觉争抢"],
  },
  {
    id: "architecture",
    label: "建筑与空间",
    category: "Architecture & Spaces",
    guidance: [
      "明确空间功能、尺度、动线、视角、结构材料、自然光和人工照明。",
      "透视、开口、层高、家具尺度与接触关系必须可建造且一致。",
    ],
    negative: ["不合理透视", "悬浮结构", "尺度混乱", "无法通行的动线"],
  },
  {
    id: "photography",
    label: "写实摄影",
    category: "Photography & Realism",
    guidance: [
      "明确主体、决定性瞬间、机位、焦段、景别、光源、环境和真实微瑕疵。",
      "姿态、重心、接触、反射、景深和运动表现遵循真实摄影与物理逻辑。",
    ],
    negative: ["蜡像皮肤", "过度磨皮", "假景深", "过度 HDR", "摆拍僵硬"],
  },
  {
    id: "illustration",
    label: "插画与艺术",
    category: "Illustration & Art",
    guidance: [
      "明确叙事主体、动作关系、构图、媒介笔触、色彩脚本、纸张或画布质感。",
      "参考图只锁定用户要求保留的身份或风格特征，不复制第三方构图。",
    ],
    negative: ["只写风格不写内容", "媒介混乱", "通用图库姿势", "复制第三方作品"],
  },
  {
    id: "character",
    label: "人物与角色设计",
    category: "Characters & People",
    guidance: [
      "建立身份锚点、比例、五官、发型、服装层级、道具、姿态和表情动机。",
      "多版本保持人物身份和关键结构一致，差异只来自镜头、动作或造型变量。",
    ],
    negative: ["身份漂移", "服装结构变化", "空洞表情", "肢体畸形", "无意义动作"],
  },
  {
    id: "classical",
    label: "历史与古典题材",
    category: "History & Classical Themes",
    guidance: [
      "明确时代、地域、服饰制度、建筑、器物、自然环境和文化气质。",
      "不确定史实时采用保守表达，不混搭朝代、地域或现代元素。",
    ],
    negative: ["朝代混搭", "现代物件", "泛化古风符号", "错误服饰器物"],
  },
  {
    id: "story-scene",
    label: "场景与视觉叙事",
    category: "Scenes & Storytelling",
    guidance: [
      "明确人物、地点、时间、事件、冲突、动作起点和情绪落点。",
      "让前景、中景、背景和环境反馈共同提供可见故事线索。",
    ],
    negative: ["通用空背景", "动作无因果", "情绪与事件脱节", "随机世界观元素"],
  },
  {
    id: "document",
    label: "文档与出版物",
    category: "Documents & Publishing",
    guidance: [
      "明确页面尺寸、分栏、目录、标题层级、表格图表系统、页码和阅读节奏。",
      "文案保持短而准确，图表、标签和说明严格对齐版面网格。",
    ],
    negative: ["Word 默认排版", "密集小字", "无层级长文", "表格错位", "页面风格不一致"],
  },
  {
    id: "general",
    label: "通用商业视觉",
    category: "Other Use Cases",
    guidance: [
      "先确定唯一核心主体、用途、观看顺序和决定性瞬间，再补充风格与效果。",
      "每个视觉选择都服务主体识别、情绪或信息传达，不堆叠无动机特效。",
    ],
    negative: ["主题偏离", "主体不清", "效果堆叠", "模板拼接感"],
  },
] as const

const MATCHERS: readonly [VisualPromptTemplateId, RegExp][] = [
  ["ui-interface", /APP|应用|UI|UX|界面|网页|网站|web\s*端|落地页|启动页|后台|仪表盘|dashboard|小程序|弹窗|信息卡片/i],
  ["infographic", /信息图|图解|流程图|关系图|知识图谱|时间线|数据可视化|图表|diagram|infographic/i],
  ["product", /产品图|产品拆解|概念产品|商品|电商|包装|详情页|商业广告|运动鞋|茶饮|饮料|香水|珠宝|美妆|护肤|肤质分析/i],
  ["brand", /品牌视觉|品牌识别|VI\b|logo|标志|字标|品牌触点/i],
  ["poster", /海报|封面|KV|主视觉|宣传图|Campaign|字体设计|排版视觉/i],
  ["architecture", /建筑|室内|空间设计|景观|展厅|店铺|住宅|城市规划|interior|architecture/i],
  ["classical", /历史|古风|国风|朝代|唐代|宋代|明代|清代|敦煌|水墨|古典|诗词/i],
  ["character", /角色设定|人物设定|动作表|转面图|角色卡|收藏玩具|潮玩|手办|盲盒|character\s*sheet/i],
  ["document", /白皮书|画册|手册|报告页面|出版物|杂志内页|文档设计/i],
  ["illustration", /插画|绘本|水彩|油画|版画|手绘|illustration|painting/i],
  ["photography", /摄影|照片|写真|写实|纪实|棚拍|镜头|photo|realistic/i],
  ["story-scene", /场景|故事|叙事|世界观|电影画面|分镜|旅程/i],
]

// Distilled from the repository's 22 industrial templates. These are prompt
// methods, not separate product workflows, so they can be selected without
// forcing the user to understand the library taxonomy.
const METHODS: readonly VisualPromptMethod[] = [
  {
    id: "scientific-scale-diagram",
    label: "科学尺度缩放图",
    templateId: "infographic",
    match: /微观|宏观|尺度|倍率|放大|剖面尺度|细胞|分子|宇宙尺度/i,
    guidance: [
      "建立从宏观到微观或从整体到局部的单向尺度序列，每一级明确对象、单位、倍率和独有结构证据。",
      "使用 4 至 8 个层级窗口和短标签，尺度变化必须真实，不把所有窗口画成相同纹理。",
    ],
    negative: ["通用放大镜排版", "尺度单位缺失", "各层级视觉重复"],
  },
  {
    id: "sports-campaign-poster",
    label: "运动商业 Campaign",
    templateId: "poster",
    match: /运动|赛事|球赛|跑步|健身|竞技|campaign/i,
    guidance: [
      "把运动员或产品的发力方向、速度轨迹和品牌标题组织成一条清楚动势，保留赛事、日期或 CTA 的固定信息区。",
      "动作必须符合重心和关节发力，特效只能延续运动方向，不能遮挡脸部、产品和文字。",
    ],
  },
  {
    id: "conceptual-typography-poster",
    label: "概念字体海报",
    templateId: "poster",
    match: /字体海报|字体设计|文字主视觉|typography|字形实验/i,
    guidance: [
      "让准确标题本身承担主视觉，明确字形结构、字重、行距、对齐、留白和与主题概念的形变逻辑。",
      "先保证文字逐字可读，再进行一种有动机的拉伸、切割、重复或空间变形，不混用多种字体特效。",
    ],
    negative: ["标题错字", "无意义小字", "多种字体特效堆叠"],
  },
  {
    id: "ink-double-exposure-poster",
    label: "水墨双重曝光海报",
    templateId: "poster",
    match: /水墨.*(?:双重曝光|叠影)|双重曝光.*水墨/i,
    guidance: [
      "选择一个清晰主体轮廓作为外部形体，只在轮廓内部融合一个相关山水、城市或叙事场景。",
      "墨色浓淡、纸面留白和内部场景的明度共同建立层次，不把主体做成随机烟雾拼贴。",
    ],
  },
  {
    id: "nature-science-poster",
    label: "自然科普海报",
    templateId: "poster",
    match: /自然科普|植物科普|动物科普|生态科普|物种介绍/i,
    guidance: [
      "锁定物种、生态关系和可核查特征，主物种图像、结构细节窗、短标签和环境信息按阅读顺序组织。",
      "科学信息与审美同等重要，不虚构器官、习性、比例或栖息地。",
    ],
  },
  {
    id: "personalized-beauty-report",
    label: "个性化美妆报告",
    templateId: "product",
    match: /美妆报告|护肤报告|肤质分析|妆容分析|色彩诊断/i,
    guidance: [
      "将人物或肤质证据、诊断摘要、重点指标、产品建议和使用顺序组织为可读报告，不伪造医学结论。",
      "色卡、材质样本和产品图必须与结论对应，人物肤色保持自然，不用过度磨皮掩盖分析依据。",
    ],
  },
  {
    id: "brand-touchpoint-board",
    label: "品牌触点视觉板",
    templateId: "brand",
    match: /品牌触点|应用系统|品牌延展|物料延展|品牌应用/i,
    guidance: [
      "选择 3 至 6 个真实品牌触点，统一 Logo 安全区、配色、字体、图像风格和网格，同时让每个触点保留真实用途。",
      "触点之间通过同一识别规则关联，不做无关样机大合集。",
    ],
  },
  {
    id: "street-accident-moment",
    label: "街头决定性瞬间摄影",
    templateId: "photography",
    match: /街头.*(?:瞬间|意外|抓拍)|决定性瞬间|纪实街拍/i,
    guidance: [
      "明确事件发生前后的因果、人物反应、视线、重心和环境反馈，用单一快门瞬间讲清事件。",
      "机位像真实摄影师可到达的位置，运动模糊只出现在真实运动部位，背景人物反应不重复。",
    ],
  },
  {
    id: "character-design-sheet",
    label: "角色设定表",
    templateId: "character",
    match: /角色设定|人物设定|角色卡|动作表|表情表|转面图|character\s*sheet/i,
    guidance: [
      "先建立一套身份锚点，再选择正侧背转面、动作或表情中的一种交付任务；同一张图不要同时塞满所有任务。",
      "所有视图共享比例、五官、发型、服装结构、配色和道具尺寸，变化只来自指定角度或动作。",
    ],
  },
  {
    id: "3d-collectible-toy",
    label: "3D 收藏玩具",
    templateId: "character",
    match: /收藏玩具|潮玩|手办|盲盒|玩具渲染|collectible|vinyl\s*toy/i,
    guidance: [
      "明确角色轮廓、玩具比例、分件结构、材质、涂装边界、底座关系和包装用途。",
      "使用可制造的厚度、接缝和支撑关系，避免把皮肤、布料与塑料全部渲染成同一种表面。",
    ],
  },
  {
    id: "concept-product-breakdown",
    label: "概念产品研发拆解",
    templateId: "product",
    match: /产品拆解|概念产品|研发拆解|结构爆炸|功能分解|exploded\s*view/i,
    guidance: [
      "从使用问题、核心功能、部件结构、材料、交互和制造逻辑解释产品，不只画一个科幻外壳。",
      "若使用爆炸关系，每个部件必须有明确装配方向和功能归属，并保留完整主产品作为理解锚点。",
    ],
  },
  {
    id: "ui-screenshot-system",
    label: "UI 截图系统",
    templateId: "ui-interface",
    guidance: ["锁定平台、单屏任务、信息层级、准确文案和真实组件状态。"],
  },
  {
    id: "infographic-engine",
    label: "信息图引擎",
    templateId: "infographic",
    guidance: ["先确定信息关系和阅读路径，再选择流程、时间线、对比、层级或网络结构。"],
  },
  {
    id: "poster-layout-system",
    label: "海报排版系统",
    templateId: "poster",
    guidance: ["用一个主视觉、一个标题层级和一个稳定网格完成传播任务。"],
  },
  {
    id: "product-commerce-visual",
    label: "商品商业视觉",
    templateId: "product",
    guidance: ["围绕唯一商品主角建立卖点、材质、使用情境和文案安全区。"],
  },
  {
    id: "brand-identity-package",
    label: "品牌身份系统",
    templateId: "brand",
    guidance: ["先定义品牌定位和核心识别资产，再扩展色彩、字体、图形与使用规则。"],
  },
  {
    id: "architecture-space",
    label: "建筑与空间",
    templateId: "architecture",
    guidance: ["空间功能、动线、尺度、结构、材料和光线必须形成可建造的统一系统。"],
  },
  {
    id: "realistic-photography",
    label: "写实摄影",
    templateId: "photography",
    guidance: ["用真实机位、焦段、曝光、光源和物理接触捕捉决定性瞬间。"],
  },
  {
    id: "illustration-art-style",
    label: "插画与艺术风格",
    templateId: "illustration",
    guidance: ["让媒介笔触、色彩脚本和叙事动作共同表达主题，不只附加风格名称。"],
  },
  {
    id: "scene-storytelling",
    label: "场景叙事",
    templateId: "story-scene",
    guidance: ["用人物、事件、环境反馈和前中后景线索构成可见故事闭环。"],
  },
  {
    id: "history-classical-themes",
    label: "历史与古典题材",
    templateId: "classical",
    guidance: ["时代、地域、服饰、建筑、器物和自然环境必须彼此一致。"],
  },
  {
    id: "document-publishing",
    label: "文档与出版物",
    templateId: "document",
    guidance: ["以阅读顺序、分栏、标题层级、图表和页码系统组织出版页面。"],
  },
] as const

function templateById(id: VisualPromptTemplateId) {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES.at(-1)!
}

export function selectVisualPromptTemplate(instruction: string) {
  const id = MATCHERS.find(([, pattern]) => pattern.test(instruction))?.[0] ?? "general"
  return templateById(id)
}

export function selectVisualPromptMethod(instruction: string) {
  const template = selectVisualPromptTemplate(instruction)
  return (
    METHODS.find(
      (method) =>
        method.templateId === template.id && method.match?.test(instruction)
    ) ?? METHODS.find((method) => method.templateId === template.id)
  )
}

function uiArchitecture(instruction: string) {
  if (/后台|管理|仪表盘|dashboard|CRM|SaaS/i.test(instruction)) {
    return "采用工作型产品结构：侧边导航或紧凑顶部导航、页面标题与上下文操作、关键指标或筛选区、主数据表/任务列表、分页与批量操作；优先扫描、比较和重复操作效率。"
  }
  if (/落地页|官网|营销页|产品网站|landing/i.test(instruction)) {
    return "采用真实产品官网结构：品牌导航、产品名称与明确价值说明、一个主 CTA、产品实景或界面证据、核心能力、使用流程、可信信息和收束 CTA；首屏保留下一段内容提示。"
  }
  if (/详情页|商品页|电商/i.test(instruction)) {
    return "采用转化型详情结构：商品视觉与关键信息、价格和规格、主购买操作、核心卖点、使用场景、评价与保障；购买操作始终清楚，不用装饰压过商品。"
  }
  if (/登录|注册|表单|设置|账户/i.test(instruction)) {
    return "采用单任务表单结构：清楚标题与说明、分组字段、校验与错误反馈、唯一主提交操作、必要的辅助入口；不添加与任务无关的仪表盘或营销模块。"
  }
  return "采用真实 App 页面结构：状态与页面标题、当前任务或核心状态、唯一主操作、与任务相关的内容模块、必要的反馈区和稳定底部导航；三秒内能理解页面用途。"
}

function uiTreatment(instruction: string) {
  if (/毛玻璃|glass|玻璃/i.test(instruction)) {
    return "辅助效果选择毛玻璃：只用于导航、浮层或一个需要分层的区域，保持文字对比，不让所有卡片玻璃化。"
  }
  if (/Bento|便当/i.test(instruction)) {
    return "辅助效果选择 Bento Grid：只在内容确实由多个独立模块组成时使用，通过面积差表达优先级，不把普通列表强行卡片化。"
  }
  if (/3D|粒子|orb|shader|视差/i.test(instruction)) {
    return "辅助效果选择一种轻量空间效果：3D、粒子、流动渐变或视差四选一，只作为背景或视觉焦点，不遮挡文字和操作；普通设备和移动端提供简化方案。"
  }
  if (/编辑|杂志|editorial/i.test(instruction)) {
    return "主风格采用编辑排版，以字级、图文关系和留白建立气质；不额外叠加毛玻璃、Bento 和 3D。"
  }
  return "不预设毛玻璃、Bento、渐变或 3D；根据产品类型只选择一种必要的辅助效果，没有明确收益时保持纯净表面。"
}

export function buildTemplatePromptGuidance(
  instruction: string,
  width: number,
  height: number
) {
  const template = selectVisualPromptTemplate(instruction)
  const method = selectVisualPromptMethod(instruction)
  const base = [
    `模板路由：${template.label}（${template.category}）。`,
    ...(method ? [`专业方法：${method.label}（${method.id}）。`, ...method.guidance] : []),
    "该模板只负责补全专业方法，不得覆盖用户明确给出的主题、风格、媒介、文字、品牌色或参考图约束。",
    ...template.guidance,
  ]
  if (template.id !== "ui-interface") return base

  return [
    ...base,
    `交付画布：${width} × ${height}，正视单屏高保真 UI，不带设备外壳、透视样机、多屏拼图或设计说明。`,
    uiArchitecture(instruction),
    "先定义页面唯一任务、目标用户、当前状态和主操作，再组织信息；使用真实、简短、语义一致的产品文案和数据，不用 lorem ipsum 或乱码占位。",
    "建立可实现的设计系统：8pt 间距基线，统一栅格、字体层级、图标笔画、圆角、1px 低对比边框和克制阴影；同类组件必须一致。",
    "只呈现当前页面相关的默认状态，并在组件设计中体现 hover/active/disabled/loading/error 的统一语言；不要把所有状态拼成多屏展示板。",
    uiTreatment(instruction),
    "可用性优先：正文对比清楚、触控目标合理、按钮文案明确、内容不被遮挡，移动端与 Web 端都按目标设备重新组织而不是机械缩放。",
    "风格公式：一种主风格 + 至多一种辅助效果 + 一个点缀色。",
  ]
}

export function templateNegativePrompt(instruction: string) {
  const template = selectVisualPromptTemplate(instruction)
  const method = selectVisualPromptMethod(instruction)
  return [...template.negative, ...(method?.negative ?? [])].join("、")
}
