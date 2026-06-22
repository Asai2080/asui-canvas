# 阿水画布 Asui Canvas

一个面向 AI 图像创作的无限画布工作台。在同一张画布上完成生图、直接批注、局部精确修改与版本追溯，让图像迭代像在设计稿上改稿一样直观。

## 核心能力

- 无限画布：自由缩放、拖拽、多节点编排。
- 尺寸生图：创建任意尺寸的图片占位节点，输入提示词后直接填充。
- 画布原生批注：用手写、文字、箭头和图形在图片上标出修改意图。
- 精确改图：批注旁直接发起生成，传入原图与局部修改要求，尽量保留未标注区域。
- 版本链路：新版本保留在画布中，不覆盖原图，方便对比和回溯。
- 本地演示模式：无 API 配置也能体验完整交互流程。

## 快速开始

环境要求：Node.js 18 或更高版本。

```bash
npm install
npm run dev -- -p 3020
```

打开 [http://127.0.0.1:3020](http://127.0.0.1:3020)。

## 使用流程

1. 点击顶部的「新建生图节点」。
2. 设置画布宽高，选中占位节点。
3. 输入提示词，点击「Fill Image Holder」生成图片。
4. 选中图片后点击「AI 标注」，在需要修改的位置输入要求。
5. 点击批注旁的「生成」，得到一个可对比的新版本。

更完整的操作说明见 [使用说明](docs/USAGE.md)。

## API 配置与密钥安全

点击顶部「阿水画布」打开 API 配置，填写 OpenAI 兼容接口或 OpenRouter 的 Base URL、API Key 和图像模型名称。

- API Key 只存在当前浏览器标签的 `sessionStorage` 中。
- 关闭标签页后会话配置自动失效。
- 旧版本可能写入的持久化 Key 会在页面启动时自动删除。
- 不要将真实 Key 写入源码、README 或提交到 Git。
- 公网部署建议改为服务端密钥管理和用户鉴权，不要对外开放无保护的生图代理接口。

未配置 API 时，项目使用本地演示生成器，不会请求外部模型。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- tldraw 无限画布
- Tailwind CSS v4 + shadcn/ui
- Vitest + ESLint
- OpenAI-compatible Images API / OpenRouter 图像模型

架构、数据流、标注定位策略和安全边界见 [技术实现方案](docs/TECHNICAL_DESIGN.md)。

## 开发命令

```bash
npm run lint
npm test
npm run build
```

## 授权说明

本项目源码采用 [MIT License](LICENSE)。第三方依赖保留各自的授权条款；如用于生产环境，请特别确认 tldraw SDK 的当前授权要求。
