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
  ArrowUp01Icon,
  Clock01Icon,
  Image01Icon,
  Loading03Icon,
  MultiplicationSignIcon,
  Refresh03Icon,
  Settings01Icon,
  SidebarRight01Icon,
  StopIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { BorderBeam } from "border-beam"

import { EdgeBlur } from "@/components/ui/edge-blur"
import type { AgentTask } from "@/lib/canvas-agent/task-schema"

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

type AgentMessageContextValue = {
  tasksByMessageId: ReadonlyMap<string, AgentTask>
  retryTask: (taskId: string) => Promise<void>
}

const AgentMessageContext = createContext<AgentMessageContextValue | null>(null)

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

function AgentTaskBubble({ task }: { task: AgentTask }) {
  const context = useContext(AgentMessageContext)
  if (!isAgentTaskTerminal(task)) return null
  const resultText = getAgentTaskResultText(task)
  const showCapabilityIntroduction = isAgentCapabilityIntroduction(task)

  return (
    <div className={`agent-bubble agent-bubble--assistant agent-bubble--result status-${task.status}`}>
      {showCapabilityIntroduction ? (
        <div className="agent-capability-intro">
          <div className="agent-capability-intro__heading">
            <strong>有什么我可以帮你的？</strong>
            <span>从图片或视频创作开始</span>
          </div>
          <div className="agent-capability-intro__list">
            <div className="agent-capability-intro__item">
              <span className="agent-capability-intro__icon">
                <HugeiconsIcon icon={Image01Icon} size={15} strokeWidth={1.7} />
              </span>
              <span>
                <strong>生成图片</strong>
                <small>海报、主视觉、插画与图片编辑</small>
              </span>
            </div>
            <div className="agent-capability-intro__item">
              <span className="agent-capability-intro__icon">
                <HugeiconsIcon icon={Video01Icon} size={15} strokeWidth={1.7} />
              </span>
              <span>
                <strong>生成视频</strong>
                <small>图生视频、广告短片与动态版本</small>
              </span>
            </div>
          </div>
          <p className="agent-capability-intro__footer">告诉我你的需求，我会继续帮你完成。</p>
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
          [`${task.id}-assistant`, task] as const,
        ])
      ),
    [visibleTasks]
  )
  const messageContextValue = useMemo<AgentMessageContextValue>(
    () => ({ tasksByMessageId, retryTask }),
    [retryTask, tasksByMessageId]
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
