"use client"

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  useMessage,
} from "@assistant-ui/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AspectRatioIcon,
  ArrowUp01Icon,
  Clock01Icon,
  ClapperboardIcon,
  Image01Icon,
  Loading03Icon,
  MultiplicationSignIcon,
  MessageQuestionIcon,
  PlayIcon,
  Refresh03Icon,
  Settings01Icon,
  SidebarRight01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { BorderBeam } from "border-beam"

import { EdgeBlur } from "@/components/ui/edge-blur"
import type {
  AgentExecutionMode,
  AgentTask,
} from "@/lib/canvas-agent/task-schema"
import type {
  DiscoveredSkill,
  SkillRecord,
} from "@/lib/canvas-agent/skills/schema"

import { CuriousAiOrb } from "./curious-ai-orb"
import {
  getAgentTaskResultText,
  isAgentCapabilityIntroduction,
  isAgentTaskTerminal,
  tasksToThreadMessages,
} from "./agent-view-model"
import { SkillPicker } from "./skill-picker"
import { ThinkingAnimationIcon } from "./thinking-animation-icon"
import {
  type AgentCanvasContext,
  type AgentCanvasSelectionPreview,
  useAgentTasks,
} from "./use-agent-tasks"

type CanvasAgentShellProps = {
  open: boolean
  selectionKey: string
  getCanvasContext: () => AgentCanvasContext
  onClearCanvasContext: (selectionId: string) => void
  onClose: () => void
  storyboardRequestKey?: number
  onBusyChange?: (busy: boolean) => void
  onForegroundTaskChange?: (task?: AgentTask) => void
}

const STATUS_LABELS: Partial<Record<AgentTask["status"], string>> = {
  queued: "队列中",
  understanding: "理解需求",
  "reading-skill": "读取 Skill",
  "reading-canvas": "读取画布",
  "compiling-prompt": "整理提示词",
  "awaiting-confirmation": "等待确认",
  planning: "规划步骤",
  executing: "生成中",
  "writing-canvas": "写回画布",
  completed: "完成",
  "partially-completed": "部分完成",
  failed: "失败",
  cancelled: "取消",
}

type AgentMessageContextValue = {
  tasksByMessageId: ReadonlyMap<string, AgentTask>
  cancelTask: (taskId: string) => Promise<void>
  confirmTask: (
    taskId: string,
    dimensions?: { width: number; height: number }
  ) => Promise<void>
  retryTask: (taskId: string) => Promise<void>
}

const AgentMessageContext = createContext<AgentMessageContextValue | null>(null)
const EXECUTION_MODE_STORAGE_KEY = "asui-canvas:agent-execution-mode"
const STORYBOARD_COUNTS = [4, 6, 8, 12] as const
const IMAGE_SIZE_PRESETS = [
  { label: "1:1", width: 1024, height: 1024 },
  { label: "3:4", width: 768, height: 1024 },
  { label: "4:3", width: 1024, height: 768 },
  { label: "9:16", width: 576, height: 1024 },
  { label: "16:9", width: 1024, height: 576 },
] as const
const STORYBOARD_SIZE_PRESETS = [
  { label: "HD", width: 1024, height: 576 },
  { label: "Full HD", width: 1920, height: 1080 },
] as const

function formatTaskTime(task: AgentTask) {
  const value = task.completedAt ?? task.updatedAt
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0
    ? Math.abs(left)
    : greatestCommonDivisor(right, left % right)
}

function outputSizeLabel(
  output:
    | NonNullable<AgentTask["compiledPrompt"]>["outputs"][number]
    | undefined
) {
  if (!output?.width || !output.height) return undefined
  return dimensionsLabel(output.width, output.height)
}

function dimensionsLabel(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height)
  return `${width} × ${height} · ${width / divisor}:${height / divisor}`
}

function promptWithDimensions(
  prompt: string,
  previousWidth: number | undefined,
  previousHeight: number | undefined,
  width: number,
  height: number
) {
  if (!previousWidth || !previousHeight) return prompt
  return prompt
    .split(`${previousWidth} × ${previousHeight}`)
    .join(`${width} × ${height}`)
    .split(`${previousWidth}x${previousHeight}`)
    .join(`${width}x${height}`)
}

