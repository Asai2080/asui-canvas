const EXPLICIT_UI_REQUEST_PATTERN =
  /APP|应用|UI|UX|界面|网页|网站|web\s*端|落地页|启动页|后台|仪表盘|dashboard|小程序|弹窗|信息卡片/i
const DIGITAL_PRODUCT_CONTEXT_PATTERN =
  /移动端|手机端|客户端|桌面端|PC\s*端|H5|数字产品|软件产品|产品设计/i
const DIGITAL_PAGE_PATTERN =
  /首页|页面|设计稿|工作台|控制台|登录页|注册页|详情页|列表页|设置页|个人中心/i

const GENERIC_UI_PHRASES = [
  /高端|高级感|高质量|高保真/g,
  /现代简洁|简约现代|美观大气/g,
  /层级清晰|信息层级清晰/g,
  /组件统一|风格统一/g,
  /用户体验良好|易于使用/g,
  /可直接交付|可开发落地/g,
]

type UiProfile = {
  product: string
  audience: string
  task: string
  state: string
  primaryAction: string
  visibleCopy: string[]
  modules: string[]
  palette: string
  tone: string
  components: string
}

type UiDesignCalibration = {
  visualLanguage: string
  dials: string
  hierarchyRule: string
  antiTemplateRule: string
  surfaceRule: string
}

type UiSpacingSystem = {
  ladder: string
  hierarchy: string
  rhythm: string
}

export type UiPromptSpecification = {
  prompt: string
  negativePrompt: string
  sharedConstraints: string[]
}

export function isUiDesignInstruction(instruction: string) {
  return (
    EXPLICIT_UI_REQUEST_PATTERN.test(instruction) ||
    (DIGITAL_PRODUCT_CONTEXT_PATTERN.test(instruction) &&
      DIGITAL_PAGE_PATTERN.test(instruction))
  )
}

