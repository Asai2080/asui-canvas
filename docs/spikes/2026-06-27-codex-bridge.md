# Codex Bridge 技术 Spike

日期：2026-06-27

## 背景

当前“交给 Codex”更接近复制/任务队列记录，不是目标交互。目标是点击网页按钮后，Codex 输入区或当前线程中出现类似“使用 Xcode 选项卡”的上下文卡片，让 ASUI 画布任务可以直接交给 Codex。

长期目标是让生图有两条路径：

- API 生图：网页直接调用图像 API，适合产品内快速生成。
- Codex 生图：网页把图片、标注、任务和回写地址交给 Codex，由 Codex 理解、生成或调用工具后回写画布。

## 调研结论

### 可用能力

本机 Codex CLI 支持 `app-server`：

```bash
codex app-server --stdio
codex app-server generate-ts --out /tmp/asui-codex-schema
```

生成的本机协议类型里，`turn/start` 的 `input` 支持：

```ts
type UserInput =
  | { type: "text"; text: string; text_elements: TextElement[] }
  | { type: "image"; url: string; detail?: ImageDetail }
  | { type: "localImage"; path: string; detail?: ImageDetail }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string }
```

这说明 ASUI 可以把“画布任务卡片”设计为结构化输入，而不是复制普通文本。

### 验证结果

已验证 `app-server` stdio 链路可用：

- `initialize` 成功
- `thread/start` 可创建 ephemeral 临时线程
- `thread/inject_items` 可注入 raw Responses item
- 注入内容支持文本和 `input_image` data URL
- 以上验证不触发模型生成

验证结果示例：

```json
{
  "ok": true,
  "threadId": "019f06f0-42ca-7cf2-8fbb-145375f01649",
  "injected": true
}
```

## 关键限制

- `app-server` 可以创建/恢复/注入 Codex thread，但不等于一定能控制当前 Codex Desktop 输入框的 composer UI。
- 目标截图里的“小卡片”更像 Codex 客户端 UI 对 `mention`、`skill`、`localImage`、plugin/app context 的渲染结果。
- 仅用 `thread/inject_items` 可以把任务写进上下文，但不保证它显示在当前输入框里。
- WebSocket transport 官方标注为 experimental / unsupported，生产功能优先用 stdio/unix socket 的本地桥接服务。

## 推荐 2.1 架构

### 组件

1. ASUI 网页
   - 收集当前图片节点、标注、提示词、尺寸、任务类型。
   - 导出当前画布截图、标注参考图、源图文件。
   - 调用本地桥接 API。

2. ASUI Codex Bridge
   - 本地 Node 服务或 Next API route。
   - 通过 `codex app-server --stdio` 或 unix socket 管理 Codex 会话。
   - 把网页任务转换为 Codex `UserInput`。

3. Codex Thread
   - 接收 ASUI 任务。
   - 理解标注、执行生图/改图/抠图。
   - 通过回写接口把结果返回 ASUI。

4. ASUI 回写接口
   - 接收 Codex 生成的图片路径或 data URL。
   - 创建新的图片版本节点。
   - 在画布中生成“AI/Codex 新版本”连接。

### 数据包

```json
{
  "taskId": "asui-task-xxx",
  "taskType": "image-generation | image-edit | cutout",
  "sourceImage": "/absolute/path/source.png",
  "annotatedReference": "/absolute/path/annotated.png",
  "prompt": "用户提示词",
  "annotations": [
    {
      "id": "shape:xxx",
      "text": "把这里改成红色",
      "bounds": { "x": 0.12, "y": 0.3, "w": 0.2, "h": 0.1 }
    }
  ],
  "output": {
    "width": 1024,
    "height": 1024,
    "callbackUrl": "http://localhost:3030/api/codex/results"
  }
}
```

### Codex 输入策略

优先级从高到低：

1. `turn/start` + `localImage`
   - 最适合让 Codex 看到真实图片。
   - 会启动一次 Codex turn。

2. `turn/start` + `text_elements`
   - 可用于模拟“ASUI 画布任务卡片”的占位符。
   - 需要验证 Codex Desktop 是否按元素渲染成卡片。

3. `thread/inject_items`
   - 适合后台注入上下文。
   - 不适合实现“输入框里出现卡片”的可视交互。

4. MCP Resource
   - 适合让 Codex 主动读取 `asui://task/{id}`。
   - 稳定，但更像上下文读取，不是主动弹卡片。

## 下一步

1. 做 `asui-codex-bridge` 最小服务：
   - `POST /api/codex/bridge/send`
   - 创建或恢复 Codex thread
   - 发送 `turn/start`，带 `text` + `localImage`

2. 做 ASUI 任务导出：
   - 源图
   - 标注参考图
   - 结构化标注 JSON

3. 做回写接口：
   - `POST /api/codex/results`
   - 接收生成图片并创建画布版本

4. 验证 Codex Desktop UI：
   - 是否能显示类似卡片
   - 如果不能，退而求其次显示 Codex thread 消息，并在 ASUI 侧显示“已发送到 Codex”

## 判断

这个方向可行。真正要确认的是 UI 级别的“输入框卡片”是否能被第三方 app-server client 控制；协议层的任务传输、图片传输和上下文注入已经验证可行。