function AgentPromptReview({
  task,
  readOnly = false,
}: {
  task: AgentTask
  readOnly?: boolean
}) {
  const context = useContext(AgentMessageContext)
  const compiledPrompt = task.compiledPrompt
  const firstOutput = compiledPrompt?.outputs[0]
  const canAdjustSize = Boolean(
    !readOnly && compiledPrompt?.outputs.every(
      (output) =>
        output.mediaType === "image" &&
        (output.operation ?? "create") === "create"
    )
  )
  const isStoryboard = compiledPrompt?.summary.includes("分镜") ?? false
  const [widthInput, setWidthInput] = useState(
    String(firstOutput?.width ?? 1024)
  )
  const [heightInput, setHeightInput] = useState(
    String(firstOutput?.height ?? 1024)
  )

  if (!compiledPrompt) return null

  const width = Number(widthInput)
  const height = Number(heightInput)
  const validDimensions =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 64 &&
    width <= 8192 &&
    height >= 64 &&
    height <= 8192 &&
    (!isStoryboard || width * 9 === height * 16)
  const sizePresets = isStoryboard
    ? STORYBOARD_SIZE_PRESETS
    : IMAGE_SIZE_PRESETS
  const currentSizeLabel = canAdjustSize && validDimensions
    ? dimensionsLabel(width, height)
    : outputSizeLabel(firstOutput)

  return (
    <div className="agent-bubble agent-bubble--assistant agent-prompt-review">
      <div className="agent-prompt-review__header">
        <span>专业提示词已准备好</span>
        <span>
          {readOnly
            ? task.status === "cancelled"
              ? "已取消"
              : "已确认"
            : "等待确认"}
        </span>
      </div>
      <p className="agent-prompt-review__summary">
        {compiledPrompt.summary}
      </p>
      <div className="agent-prompt-review__meta">
        <span>{compiledPrompt.outputs.length} 个生成结果</span>
        {currentSizeLabel && <span>{currentSizeLabel}</span>}
      </div>
      {canAdjustSize && (
        <div className="agent-prompt-review__size-editor">
          <div className="agent-prompt-review__size-heading">
            <span>
              <HugeiconsIcon
                icon={AspectRatioIcon}
                size={14}
                strokeWidth={1.8}
              />
              生成尺寸
            </span>
            <small>{isStoryboard ? "分镜固定 16:9" : "选择比例或输入宽高"}</small>
          </div>
          <div
            className={`agent-prompt-review__size-presets${isStoryboard ? " is-storyboard" : ""}`}
            role="group"
            aria-label="选择生成尺寸"
          >
            {sizePresets.map((preset) => {
              const selected =
                width === preset.width && height === preset.height
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={selected ? "is-active" : undefined}
                  aria-pressed={selected}
                  onClick={() => {
                    setWidthInput(String(preset.width))
                    setHeightInput(String(preset.height))
                  }}
                >
                  <span>{preset.label}</span>
                  <small>{preset.width}×{preset.height}</small>
                </button>
              )
            })}
          </div>
          <div className="agent-prompt-review__size-inputs">
            <label>
              <span>W</span>
              <input
                type="number"
                min={64}
                max={8192}
                step={1}
                inputMode="numeric"
                value={widthInput}
                onChange={(event) => setWidthInput(event.target.value)}
                aria-label="生成宽度"
              />
            </label>
            <span aria-hidden="true">×</span>
            <label>
              <span>H</span>
              <input
                type="number"
                min={64}
                max={8192}
                step={1}
                inputMode="numeric"
                value={heightInput}
                onChange={(event) => setHeightInput(event.target.value)}
                aria-label="生成高度"
              />
            </label>
          </div>
          {!validDimensions && (
            <p className="agent-prompt-review__size-error" role="alert">
              {isStoryboard
                ? "分镜宽高需为 16:9，且在 64 到 8192 之间"
                : "宽高需为 64 到 8192 之间的整数"}
            </p>
          )}
        </div>
      )}
      <div className="agent-prompt-review__content">
        {compiledPrompt.outputs.map((output, index) => {
          const outputLabel =
            canAdjustSize && validDimensions
              ? currentSizeLabel
              : outputSizeLabel(output)
          const outputPrompt =
            canAdjustSize && validDimensions
              ? promptWithDimensions(
                  output.prompt,
                  output.width,
                  output.height,
                  width,
                  height
                )
              : output.prompt

          return (
            <section key={output.id}>
              <strong>
                {compiledPrompt.summary.includes("分镜")
                  ? `KF#${String(index + 1).padStart(2, "0")}`
                  : compiledPrompt.outputs.length > 1
                    ? `版本 ${index + 1}`
                    : "最终提示词"}
                {outputLabel ? ` · ${outputLabel}` : ""}
              </strong>
              <p>{outputPrompt}</p>
            </section>
          )
        })}
      </div>
      {!readOnly && (
        <>
          <p className="agent-prompt-review__hint">
            提示词已同步到画布。确认后我会自动生成并写回结果。
          </p>
          <div className="agent-prompt-review__actions">
            <button
              type="button"
              className="is-secondary"
              onClick={() => void context?.cancelTask(task.id)}
            >
              取消
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={canAdjustSize && !validDimensions}
              onClick={() =>
                void context?.confirmTask(
                  task.id,
                  canAdjustSize && validDimensions ? { width, height } : undefined
                )
              }
            >
              <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.8} />
              确认并生成
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AgentTaskBubble({
  task,
  messageKind,
}: {
  task: AgentTask
  messageKind?: "prompt-review" | "result"
}) {
  const context = useContext(AgentMessageContext)
  if (messageKind === "prompt-review") {
    return (
      <AgentPromptReview
        task={task}
        readOnly={task.status !== "awaiting-confirmation"}
      />
    )
  }

  if (!isAgentTaskTerminal(task)) return null
  const resultText = getAgentTaskResultText(task)
  const showCapabilityIntroduction = isAgentCapabilityIntroduction(task)

  return (
    <div className={`agent-bubble agent-bubble--assistant agent-bubble--result status-${task.status}`}>
      {showCapabilityIntroduction ? (
        <div className="agent-capability-intro">
          <h3 className="agent-capability-intro__heading">
            有什么可以帮助你的？🤔
          </h3>
          <div className="agent-capability-intro__list">
            <div className="agent-capability-intro__item">
              <span className="agent-capability-intro__emoji" aria-hidden="true">🎨</span>
              <strong>生成图片</strong>
            </div>
            <div className="agent-capability-intro__item">
              <span className="agent-capability-intro__emoji" aria-hidden="true">🎬</span>
              <span>生成视频</span>
            </div>
          </div>
          <p className="agent-capability-intro__footer">告诉我你的需求哟～</p>
        </div>
      ) : (
        <p className="agent-result-copy">{resultText}</p>
      )}
      <div className="agent-result-meta">
        <time dateTime={task.completedAt ?? task.updatedAt}>
          {formatTaskTime(task)}
        </time>
        {task.status === "failed" && task.error?.retryable && (
          <button
            type="button"
            onClick={() => void context?.retryTask(task.id)}
          >
            <HugeiconsIcon icon={Refresh03Icon} size={13} strokeWidth={1.8} />
            重试
          </button>
        )}
      </div>
    </div>
  )
}

function AgentActiveThinkingStatus({
  task,
  queuedBehind,
  onCancel,
}: {
  task: AgentTask
  queuedBehind: number
  onCancel: (taskId: string) => Promise<void>
}) {
  return (
    <div className="canvas-agent-active-thinking" role="status" aria-live="polite">
      <span className="canvas-agent-active-thinking__title">
        <ThinkingAnimationIcon active />
        <strong>思考中</strong>
      </span>
      <span className="canvas-agent-active-thinking__stage">
        {STATUS_LABELS[task.status] ?? "处理中"}
        {queuedBehind > 0 ? ` · ${queuedBehind} 个排队` : ""}
      </span>
      {task.status !== "writing-canvas" && (
        <button
          type="button"
          onClick={() => void onCancel(task.id)}
          aria-label="停止当前任务"
          title="停止"
        >
          <HugeiconsIcon icon={StopIcon} size={13} strokeWidth={1.8} />
          停止
        </button>
      )}
    </div>
  )
}

function ThreadMessage() {
  const messageId = useMessage((message) => message.id)
  const role = useMessage((message) => message.role)
  const context = useContext(AgentMessageContext)
  const task = context?.tasksByMessageId.get(messageId)

  if (role === "assistant" && !task) return null

  return (
    <MessagePrimitive.Root className={`agent-message agent-message--${role}`}>
      {role === "assistant" && task ? (
        <AgentTaskBubble
          task={task}
          messageKind={
            messageId.endsWith("-assistant-review")
              ? "prompt-review"
              : "result"
          }
        />
      ) : (
        <div className={`agent-bubble agent-bubble--${role}`}>
          <MessagePrimitive.Parts
            components={{
              Text: () => (
                <MessagePartPrimitive.Text className="agent-message-text" />
              ),
            }}
          />
        </div>
      )}
    </MessagePrimitive.Root>
  )
}

export function CanvasAgentShell({
  open,
  selectionKey,
  getCanvasContext,
  onClearCanvasContext,
  onClose,
  storyboardRequestKey = 0,
  onBusyChange,
  onForegroundTaskChange,
}: CanvasAgentShellProps) {
  const [selectedSkillId, setSelectedSkillId] = useState("")
  const [selectedSkill, setSelectedSkill] = useState<SkillRecord>()
  const [selectedTextModel, setSelectedTextModel] = useState("")
  const [executionMode, setExecutionMode] =
    useState<AgentExecutionMode>("confirm")
  const [storyboardCount, setStoryboardCount] = useState(6)
  const [storyboardSetupError, setStoryboardSetupError] = useState("")
  const [conversationStartedAt, setConversationStartedAt] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const storyboardMode =
    selectedSkill?.name.trim().toLocaleLowerCase() === "nb-fj"
  const {
    tasks,
    foregroundTask,
    isLoading,
    error,
    submitMessage,
    cancelTask,
    confirmTask,
    retryTask,
  } = useAgentTasks({
    getCanvasContext,
    selectedSkillId,
    selectedTextModel,
    requestedOutputCount: storyboardMode ? storyboardCount : undefined,
    executionMode,
    conversationStartedAt,
    onBusyChange,
    onForegroundTaskChange,
  })
  const visibleTasks = useMemo(
    () =>
      showHistory || !conversationStartedAt
        ? tasks
        : tasks.filter((task) => task.createdAt >= conversationStartedAt),
    [conversationStartedAt, showHistory, tasks]
  )
  const messages = useMemo(
    () => tasksToThreadMessages(visibleTasks),
    [visibleTasks]
  )
  const tasksByMessageId = useMemo(
    () =>
      new Map(
        visibleTasks.flatMap((task) => [
          [`${task.id}-user`, task] as const,
          [`${task.id}-assistant-review`, task] as const,
          [`${task.id}-assistant`, task] as const,
        ])
      ),
    [visibleTasks]
  )
  const messageContextValue = useMemo<AgentMessageContextValue>(
    () => ({ tasksByMessageId, cancelTask, confirmTask, retryTask }),
    [cancelTask, confirmTask, retryTask, tasksByMessageId]
  )
  const runtime = useExternalStoreRuntime({
    messages,
    isLoading,
    isRunning: Boolean(foregroundTask),
    onNew: submitMessage,
  })
  const queuedBehind = visibleTasks.filter(
    (task) => task.status === "queued" && task.id !== foregroundTask?.id
  ).length

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(EXECUTION_MODE_STORAGE_KEY)
      if (stored === "auto" || stored === "confirm") {
        setExecutionMode(stored)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const prepareStoryboardWorkflow = useCallback(async () => {
    setStoryboardSetupError("")
    setExecutionMode("confirm")
    window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, "confirm")

    try {
      const response = await fetch("/api/agent/skills", { cache: "no-store" })
      const payload = (await response.json()) as {
        skills?: SkillRecord[]
        discovered?: DiscoveredSkill[]
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "无法读取分镜 Skill")
      }

      let skill = payload.skills?.find(
        (candidate) =>
          candidate.available &&
          candidate.name.trim().toLocaleLowerCase() === "nb-fj"
      )
      if (!skill) {
        const discovered = payload.discovered?.find(
          (candidate) =>
            candidate.name.trim().toLocaleLowerCase() === "nb-fj"
        )
        if (!discovered) {
          throw new Error("未找到本地 nb-fj Skill")
        }
        const registerResponse = await fetch("/api/agent/skills/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "local",
            sourcePath: discovered.path,
          }),
        })
        const registerPayload = (await registerResponse.json()) as {
          skill?: SkillRecord
          error?: string
        }
        if (!registerResponse.ok || !registerPayload.skill) {
          throw new Error(registerPayload.error ?? "分镜 Skill 调用失败")
        }
        skill = registerPayload.skill
      }

      setSelectedSkillId(skill.id)
      setSelectedSkill(skill)
    } catch (reason) {
      setStoryboardSetupError(
        reason instanceof Error ? reason.message : "分镜 Skill 调用失败"
      )
    }
  }, [])

  useEffect(() => {
    if (storyboardRequestKey <= 0) return
    const frame = window.requestAnimationFrame(() => {
      void prepareStoryboardWorkflow()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [prepareStoryboardWorkflow, storyboardRequestKey])

  const toggleExecutionMode = () => {
    setExecutionMode((current) => {
      const next = current === "auto" ? "confirm" : "auto"
      window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, next)
      return next
    })
  }

  const selectionPreviews = useMemo<AgentCanvasSelectionPreview[]>(() => {
    if (!open || !selectionKey) return []
    try {
      return getCanvasContext().selectionPreviews
    } catch {
      return []
    }
  }, [getCanvasContext, open, selectionKey])

  const startNewConversation = () => {
    setConversationStartedAt(new Date().toISOString())
    setShowHistory(false)
    setSelectedSkillId("")
    setSelectedSkill(undefined)
    setSelectedTextModel("")
  }

  const openApiSettings = () => {
    onClose()
    window.setTimeout(() => {
      window.dispatchEvent(new Event("asui:open-api-config"))
    }, 0)
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside
        className={`canvas-agent-shell${open ? " is-open" : ""}`}
        aria-hidden={!open}
        aria-label="画布 Agent"
        inert={!open}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="canvas-agent-header">
          <div className="canvas-agent-heading">
            <h2>{showHistory ? "历史对话" : "新对话"}</h2>
          </div>
          <div className="canvas-agent-header-actions">
            <button type="button" className="canvas-agent-icon-button" onClick={startNewConversation} aria-label="新建对话" title="新建对话">
              <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className={`canvas-agent-icon-button${showHistory ? " is-active" : ""}`}
              onClick={() => setShowHistory((current) => !current)}
              aria-label="历史对话"
              title="历史对话"
            >
              <HugeiconsIcon icon={Clock01Icon} size={19} strokeWidth={1.7} />
            </button>
            <button type="button" className="canvas-agent-icon-button" onClick={onClose} aria-label="关闭画布 Agent" title="收起侧栏">
              <HugeiconsIcon icon={SidebarRight01Icon} size={19} strokeWidth={1.7} />
            </button>
            <button type="button" className="canvas-agent-icon-button" onClick={openApiSettings} aria-label="Agent 设置" title="API 设置">
              <HugeiconsIcon icon={Settings01Icon} size={19} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <AgentMessageContext.Provider value={messageContextValue}>
          <ThreadPrimitive.Root className="canvas-agent-thread">
            <ThreadPrimitive.Viewport className="canvas-agent-viewport">
            <ThreadPrimitive.Empty>
              <div className="canvas-agent-empty">
                <CuriousAiOrb />
                <h3>有什么可以帮你？</h3>
                <p>生成的图片、视频会放到画布上，点击画布内容即可继续引用给我。</p>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages components={{ Message: ThreadMessage }} />
            <div className="canvas-agent-scroll-clearance" aria-hidden="true" />
            <ThreadPrimitive.ViewportFooter className="canvas-agent-composer-wrap">
              <EdgeBlur
                position="bottom"
                height={68}
                className="canvas-agent-scroll-edge-blur"
              />
              {foregroundTask && (
                <AgentActiveThinkingStatus
                  task={foregroundTask}
                  queuedBehind={queuedBehind}
                  onCancel={cancelTask}
                />
              )}
              {error && <p className="canvas-agent-error" role="alert">{error}</p>}
              {storyboardSetupError && (
                <p className="canvas-agent-error" role="alert">
                  {storyboardSetupError}
                </p>
              )}
              <BorderBeam
                size="md"
                colorVariant="colorful"
                strength={0.67}
                borderRadius={30}
                className="canvas-agent-composer-beam"
              >
                <ComposerPrimitive.Root className="canvas-agent-composer">
                  {selectionPreviews.length > 0 && (
                    <div className="canvas-agent-selection-references" aria-label="当前引用的画布节点">
                      {selectionPreviews.map((selectionPreview) => (
                        <div
                          key={selectionPreview.selectionId}
                          className="canvas-agent-selection-reference"
                          title={`${selectionPreview.label} · ${selectionPreview.nodeId}`}
                        >
                          <span className="canvas-agent-selection-thumbnail">
                            {selectionPreview.src && selectionPreview.mediaType === "video" ? (
                              <video src={selectionPreview.src} muted playsInline preload="metadata" />
                            ) : selectionPreview.src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={selectionPreview.src} alt={selectionPreview.label} />
                            ) : (
                              <HugeiconsIcon icon={Image01Icon} size={14} strokeWidth={1.7} />
                            )}
                          </span>
                          <span className="canvas-agent-selection-copy">
                            <strong>{selectionPreview.label}</strong>
                          </span>
                          <button
                            type="button"
                            className="canvas-agent-selection-remove"
                            onClick={() => onClearCanvasContext(selectionPreview.selectionId)}
                            aria-label={`取消引用${selectionPreview.label}`}
                            title="取消引用"
                          >
                            <HugeiconsIcon icon={MultiplicationSignIcon} size={12} strokeWidth={1.8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <ComposerPrimitive.Input
                    className={`canvas-agent-input${selectionPreviews.length > 0 ? " has-selection-reference" : ""}`}
                    placeholder={
                      storyboardMode
                        ? "描述分镜主题，Enter 生成分镜提示词"
                        : "输入消息，Enter 发送"
                    }
                    rows={3}
                  />
                  {storyboardMode && (
                    <div className="canvas-agent-storyboard-config">
                      <span>
                        <HugeiconsIcon
                          icon={ClapperboardIcon}
                          size={14}
                          strokeWidth={1.8}
                        />
                        分镜张数
                      </span>
                      <div role="group" aria-label="选择分镜张数">
                        {STORYBOARD_COUNTS.map((count) => (
                          <button
                            key={count}
                            type="button"
                            className={storyboardCount === count ? "is-active" : undefined}
                            onClick={() => setStoryboardCount(count)}
                            aria-pressed={storyboardCount === count}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="canvas-agent-composer-footer">
                    <div className="canvas-agent-composer-tools">
                      <span className="canvas-agent-context-button" title="自动读取当前画布选区" aria-label="自动读取当前画布选区">
                        <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.7} />
                      </span>
                      <SkillPicker
                        compact
                        value={selectedSkillId}
                        onChange={setSelectedSkillId}
                        selectedSkill={selectedSkill}
                        onSkillSelect={setSelectedSkill}
                        modelValue={selectedTextModel}
                        onModelChange={setSelectedTextModel}
                      />
                      <button
                        type="button"
                        className={`canvas-agent-execution-mode is-${executionMode}`}
                        onClick={toggleExecutionMode}
                        aria-label={
                          executionMode === "auto"
                            ? "当前为自动执行，点击切换为询问执行"
                            : "当前为询问执行，点击切换为自动执行"
                        }
                        title={
                          executionMode === "auto"
                            ? "自动执行：提示词生成后直接执行"
                            : "询问执行：确认提示词后再执行"
                        }
                      >
                        <HugeiconsIcon
                          icon={
                            executionMode === "auto"
                              ? PlayIcon
                              : MessageQuestionIcon
                          }
                          size={14}
                          strokeWidth={1.8}
                        />
                        <span>
                          {executionMode === "auto"
                            ? "自动执行"
                            : "询问执行"}
                        </span>
                      </button>
                      <span className="canvas-agent-canvas-button" title="当前画布" aria-label="当前画布">
                        <HugeiconsIcon icon={Image01Icon} size={17} strokeWidth={1.7} />
                      </span>
                    </div>
                    <ComposerPrimitive.Send className="canvas-agent-send" aria-label="发送给画布 Agent">
                      <HugeiconsIcon
                        icon={foregroundTask ? Loading03Icon : ArrowUp01Icon}
                        size={17}
                        strokeWidth={1.8}
                        className={foregroundTask ? "animate-spin" : undefined}
                      />
                    </ComposerPrimitive.Send>
                  </div>
                </ComposerPrimitive.Root>
              </BorderBeam>
            </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </AgentMessageContext.Provider>
      </aside>
    </AssistantRuntimeProvider>
  )
}