function domainUiProfile(instruction: string): UiProfile {
  if (/拉屎|排便|便便|肠道/i.test(instruction)) {
    return {
      product: "日常排便与肠道状态记录 App",
      audience: "希望低负担记录排便规律、观察趋势的普通成年人",
      task: "让用户在三秒内确认今日是否已记录，并用一次点击开始记录",
      state: "今天尚未记录；连续记录 7 天；最近一次为昨天 08:12，状态正常",
      primaryAction: "记录一次",
      visibleCopy: [
        "今天，5月20日",
        "今日尚未记录",
        "记录一次",
        "连续 7 天",
        "最近一次 昨天 08:12",
        "近 7 天趋势",
        "首页 / 记录 / 趋势 / 我的",
      ],
      modules: [
        "日期、自然问候与隐私入口",
        "今日记录状态和唯一主按钮",
        "连续天数、最近一次、近七天频次三项摘要",
        "最多三条近期记录，每条只显示日期、时间、状态和简短标签",
        "紧凑七日柱状趋势",
        "四项底部导航",
      ],
      palette:
        "暖白 #F7F8F4 背景、深墨 #17201C 正文、森林绿 #2F7D5B 主操作、鼠尾草绿 #DCEADF 表面、琥珀 #D99B45 仅用于提醒",
      tone:
        "成熟、尊重隐私、生活化且无羞耻感；不用粪便 emoji、卡通便便、糖果色或医院式蓝白",
      components:
        "轻量状态面板、实心主按钮、三列数据摘要、紧凑记录列表、小型趋势图、线性健康图标和稳定底部导航",
    }
  }

  if (/自由职业|项目收支|项目现金流|待收款/i.test(instruction)) {
    return {
      product: "自由职业者项目收支管理 App",
      audience: "需要同时掌握项目回款、支出和现金流风险的自由职业者",
      task: "在三秒内确认本月收支与待回款风险，并快速记一笔",
      state: "本月收入 ¥28,600，支出 ¥7,240，待收款 ¥12,800；一笔尾款逾期 3 天",
      primaryAction: "记一笔",
      visibleCopy: [
        "本月收支",
        "收入 ¥28,600",
        "支出 ¥7,240",
        "待收款 ¥12,800",
        "记一笔",
        "尾款逾期 3 天",
        "活跃项目",
        "首页 / 项目 / 流水 / 我的",
      ],
      modules: [
        "月份、自然问候、搜索和提醒入口",
        "紧凑本月收支状态区，不使用占满画面的单一大金额",
        "收入、支出、待收款三项摘要和唯一记账主操作",
        "一条逾期回款提醒",
        "最多三条活跃项目，每条只显示名称、状态和净额",
        "四项底部导航",
      ],
      palette:
        "暖白 #F7F8F4 背景、深墨 #17201C 正文、森林绿 #2F7D5B 主操作、鼠尾草绿 #DCEADF 表面、琥珀 #D99B45 只表示临近回款；支出数字使用低饱和砖红",
      tone:
        "安静、专业、个人工作工具气质，不做银行后台、股票大盘或通用 SaaS 数据看板",
      components:
        "紧凑收支状态区、三项数据摘要、实心主按钮、单行风险提醒、项目列表、线性财务图标和稳定底部导航",
    }
  }

  if (/记账|账单|消费|预算|支出|财务/i.test(instruction)) {
    return {
      product: "个人记账与预算管理 App",
      audience: "需要快速记一笔并掌握本月收支的个人用户",
      task: "查看本月可用预算，并快速新增一笔支出",
      state: "本月已支出 ¥3,286.40，预算剩余 ¥2,713.60，较上月下降 8%",
      primaryAction: "记一笔",
      visibleCopy: [
        "本月账单",
        "已支出 ¥3,286.40",
        "预算剩余 ¥2,713.60",
        "记一笔",
        "最近交易",
        "查看全部",
        "首页 / 账单 / 统计 / 我的",
      ],
      modules: [
        "月份切换、页面标题与搜索入口",
        "本月支出和预算进度",
        "唯一新增记账主操作",
        "餐饮、交通、购物三项分类摘要",
        "最多四条最近交易",
        "四项底部导航",
      ],
      palette:
        "暖白 #F7F8F4 背景、深墨 #17201C 正文、森林绿 #2F7D5B 主操作、鼠尾草绿 #DCEADF 表面、琥珀 #D99B45 仅表示临近回款或提醒；负向金额使用低饱和砖红，不做大面积色块",
      tone: "安静、可信、数字优先，不使用金融科技霓虹渐变或装饰性大图",
      components:
        "预算进度、金额摘要、分类图标、交易列表、实心主按钮和稳定底部导航",
    }
  }

  if (/饮水|喝水|补水|水量/i.test(instruction)) {
    return {
      product: "每日饮水与补水节奏记录 App",
      audience: "希望用低负担记录饮水量并保持规律补水的日常用户",
      task: "在三秒内确认今日饮水进度，并快速记录一杯水",
      state: "今日已饮水 1200 ml，目标 2000 ml，完成 60%；最近一次为 09:25 的 350 ml",
      primaryAction: "记录一杯",
      visibleCopy: [
        "今日饮水",
        "1200 ml / 2000 ml",
        "已完成 60%",
        "记录一杯",
        "最近记录",
        "今日趋势",
        "首页 / 记录 / 趋势 / 我的",
      ],
      modules: [
        "日期、页面标题和提醒入口",
        "今日饮水量、目标值和清楚的 60% 进度",
        "唯一记录饮水主操作",
        "最多三条最近记录，只显示时间、饮品与容量",
        "紧凑的今日补水节奏趋势",
        "四项底部导航",
      ],
      palette:
        "暖白 #F7F8F4 背景、深墨 #17201C 正文、森林绿 #2F7D5B 主操作、鼠尾草绿 #DCEADF 表面、湖蓝只作为极少量水量数据辅助色",
      tone:
        "清爽、安静、可信，保持日常健康工具的轻负担感；不使用水滴堆叠、海洋渐变或儿童化蓝色卡片",
      components:
        "环形或线性饮水进度、实心记录按钮、紧凑饮水列表、小型时间趋势、统一线性杯具图标和稳定底部导航",
    }
  }

  if (/后台|管理|仪表盘|dashboard|CRM|SaaS/i.test(instruction)) {
    return {
      product: "面向日常运营的 Web 工作台",
      audience: "需要高频扫描、筛选、比较和处理任务的运营人员",
      task: "快速识别异常指标并处理最高优先级任务",
      state: "今日 128 个任务，12 个待处理，3 个异常；数据更新于 10:24",
      primaryAction: "新建任务",
      visibleCopy: [
        "运营概览",
        "今日任务 128",
        "待处理 12",
        "异常 3",
        "新建任务",
        "全部状态",
        "搜索任务",
        "最近更新 10:24",
      ],
      modules: [
        "紧凑侧边导航",
        "页面标题、时间范围与主操作",
        "三至四项关键指标",
        "筛选、搜索和批量操作栏",
        "占据主要面积的数据表或任务列表",
        "分页与结果计数",
      ],
      palette:
        "中性白 #FAFAF9 背景、炭黑 #1D211F 正文、青绿 #18745D 主操作、冷灰 #E7E9E7 边界、琥珀和红色只表示风险",
      tone: "安静、紧凑、工作导向，强调扫描效率而不是装饰卡片",
      components:
        "侧边导航、指标块、分段筛选、搜索框、数据表、状态徽标、复选框、分页和主按钮",
    }
  }

  if (/学习|课程|教育|背单词|阅读/i.test(instruction)) {
    return {
      product: "个人学习计划 App",
      audience: "希望明确今日学习任务并保持进度的学生",
      task: "查看今日计划并继续下一项学习任务",
      state: "今日完成 2/4 项，连续学习 12 天，下一项为 20 分钟复习",
      primaryAction: "继续学习",
      visibleCopy: [
        "今日学习",
        "已完成 2/4",
        "连续 12 天",
        "继续学习",
        "今日计划",
        "本周进度",
        "首页 / 计划 / 资料 / 我的",
      ],
      modules: [
        "日期、头像和学习连续天数",
        "今日总体进度与唯一主操作",
        "最多三条今日任务",
        "本周学习趋势摘要",
        "四项底部导航",
      ],
      palette:
        "柔白 #F8F8F5 背景、墨黑 #20221F 正文、湖蓝 #286F8E 主色、嫩绿 #BFD9C2 进度强调、黄色只用于待办提醒",
      tone: "清晰、有节奏、适度亲和，不幼儿化、不堆叠奖章和游戏化装饰",
      components:
        "环形进度、任务列表、状态勾选、紧凑趋势、实心主按钮和底部导航",
    }
  }

  if (/电商|购物|商城|商品|详情页/i.test(instruction)) {
    return {
      product: "移动电商商品浏览与购买页面",
      audience: "需要快速比较商品信息并完成购买的消费者",
      task: "理解商品差异、选择规格并加入购物车",
      state: "商品有货，已选择默认规格，展示当前价格和两项关键权益",
      primaryAction: "加入购物车",
      visibleCopy: [
        "商品详情",
        "¥299",
        "已选 默认规格",
        "现货",
        "加入购物车",
        "立即购买",
        "详情 / 评价 / 推荐",
      ],
      modules: [
        "顶部返回、搜索和购物车",
        "完整商品主图",
        "商品名、价格、短卖点和状态",
        "规格选择与两项服务权益",
        "固定双操作购买栏",
      ],
      palette:
        "中性白背景、深灰正文、从用户品牌或商品提取一个主色、红色只用于价格和促销、浅灰用于分组",
      tone: "商品优先、转化清楚，不用大面积装饰压过商品信息",
      components:
        "商品媒体区、价格、规格选择、权益行、标签页和固定购买操作栏",
    }
  }

  const topic = instruction
    .replace(/帮我|请|生成|设计|制作|一个|一张|高保真|UI|UX|界面|页面|尺寸\s*\d+\s*[x×]\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36)
  const product = topic || "用户指定的数字产品"
  return {
    product,
    audience: "需要在当前页面快速理解状态并完成核心任务的目标用户",
    task: "在三秒内理解当前状态，并完成一个最高优先级操作",
    state: "使用真实、可信、与产品领域一致的默认数据状态，不使用 lorem ipsum 或无意义占位",
    primaryAction: "开始操作",
    visibleCopy: [
      "页面标题",
      "当前状态",
      "开始操作",
      "最近内容",
      "查看全部",
      "首页 / 任务 / 数据 / 我的",
    ],
    modules: [
      "页面上下文和必要导航",
      "当前核心状态",
      "唯一主操作",
      "支持决策的次级摘要",
      "最多三至四条真实内容",
      "与平台一致的稳定导航",
    ],
    palette:
      "暖白或浅中性色背景、接近黑色的正文、一个与产品语义匹配的品牌主色、一个低饱和辅助色和明确语义状态色",
    tone: "围绕产品领域选择克制、可信、可长期使用的视觉语言，不套用通用科技蓝模板",
    components:
      "使用平台原生可实现的导航、按钮、列表、输入、状态、数据摘要和反馈组件",
  }
}

