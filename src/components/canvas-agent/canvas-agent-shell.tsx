"use client"

import { createContext, useContext, useMemo, useState } from "react"
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
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Image01Icon,
  Loading03Icon,
  MultiplicationSignIcon,
  Refresh03Icon,
  Settings01Icon,
  SidebarRight01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { BorderBeam } from "border-beam"

import { EdgeBlur } from "@/components/ui/edge-blur"
import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import { CuriousAiOrb } from "./curious-ai-orb"
import { isAgentTaskTerminal, tasksToThreadMessages } from "./agent-view-model"
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
  onBusyChange?: (busy: boolean) => void
  onForegroundTaskChange?: (task?: AgentTask) => void
}

const STATUS_LABELS: Partial<Record<AgentTask["status"], string>> = {
  queued: "队列中",
  understanding: "理解需求",
  "reading-skill": "读取 Skill",
  "reading-canvas": "读取画布",
  "compiling-prompt": "整理提示词",
  planning: "规划步骤",
  executing: "生成中",
  "writing-canvas": "写回画布",
  completed: "完成",
  "partially-completed": "部分完成",
  failed: "失败",
  cancelled: "取消",
}

const STEP_STATUS_LABELS: Record<
  NonNullable<AgentTask["executionPlan"]>["steps"][number]["status"],
  string
> = {
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
}

type AgentMessageContextValue = {
  tasksByMessageId: ReadonlyMap<string, AgentTask>
  cancelTask: (taskId: string) => Promise<void>
  retryTask: (taskId: string) => Promise<void>
}

const AgentMessageContext = createContext<AgentMessageContextValue | null>(null)

function TaskStatusIcon({ status }: { status: AgentTask["status"] }) {
  if (status === "completed") {
    return <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />
  }

  if (status === "failed" || status === "partially-completed") {
    return <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.8} />
  }

  if (status === "cancelled") {
    return <HugeiconsIcon icon={MultiplicationSignIcon} size={14} strokeWidth={1.8} />
  }

  if (status === "executing" || status === "writing-canvas") {
    return (
      <HugeiconsIcon
        icon={Loading03Icon}
        size={14}
        strokeWidth={1.8}
        className="animate-spin"
      />
    )
  }

  return <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.8} />
}

function AgentThinkingDisclosure({ task }: { task: AgentTask }) {
  const isTerminal = isAgentTaskTerminal(task)
  const [open, setOpen] = useState(!isTerminal)
  const steps = task.executionPlan?.steps ?? []
  const completedSteps = steps.filter((step) => step.status === "completed").length
  const thinkingLabel =
    task.status === "completed" || task.status === "partially-completed"
      ? "已完成思考"
      : task.status === "failed"
        ? "思考已停止"
        : task.status === "cancelled"
          ? "已取消思考"
          : "思考中"
  const stageSummary =
    task.status === "queued"
      ? "任务正在等待执行，我会自动读取目标和画布上下文。"
      : task.status === "understanding"
        ? "正在识别创作目标、媒体类型、数量和尺寸要求。"
        : task.status === "reading-skill"
          ? "正在读取所选 Skill，并整理可执行约束。"
          : task.status === "reading-canvas"
            ? "正在读取当前画布、选区和引用节点。"
            : task.status === "compiling-prompt"
              ? "正在把目标整理为可执行的生成提示词。"
              : task.status === "planning"
                ? "正在拆分生成、写回画布和版本关系步骤。"
                : task.status === "executing"
                  ? "执行计划已就绪，正在生成图片或视频。"
                  : task.status === "writing-canvas"
                    ? "生成已完成，正在把结果写回对应画布节点。"
                    : task.status === "completed"
                      ? "目标已经执行完成，结果已写回画布。"
                      : task.status === "partially-completed"
                        ? "部分结果已经完成，其余步骤未能全部执行。"
                        : task.status === "failed"
                          ? "执行遇到问题，已保留当前计划和可恢复状态。"
                          : "任务已经取消，当前执行状态已保留。"

  return (
    <details
      className="agent-thinking"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="agent-thinking-title">
          <ThinkingAnimationIcon active={!isTerminal} />
          <strong>{thinkingLabel}</strong>
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.8}
          className="agent-thinking-chevron"
        />
      </summary>
      <div className="agent-thinking-content">
        <p>{stageSummary}</p>
        {task.interpretation?.summary && (
          <p>
            <span>目标理解</span>
            {task.interpretation.summary}
          </p>
        )}
        {task.compiledPrompt && (
          <p>
            <span>生成输出</span>
            已整理 {task.compiledPrompt.outputs.length} 个提示词
          </p>
        )}
        {steps.length > 0 && (
          <p>
            <span>执行进度</span>
            {completedSteps} / {steps.length} 个步骤已完成
          </p>
        )}
        <small>仅展示可审计的任务摘要</small>
      </div>
    </details>
  )
}

