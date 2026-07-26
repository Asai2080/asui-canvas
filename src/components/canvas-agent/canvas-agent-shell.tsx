"use client"

import { useMemo, useState } from "react"
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowUp01Icon,
  Clock01Icon,
  Image01Icon,
  Loading03Icon,
  Refresh03Icon,
  Robot01Icon,
  Settings01Icon,
  SidebarRight01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { BorderBeam } from "border-beam"

import type { AgentTask } from "@/lib/canvas-agent/task-schema"

import { isAgentTaskTerminal, tasksToThreadMessages } from "./agent-view-model"
import { SkillPicker } from "./skill-picker"
import { type AgentCanvasContext, useAgentTasks } from "./use-agent-tasks"

type CanvasAgentShellProps = {
  open: boolean
  getCanvasContext: () => AgentCanvasContext
  onClose: () => void
  onBusyChange?: (busy: boolean) => void
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

function ThreadMessage() {
  return (
    <MessagePrimitive.Root className="agent-message">
      <MessagePrimitive.If user>
        <span className="agent-message-label">你</span>
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <span className="agent-message-label">Agent</span>
      </MessagePrimitive.If>
      <MessagePrimitive.Parts
        components={{
          Text: () => <MessagePartPrimitive.Text className="agent-message-text" />,
        }}
      />
    </MessagePrimitive.Root>
  )
}

export function CanvasAgentShell({
  open,
  getCanvasContext,
  onClose,
  onBusyChange,
}: CanvasAgentShellProps) {
  const [selectedSkillId, setSelectedSkillId] = useState("")
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
  } = useAgentTasks({ getCanvasContext, selectedSkillId, onBusyChange })
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
  const runtime = useExternalStoreRuntime({
    messages,
    isLoading,
    isRunning: Boolean(foregroundTask),
    onNew: submitMessage,
  })
  const queuedBehind = visibleTasks.filter(
    (task) => task.status === "queued" && task.id !== foregroundTask?.id
  ).length

  const startNewConversation = () => {
    setConversationStartedAt(new Date().toISOString())
    setShowHistory(false)
    setSelectedSkillId("")
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

        <ThreadPrimitive.Root className="canvas-agent-thread">
          <ThreadPrimitive.Viewport className="canvas-agent-viewport">
            <ThreadPrimitive.Empty>
              <div className="canvas-agent-empty">
                <span className="canvas-agent-empty-mark">
                  <HugeiconsIcon icon={Robot01Icon} size={32} strokeWidth={1.65} />
                </span>
                <h3>有什么可以帮你？</h3>
                <p>生成的图片、视频会放到画布上，点击画布内容即可继续引用给我。</p>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages components={{ Message: ThreadMessage }} />
            {visibleTasks.length > 0 && (
              <div className="canvas-agent-task-strip" aria-label="Agent 任务状态">
                {visibleTasks
                  .slice()
                  .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                  .map((task) => (
                    <div key={task.id} className="canvas-agent-task-row">
                      <span className={`canvas-agent-status-dot status-${task.status}`} />
                      <span className="canvas-agent-task-label">{STATUS_LABELS[task.status]}</span>
                      {!isAgentTaskTerminal(task) && task.status !== "writing-canvas" && (
                        <button type="button" onClick={() => void cancelTask(task.id)} aria-label="取消任务">
                          <HugeiconsIcon icon={StopIcon} size={13} strokeWidth={1.8} />
                        </button>
                      )}
                      {task.status === "failed" && task.error?.retryable && (
                        <button type="button" onClick={() => void retryTask(task.id)} aria-label="重试任务">
                          <HugeiconsIcon icon={Refresh03Icon} size={13} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
            <ThreadPrimitive.ViewportFooter className="canvas-agent-composer-wrap">
              {error && <p className="canvas-agent-error" role="alert">{error}</p>}
              <BorderBeam
                size="md"
                colorVariant="colorful"
                strength={0.67}
                borderRadius={30}
                className="canvas-agent-composer-beam"
              >
                <ComposerPrimitive.Root className="canvas-agent-composer">
                  <ComposerPrimitive.Input
                    className="canvas-agent-input"
                    placeholder="输入消息，Enter 发送"
                    rows={3}
                  />
                  <div className="canvas-agent-composer-footer">
                    <div className="canvas-agent-composer-tools">
                      <span className="canvas-agent-context-button" title="自动读取当前画布选区" aria-label="自动读取当前画布选区">
                        <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.7} />
                      </span>
                      <SkillPicker compact value={selectedSkillId} onChange={setSelectedSkillId} />
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
      </aside>
    </AssistantRuntimeProvider>
  )
}