function uiPageKind(instruction: string) {
  if (/登录页|登录界面|登录页面|登录屏|sign[ -]?in|log[ -]?in/i.test(instruction)) {
    return "login" as const
  }
  if (/注册页|注册界面|注册页面|注册屏|sign[ -]?up/i.test(instruction)) {
    return "register" as const
  }
  return "default" as const
}

function uiProfile(instruction: string): UiProfile {
  const domain = domainUiProfile(instruction)
  const pageKind = uiPageKind(instruction)
  if (pageKind === "default") return domain

  const login = pageKind === "login"
  return {
    ...domain,
    task: login
      ? "让尚未登录的用户选择一种清楚、安全且低负担的登录方式并进入账户"
      : "让新用户完成必要的账户创建与协议确认，不在本屏展示登录后的产品内容",
    state: login
      ? "首次打开应用，用户尚未登录，也尚未填写手机号或验证码"
      : "首次注册，必要字段尚未填写，协议尚未确认",
    primaryAction: login ? "手机号登录" : "创建账户",
    visibleCopy: login
      ? [
          "轻松记录，从今天开始",
          "手机号登录",
          "其他登录方式",
          "用户协议",
          "隐私政策",
        ]
      : [
          "创建账户",
          "手机号",
          "验证码",
          "同意用户协议与隐私政策",
          "已有账户，去登录",
        ],
    modules: login
      ? [
          "品牌欢迎语与不超过两行的价值说明",
          "与产品气质一致的主插画或品牌识别图形",
          "一个高对比主登录按钮和必要的次级登录方式",
          "用户协议、隐私政策与必要的辅助入口",
        ]
      : [
          "品牌标题与简短注册说明",
          "手机号与验证码等必要字段",
          "协议确认和唯一创建账户按钮",
          "返回登录的次级入口",
        ],
    components: login
      ? "品牌欢迎区、主插画、主登录按钮、次级登录按钮组、方式图标和协议文字；不使用数据卡片、趋势图或底部主导航"
      : "紧凑注册表单、验证码操作、协议勾选、主提交按钮和返回登录入口；不展示登录后的业务模块",
  }
}