function AgentTaskBubble({ task }: { task: AgentTask }) {
  const context = useContext(AgentMessageContext)
  const isTerminal = isAgentTaskTerminal(task)
  const statusLabel = STATUS_LABELS[task.status] ?? task.status
  const reply =
    task.interpretation?.message ??
    (task.status === "queued"
      ? "任务已加入队列，我会在前一个任务结束后自动开始。"
      : "我正在理解你的目标，并准备接下来的执行步骤。")

  return (
    <div className={`agent-bubble agent-bubble--assistant status-${task.status}`}>
      <div className="agent-bubble-header">
        <span className="agent-bubble-author">Agent</span>
        <span className="agent-bubble-status">
          <TaskStatusIcon status={task.status} />
          {statusLabel}
        </span>
      </div>

      <AgentThinkingDisclosure
        key={`${task.id}-${isTerminal ? "terminal" : "active"}`}
        task={task}
      />

      <p className="agent-bubble-reply">{reply}</p>

      {task.interpretation?.summary && (
        <section className="agent-bubble-section">
          <span className="agent-bubble-section-label">任务摘要</span>
          <p>{task.interpretation.summary}</p>
        </section>
      )}

      {task.compiledPrompt && (
        <section className="agent-bubble-section">
          <span className="agent-bubble-section-label">生成提示词</span>
          <p>{task.compiledPrompt.summary}</p>
          <details className="agent-bubble-details">
            <summary>
              查看 {task.compiledPrompt.outputs.length} 个输出提示词
            </summary>
            <ol>
              {task.compiledPrompt.outputs.map((output) => (
                <li key={output.id}>{output.prompt}</li>
              ))}
            </ol>
          </details>
        </section>
      )}

      {task.executionPlan && (
        <section className="agent-bubble-section">
          <span className="agent-bubble-section-label">执行步骤</span>
          <ol className="agent-step-list">
            {task.executionPlan.steps.map((step) => (
              <li key={step.id} className={`status-${step.status}`}>
                <span className="agent-step-indicator" aria-hidden="true" />
                <span className="agent-step-title">{step.title}</span>
                <span className="agent-step-status">
                  {STEP_STATUS_LABELS[step.status]}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {task.error && (
        <div className="agent-bubble-error" role="alert">
          <strong>执行失败</strong>
          <span>{task.error.message}</span>
        </div>
      )}

      {task.resultNodeIds.length > 0 && (
        <p className="agent-bubble-result">
          已写回画布 · {task.resultNodeIds.length} 个节点
        </p>
      )}

      <div className="agent-bubble-footer">
        <span>
          {task.interpretation?.source === "text-model"
            ? "文字模型理解"
            : task.interpretation
              ? "本地规则理解"
              : "正在准备"}
        </span>
        {!isTerminal && task.status !== "writing-canvas" && (
          <button
            type="button"
            onClick={() => void context?.cancelTask(task.id)}
          >
            <HugeiconsIcon icon={StopIcon} size={13} strokeWidth={1.8} />
            取消
          </button>
        )}
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

function ThreadMessage() {
  const messageId = useMessage((message) => message.id)
  const role = useMessage((message) => message.role)
  const context = useContext(AgentMessageContext)
  const task = context?.tasksByMessageId.get(messageId)

  return (
    <MessagePrimitive.Root className={`agent-message agent-message--${role}`}>
      {role === "assistant" && task ? (
        <AgentTaskBubble task={task} />
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
  onBusyChange,
  onForegroundTaskChange,
}: CanvasAgentShellProps) {
  const [selectedSkillId, setSelectedSkillId] = useState("")
  const [selectedTextModel, setSelectedTextModel] = useState("")
  const [conversationStartedAt, setConversationStartedAt] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const {
    tasks,
    foregroundTask,
    isLoading,
    error,
    submitMessage,
    cancelTask,
    retryTask,
  } = useAgentTasks({
    getCanvasContext,
    selectedSkillId,
    selectedTextModel,
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
          [`${task.id}-assistant`, task] as const,
        ])
      ),
    [visibleTasks]
  )
  const messageContextValue = useMemo<AgentMessageContextValue>(
    () => ({ tasksByMessageId, cancelTask, retryTask }),
    [cancelTask, retryTask, tasksByMessageId]
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
            {foregroundTask && (
              <span>
                {STATUS_LABELS[foregroundTask.status]}
                {queuedBehind > 0 ? ` · ${queuedBehind} 个排队` : ""}
              </span>
            )}
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
            <ThreadPrimitive.ViewportFooter className="canvas-agent-composer-wrap">
              <EdgeBlur
                position="bottom"
                height={68}
                className="canvas-agent-scroll-edge-blur"
              />
              {error && <p className="canvas-agent-error" role="alert">{error}</p>}
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
                    placeholder="输入消息，Enter 发送"
                    rows={3}
                  />
                  <div className="canvas-agent-composer-footer">
                    <div className="canvas-agent-composer-tools">
                      <span className="canvas-agent-context-button" title="自动读取当前画布选区" aria-label="自动读取当前画布选区">
                        <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.7} />
                      </span>
                      <SkillPicker
                        compact
                        value={selectedSkillId}
                        onChange={setSelectedSkillId}
                        modelValue={selectedTextModel}
                        onModelChange={setSelectedTextModel}
                      />
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
