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
  AiChat01Icon,
  Cancel01Icon,
  Loading03Icon,
  Refresh03Icon,
  SearchVisualIcon,
  SentIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"

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
  const {
    tasks,
    foregroundTask,
    isLoading,
    error,
    submitMessage,
    cancelTask,
    retryTask,
  } = useAgentTasks({ getCanvasContext, selectedSkillId, onBusyChange })
  const messages = useMemo(() => tasksToThreadMessages(tasks), [tasks])
  const runtime = useExternalStoreRuntime({
    messages,
    isLoading,
    isRunning: Boolean(foregroundTask),
    onNew: submitMessage,
  })
  const queuedBehind = tasks.filter(
    (task) => task.status === "queued" && task.id !== foregroundTask?.id
  ).length

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
          <div className="canvas-agent-title">
            <span className="canvas-agent-mark">
              <HugeiconsIcon icon={AiChat01Icon} size={17} strokeWidth={1.7} />
            </span>
            <div>
              <h2>画布 Agent</h2>
              <p>{foregroundTask ? STATUS_LABELS[foregroundTask.status] : "待命"}{queuedBehind > 0 ? ` · ${queuedBehind} 个排队` : ""}</p>
            </div>
          </div>
          <button type="button" className="canvas-agent-icon-button" onClick={onClose} aria-label="关闭画布 Agent">
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.7} />
          </button>
        </header>

        <ThreadPrimitive.Root className="canvas-agent-thread">
          <ThreadPrimitive.Viewport className="canvas-agent-viewport">
            <ThreadPrimitive.Empty>
              <div className="canvas-agent-empty">
                <span className="canvas-agent-empty-mark">
                  <HugeiconsIcon icon={AiChat01Icon} size={22} strokeWidth={1.6} />
                </span>
                <span>多步生成与画布编排</span>
                <p>描述目标，Agent 会整理提示词、执行步骤并把结果写回当前画布。</p>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages components={{ Message: ThreadMessage }} />
            {tasks.length > 0 && (
              <div className="canvas-agent-task-strip" aria-label="Agent 任务状态">
                {tasks
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
              <ComposerPrimitive.Root className="canvas-agent-composer">
                <ComposerPrimitive.Input
                  className="canvas-agent-input"
                  placeholder="描述一个多步画布任务…"
                  rows={3}
                />
                <div className="canvas-agent-composer-footer">
                  <div className="flex min-w-0 items-center gap-2">
                    <SkillPicker value={selectedSkillId} onChange={setSelectedSkillId} />
                    <span className="canvas-agent-context-label">
                      <HugeiconsIcon icon={SearchVisualIcon} size={13} strokeWidth={1.7} />
                      当前画布
                    </span>
                    <span className="canvas-agent-auto-label">自动执行</span>
                  </div>
                  <ComposerPrimitive.Send className="canvas-agent-send" aria-label="发送给画布 Agent">
                    <HugeiconsIcon
                      icon={foregroundTask ? Loading03Icon : SentIcon}
                      size={17}
                      strokeWidth={1.8}
                      className={foregroundTask ? "animate-spin" : undefined}
                    />
                  </ComposerPrimitive.Send>
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </aside>
    </AssistantRuntimeProvider>
  )
}