function hasKnownUiDomain(instruction: string) {
  return /拉屎|排便|便便|肠道|自由职业|项目收支|项目现金流|待收款|记账|账单|消费|预算|支出|财务|饮水|喝水|补水|水量|后台|管理|仪表盘|dashboard|CRM|SaaS|学习|课程|教育|背单词|阅读|电商|购物|商城|商品|详情页/i.test(
    instruction
  )
}

function explicitUiStyle(instruction: string) {
  return instruction.match(
    /(?:采用|使用|风格为|做成|生成)([^\n，。；]{2,32}(?:风格|美学|设计语言|排版))/i
  )?.[1]?.trim()
}

function uiDesignCalibration(
  instruction: string,
  platform: "移动端 App" | "Web 端"
): UiDesignCalibration {
  const explicitStyle = explicitUiStyle(instruction)
  const dashboard = /后台|管理|仪表盘|dashboard|CRM|SaaS/i.test(instruction)
  const landing = /落地页|官网|营销页|landing/i.test(instruction)
  const health = /健康|排便|肠道|医疗|运动/i.test(instruction)
  const commerce = /电商|购物|商城|商品|详情页/i.test(instruction)
  const authentication = uiPageKind(instruction) !== "default"
  const visualLanguage = explicitStyle
    ? `用户指定的主设计语言为“${explicitStyle}”；只选一套与之匹配的字体、网格、形状和材质语法，不混入其他流行风格。`
    : dashboard
      ? "理性、数据优先的工作型界面：稳定网格、高信息密度、明确状态和最少装饰。"
      : landing
        ? "有品牌识别的产品叙事：一个主价值、真实产品证据和克制的编辑式节奏，不使用通用 SaaS 渐变首屏。"
        : health
          ? "温和人文但临床可读：自然中性底色、低压力品牌色、尊重隐私的文案和简洁健康图形。"
          : commerce
            ? "商品与购买决策优先：强媒体区、清楚价格和规格、稳定购买操作，品牌色只强调转化节点。"
            : "克制的当代产品设计：内容优先、字级对比明确、一个主色、有节制的表面层级和稳定导航。"

  const variance = dashboard ? 4 : landing ? 6 : 5
  const density = dashboard ? 8 : landing ? 4 : commerce ? 6 : 5
  const assets = landing || commerce ? 7 : dashboard ? 3 : 4
  const fidelity = /参考图|品牌|设计系统|Logo/i.test(instruction) ? 9 : 5
  const surfaceRule = dashboard
    ? "使用 1px 低对比边框和极轻阴影划分面板层级；不使用全页毛玻璃、厚重阴影、霓虹发光或背景噪点，数据清晰度优先。"
    : landing
      ? "只在确有层级需要的顶部导航或一个悬浮面板使用半透明 backdrop blur；其他区域使用细边框或轻阴影。渐变网格和噪点只能低透明度用于大面积背景，不放在正文和按钮后面。"
      : "卡片使用 1px 低对比细边框或轻柔 soft shadow 二选一建立层级；毛玻璃、渐变网格和噪点不是默认装饰，只有用户指定的视觉语言需要时才局部使用。"

  return {
    visualLanguage,
    dials: `可视变化 ${variance}/10；信息密度 ${density}/10；资产依赖 ${assets}/10；品牌忠实 ${fidelity}/10。${platform === "移动端 App" ? "静态成片只用可见状态表达交互反馈。" : "资产与界面结构分层明确，不用装饰图片替代真实产品证据。"}`,
    hierarchyRule: authentication
      ? "所有区域按“品牌与欢迎 → 身份入口 → 唯一主操作 → 次级登录方式 → 协议与隐私”分配面积；认证完成前不展示首页数据、趋势、列表或底部主导航。"
      : "所有区域按“当前上下文 → 核心状态/内容 → 唯一主操作 → 次级证据 → 稳定导航”分配面积；面积和对比必须与优先级一致。",
    antiTemplateRule:
      "不将每段文字、指标和图标都包成圆角卡片；不伪造客户 Logo、证言、安全徽章或无来源统计；不用微型标签、随机坐标、状态点和装饰英文填空。",
    surfaceRule,
  }
}

function uiSpacingSystem(
  instruction: string,
  platform: "移动端 App" | "Web 端"
): UiSpacingSystem {
  const dashboard = /后台|管理|仪表盘|dashboard|CRM|SaaS/i.test(instruction)
  const landing = /落地页|官网|营销页|产品网站|landing/i.test(instruction)
  const calmConsumer = /健康|排便|肠道|饮水|冥想|睡眠|日记|学习/i.test(instruction)
  const linear = /Linear|线性工具/i.test(instruction)
  const editorial = /编辑|瑞士|国际主义|报刊|纽约时报|NYT/i.test(instruction)
  const pentagram = /Pentagram|五角设计/i.test(instruction)

  if (platform === "Web 端" && landing) {
    return {
      ladder: editorial
        ? "4 / 8 / 16 / 24 / 32 / 48 / 96px"
        : linear
          ? "4 / 8 / 12 / 16 / 24 / 40 / 64 / 96px"
          : "8 / 16 / 24 / 32 / 48 / 64 / 96px",
      hierarchy: pentagram
        ? "12 列栅格，列沟 24–32px；页面水平边距 48–64px；区块垂直间隔 64–96px；组件组间隔 24–32px；组件内部留白 16–24px"
        : "页面水平边距 48–64px；区块垂直间隔 64–96px；组件组间隔 24–32px；组件内部留白 16–24px；图标与文字间隔 8–12px",
      rhythm:
        "首屏只保留一个主视觉与一条主行动路径；相邻元素靠近表示同组，不同区块用至少两级更大的间隔分开；页面留白约占可视区域 40%，不以空卡片填满画面。",
    }
  }

  if (platform === "Web 端" || dashboard) {
    return {
      ladder: "4 / 8 / 12 / 16 / 24 / 32 / 48px",
      hierarchy:
        "页面外边距 32–40px；主区块间隔 24–32px；面板间隔 16–24px；面板内边距 16–24px；表单/工具栏控件间隔 8–12px；图标与标签间隔 8px；表格行高 44–48px",
      rhythm:
        "高密度不等于拥挤：工具条、指标区和数据主体之间必须有清楚的 24px 以上分组间隔；同类行使用完全一致的内边距和基线，不用额外卡片填补空白。",
    }
  }

  return {
    ladder: calmConsumer
      ? "8 / 16 / 24 / 40 / 64 / 96px"
      : editorial
        ? "4 / 8 / 16 / 24 / 32 / 48 / 96px"
        : "8 / 12 / 16 / 24 / 32 / 40 / 48px",
    hierarchy: calmConsumer
      ? "屏幕左右外边距 48px；主区块间隔 32–40px；同组卡片间隔 16–24px；卡片内边距 24px；列表行内间隔 16px；图标与文字间隔 12px"
      : "屏幕左右外边距 48px；主区块间隔 24–32px；同组卡片间隔 16px；卡片内边距 24px；列表行内间隔 12–16px；图标与文字间隔 12px",
    rhythm:
      "用间距建立亲疏层级：标题贴近所属内容，区块之间明显拉开；同一级间距保持一致，禁止每处都用同一个 gap。至少保留 40% 可呼吸的背景区域，内容放不下时删减次级模块，不压缩安全边距。",
  }
}

function briefSection(brief: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return brief
    .match(new RegExp(`【${escaped}】\\s*([\\s\\S]*?)(?=\\n【|$)`))?.[1]
    ?.trim()
    .slice(0, 720)
}

function mobileLayout(width: number, height: number, instruction: string) {
  const side = Math.max(32, Math.round(width * 0.064))
  const top = Math.max(48, Math.round(height * 0.04))
  const bottom = Math.max(72, Math.round(height * 0.06))
  return {
    platform: "移动端 App" as const,
    safeArea: `安全区 x=${side}–${width - side}px，y=${top}–${height - bottom}px`,
    wireframe: uiPageKind(instruction) === "default"
      ? [
          "顶部 9%：页面上下文、标题和至多两个图标操作",
          "核心区 25%：当前状态、关键数据和唯一主操作",
          "内容区 46%：两类以内辅助信息，列表最多 4 行",
          "收束区 10%：一项趋势或摘要，不重复核心数据",
          "底部 10%：画布内部的 4 项导航，完整显示图标与短标签",
        ]
      : [
          "顶部 12%：品牌标识、欢迎标题和必要的帮助入口",
          "视觉区 30%：一幅与产品气质一致的主插画或品牌图形",
          "认证区 38%：一个主登录/注册操作和必要的次级方式，等宽对齐",
          "辅助区 10%：切换登录/注册的次级入口",
          "底部 10%：用户协议与隐私政策，不出现登录后的主导航",
        ],
    tokens:
      "8pt 间距体系；左右内容对齐到同一栅格；标题 40–44px/1.25，模块标题 30–34px/1.3，正文 26–28px/1.45，辅助文字 22–24px/1.4；触控目标至少 88×88px；卡片圆角 16–24px，只在分组确有必要时使用；1px 低对比边框与克制阴影",
    accessibility:
      "保持 8pt 间距和统一栅格；正文与背景对比清楚；所有触控目标至少 88×88px；不改变上面已经确定的字号、圆角、颜色和阴影 token",
  }
}

function webLayout(width: number, height: number, instruction: string) {
  const landing = /落地页|官网|营销页|产品网站|landing/i.test(instruction)
  return {
    platform: "Web 端" as const,
    safeArea: `四周至少 ${Math.max(32, Math.round(width * 0.025))}px 安全边距，内容使用 12 列栅格`,
    wireframe: landing
      ? [
          "顶部 8%：品牌导航与一个主 CTA",
          "首屏 52%：产品名称、价值说明、主 CTA 和真实产品证据",
          "下一段 30%：三项核心能力或使用流程，首屏可见其开头",
          "底部 10%：可信信息或紧凑收束操作",
        ]
      : [
          "左侧 16%：紧凑导航和当前选中项",
          "顶部 9%：页面标题、上下文筛选与主操作",
          "摘要 18%：三至四项关键指标，面积按优先级分配",
          "主体 63%：筛选工具条和主数据表/任务列表，信息密度稳定",
          "底部 10%：分页、结果数与批量操作反馈",
        ],
    tokens:
      "8pt 间距体系与 12 列栅格；页面标题 32px/1.25，区块标题 20–24px/1.35，正文 14–16px/1.5，辅助文字 12–14px；交互目标至少 40px；卡片圆角 6–8px；1px 中性边框和极轻阴影；表格数字右对齐、文本左对齐",
    accessibility:
      "保持 8pt 间距和 12 列栅格；正文与背景对比清楚；交互目标至少 40px；表格数字右对齐、文本左对齐；不改变上面已经确定的字号、圆角、颜色和阴影 token",
  }
}

export function buildUiCreativeBrief(
  instruction: string,
  width = 750,
  height = 1624
) {
  const profile = uiProfile(instruction)
  const layout = height > width && width <= 1200
    ? mobileLayout(width, height, instruction)
    : webLayout(width, height, instruction)
  const calibration = uiDesignCalibration(instruction, layout.platform)
  const spacing = uiSpacingSystem(instruction, layout.platform)
  return [
    "【UI 产品定义】",
    `产品：${profile.product}；用户：${profile.audience}。`,
    `页面唯一任务：${profile.task}。主操作：“${profile.primaryAction}”。`,
    "",
    "【当前状态】",
    profile.state,
    "",
    "【可见内容与顺序】",
    ...profile.modules.map((module, index) => `${index + 1}. ${module}`),
    "",
    "【准确短文案】",
    profile.visibleCopy.map((copy) => `“${copy}”`).join("、"),
    "",
    "【设计系统】",
    `${profile.tone}。${profile.palette}。`,
    layout.tokens,
    calibration.visualLanguage,
    calibration.dials,
    `空间梯度：${spacing.ladder}。${spacing.hierarchy}。`,
    `留白节奏：${spacing.rhythm}`,
    "",
    "【画布与可用性】",
    `${width} × ${height} ${layout.platform}；${layout.safeArea}。`,
    "内容超量时减少次级模块和可见行数，不缩小到不可读，不允许裁切或越界。",
    "",
    "【禁止】",
    "设备样机、多屏拼图、伪文字、内容截断、通用蓝色卡片模板、无意义渐变和装饰性 3D。",
  ].join("\n")
}

export function isWeakUiCreativeBrief(brief: string) {
  const requiredEvidence = [
    /用户|受众|人群/,
    /页面.{0,6}(?:任务|目标)|主操作|CTA/,
    /当前状态|默认状态|数据/,
    /文案|“[^”]+”|按钮.{0,8}(?:名称|文字)/,
    /顶部|底部|导航|列表|表格|模块/,
    /颜色|#[0-9A-Fa-f]{6}|字体|字号|间距|栅格/,
    /\d{3,4}\s*[x×]\s*\d{3,4}|安全区|安全边距/,
  ]
  const evidence = requiredEvidence.filter((pattern) => pattern.test(brief)).length
  const genericCount = GENERIC_UI_PHRASES.filter((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(brief)
  }).length
  return evidence < 5 || (genericCount >= 3 && evidence < 7)
}

export function buildUiPromptSpecification({
  originalGoal,
  professionalBrief,
  width,
  height,
}: {
  originalGoal: string
  professionalBrief?: string
  width: number
  height: number
}): UiPromptSpecification {
  const profile = uiProfile(originalGoal)
  const layout = height > width && width <= 1200
    ? mobileLayout(width, height, originalGoal)
    : webLayout(width, height, originalGoal)
  const calibration = uiDesignCalibration(originalGoal, layout.platform)
  const spacing = uiSpacingSystem(originalGoal, layout.platform)
  const usableBrief = professionalBrief && !isWeakUiCreativeBrief(professionalBrief)
    ? professionalBrief
    : undefined
  const productDefinition = usableBrief
    ? briefSection(usableBrief, "UI 产品定义")
    : undefined
  const currentState = usableBrief
    ? briefSection(usableBrief, "当前状态")
    : undefined
  const orderedContent = usableBrief
    ? briefSection(usableBrief, "可见内容与顺序")
    : undefined
  const exactCopy = usableBrief
    ? briefSection(usableBrief, "准确短文案")
    : undefined
  const designSystem = usableBrief
    ? briefSection(usableBrief, "设计系统")
    : undefined
  const referenceAnalysis = usableBrief
    ? briefSection(usableBrief, "参考图分析")
    : undefined
  const knownDomain = hasKnownUiDomain(originalGoal)
  const pageSpecific = uiPageKind(originalGoal) !== "default"
  const referenceRequested =
    /(?:严格|高度|尽量)?参考(?:这|该|当前|选中|我给你的)?.{0,10}(?:图|图片|截图)|沿用参考图|参考图.{0,8}(?:风格|设计|排版|配色)/i.test(
      originalGoal
    )
  const userSpecifiedVisualSystem = Boolean(
    explicitUiStyle(originalGoal) ||
      /(?:使用|采用|主色|配色|色彩|色系)[^\n，。；]{0,32}(?:黑白|红|橙|黄|绿|青|蓝|紫|粉|灰|白|黑|#[0-9A-Fa-f]{6})/i.test(
        originalGoal
      )
  )
  const useModelDesignSystem = Boolean(
    designSystem && (!knownDomain || userSpecifiedVisualSystem || referenceRequested)
  )
  const useModelPageContent = Boolean(usableBrief && pageSpecific)
  const prompt = [
    `生成一张正视、平面的 ${width} × ${height} ${layout.platform} 的高保真产品界面，只呈现一个完整屏幕。`,
    `用户原始要求（最高优先级，逐项保留）：${originalGoal}`,
    "",
    ...(referenceRequested
      ? [
          "【参考图视觉拆解与迁移】",
          referenceAnalysis ??
            "先逐项分析主参考图的页面类型、区域比例、阅读路径、留白、字体层级、插画或品牌图形、按钮层级、组件几何、圆角、图标笔画、色彩角色和表面质感；只迁移与当前页面任务兼容的视觉语言。",
          "用户指定的当前页面类型和业务任务永远高于参考图内容；参考图控制视觉风格与兼容的版式关系，不得把当前登录/注册页改成首页、详情页或仪表盘。",
          "",
        ]
      : []),
    "【产品与页面任务】",
    knownDomain
      ? [
          `产品：${profile.product}。目标用户：${profile.audience}。`,
          `本屏唯一任务：${profile.task}。唯一主操作按钮写“${profile.primaryAction}”。`,
        ].join("\n")
      : productDefinition ?? [
          `产品：${profile.product}。目标用户：${profile.audience}。`,
          `本屏唯一任务：${profile.task}。唯一主操作按钮写“${profile.primaryAction}”。`,
        ].join("\n"),
    `当前默认状态：${knownDomain && !pageSpecific ? profile.state : currentState ?? profile.state}`,
    "",
    "【从上到下的页面线框】",
    ...layout.wireframe.map((region, index) => `${index + 1}. ${region}。`),
    `模块内容：${useModelPageContent ? orderedContent : knownDomain ? profile.modules.join("；") : orderedContent ?? profile.modules.join("；")}`,
    "",
    "【准确可见短文案】",
    knownDomain
      ? useModelPageContent && exactCopy
        ? exactCopy
        : profile.visibleCopy.map((copy) => `“${copy}”`).join("、")
      : exactCopy ?? profile.visibleCopy.map((copy) => `“${copy}”`).join("、"),
    "只绘制这些理解层级所必需的短文案；不生成大段说明、乱码、lorem ipsum 或额外营销口号。",
    "",
    "【视觉系统】",
    useModelDesignSystem
      ? designSystem
      : `${profile.tone}。颜色：${profile.palette}。`,
    "用户明确指定的风格、品牌色和设计系统优先于默认方向；主色只用于主操作、选中态和关键数据。",
    referenceRequested
      ? "用户明确要求参考设计风格时，沿用参考图可见的颜色角色、明度关系、渐变方式和色彩比例，但不复制第三方品牌标识或原文案；产品语义只负责校验可读性与状态色。"
      : "当用户没有明确指定品牌色时，使用暖白背景、深墨正文、森林绿主操作和低饱和鼠尾草表面作为统一基准；参考图的颜色不可覆盖当前产品语义。除非用户明确要求沿用参考图配色，否则不要复制参考图的主色、渐变或色彩比例。",
    `组件：${profile.components}。同类组件的高度、圆角、图标笔画和状态语言一致。`,
    `排版与尺寸：${useModelDesignSystem ? layout.accessibility : layout.tokens}。`,
    "",
    "【空间系统】",
    `只使用 ${spacing.ladder} 这一组间距 token。${spacing.hierarchy}。`,
    "【留白与节奏】",
    spacing.rhythm,
    "",
    "【设计推理与校准】",
    calibration.visualLanguage,
    calibration.dials,
    calibration.hierarchyRule,
    calibration.antiTemplateRule,
    `质感与反馈：${calibration.surfaceRule}静态成片只展示一个稳定完成状态；不要把 hover、scroll reveal、stagger 或持续发光画成装饰，反馈只能通过一个清晰的选中、按下或成功状态表达。`,
    "【产品细节与状态】",
    "关键组件必须有可开发的默认、加载、成功、失败、空、禁用、选中和焦点状态；当前成片只展示与本任务匹配的一种状态，不做多屏拼图或把所有状态挤在一张图里。",
    "反馈强度匹配动作重量：轻操作用局部状态变化，保存/复制用短暂结果提示，删除/发布/付款等高风险操作需要明确后果、确认或撤销路径；长操作先立即显示加载状态，完成后显示结果。",
    "错误文案必须说明哪里错、为什么错、如何修复，并保留用户已经输入的内容；长标题、长按钮、动态数字、日期、图表极值和空数据都要在最窄安全区内保持可读，不得溢出或造成布局跳动。",
    "可记忆的筛选、排序、展开状态、滚动位置、主题和未完成输入应有稳定的界面表达；键盘路径遵循 Tab、Enter、Space、Esc 和方向键的常见语义，焦点环不能被选中背景隐藏。",
    pageSpecific
      ? "认证页面只保留完成登录或注册所需的内容；不出现登录后的统计数据、近期记录、趋势图、业务列表或底部主导航。"
      : "移动端生活工具不要让单个金额、百分比或进度数字占据大面积主视觉；用一个清楚的状态区、一个主操作、三项以内摘要和紧凑列表建立层级。",
    "",
    "【图像模型渲染协议】",
    "先锁定画布和区域占比，再放置组件，最后填入准确短文案。同类组件数量、尺寸、对齐、圆角、边框和图标笔画必须一致。",
    "引号内的文案必须逐字渲染且只出现一次；放不下时优先减少次级内容，不生成伪文字、不改写按钮、不用密集小字伪装信息完整。",
    "",
    "【硬性画布约束】",
    `${layout.safeArea}。画布边缘就是界面边缘，不绘制设备外壳、操作系统状态栏、浏览器外壳、透视、景深或展示背景。`,
    "所有文字、图标、按钮、卡片、列表行、图表和导航的完整外轮廓必须落在画布内；内容过多时删除次级模块或减少可见行数，绝不缩小到不可读、裁切、遮挡或延伸到画布外。",
    "只输出最终产品界面，不输出设计说明、线框注释、尺寸标线、多屏拼图或作品集展示板。",
  ].join("\n")
  return {
    prompt,
    negativePrompt: [
      "设备样机、手机外壳、浏览器外壳、透视展示、景深、摄影光效",
      "多屏拼图、相邻页面、作品集展示板、线框说明、尺寸标注",
      "伪文字、乱码、lorem ipsum、长段小字、重复文案",
      "元素贴边、文字截断、图标截断、导航截断、模块越界、内容遮挡",
      "通用科技蓝卡片、无意义渐变、全页毛玻璃、装饰性 3D、emoji 主视觉",
      "巨型营销标题、空洞首屏、功能缺失、多个主按钮、组件风格不一致",
    ].join("；"),
    sharedConstraints: [
      `严格输出 ${width} × ${height}`,
      `${layout.platform}单屏 UI，正视、无设备外壳`,
      `页面唯一任务：${profile.task}`,
      `唯一主操作：${profile.primaryAction}`,
      layout.safeArea,
    ],
  }
}
