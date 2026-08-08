"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiBrain03Icon,
  AiImageIcon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  FolderInputIcon,
  Refresh03Icon,
  Search01Icon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import type {
  DiscoveredSkill,
  SkillRecord,
} from "@/lib/canvas-agent/skills/schema"
import { skillDisplayName } from "@/lib/canvas-agent/skills/identifiers"
import {
  API_CONFIG_CHANGED_EVENT,
  readApiConfigFromSession,
} from "@/lib/canvas/api-config"

type SkillPickerProps = {
  value: string
  selectedSkill?: SkillRecord
  onSkillChange: (skill?: SkillRecord) => void
  modelValue: string
  onModelChange: (model: string) => void
  compact?: boolean
}

type PickerTab = "model" | "skill"

export function SkillPicker({
  value,
  selectedSkill: externalSelectedSkill,
  onSkillChange,
  modelValue,
  onModelChange,
  compact = false,
}: SkillPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredSkill[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState({ left: 12, bottom: 12 })
  const [activeTab, setActiveTab] = useState<PickerTab>("model")
  const [configuredModel, setConfiguredModel] = useState("")
  const [isModelReady, setIsModelReady] = useState(false)
  const [skillQuery, setSkillQuery] = useState("")
  const [sourcePath, setSourcePath] = useState("")
  const [error, setError] = useState("")

  const loadSkills = async () => {
    const response = await fetch("/api/agent/skills", { cache: "no-store" })
    const payload = (await response.json()) as {
      skills?: SkillRecord[]
      discovered?: DiscoveredSkill[]
      error?: string
    }
    if (!response.ok) throw new Error(payload.error ?? "无法读取 Skill")
    setSkills(payload.skills ?? [])
    setDiscovered(payload.discovered ?? [])
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/agent/skills", { cache: "no-store" })
        const payload = (await response.json()) as {
          skills?: SkillRecord[]
          discovered?: DiscoveredSkill[]
          error?: string
        }
        if (!response.ok) throw new Error(payload.error ?? "无法读取 Skill")
        if (active) {
          setSkills(payload.skills ?? [])
          setDiscovered(payload.discovered ?? [])
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "无法读取 Skill")
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const readConfiguredModel = () => {
      const config = readApiConfigFromSession()
      setConfiguredModel(config.textModel.trim())
      setIsModelReady(
        Boolean(
          config.textBaseUrl.trim() &&
            config.textApiKey.trim() &&
            config.textModel.trim()
        )
      )
    }
    readConfiguredModel()
    window.addEventListener(API_CONFIG_CHANGED_EVENT, readConfiguredModel)
    return () =>
      window.removeEventListener(API_CONFIG_CHANGED_EVENT, readConfiguredModel)
  }, [])

  useEffect(() => {
    if (
      modelValue &&
      (!isModelReady || !configuredModel || modelValue !== configuredModel)
    ) {
      onModelChange("")
    }
  }, [configuredModel, isModelReady, modelValue, onModelChange])

  useEffect(() => {
    if (!isOpen) return

    const updatePopoverPosition = () => {
      const trigger = rootRef.current?.getBoundingClientRect()
      if (!trigger) return
      const width = Math.min(324, window.innerWidth - 24)
      setPopoverPosition({
        left: Math.min(Math.max(12, trigger.left), window.innerWidth - width - 12),
        bottom: Math.max(12, window.innerHeight - trigger.top + 10),
      })
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !rootRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }

    updatePopoverPosition()
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", updatePopoverPosition)
    window.addEventListener("scroll", updatePopoverPosition, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", updatePopoverPosition)
      window.removeEventListener("scroll", updatePopoverPosition, true)
    }
  }, [isOpen])

  const registerSkill = async (mode: "import" | "local", path: string) => {
    setError("")
    const response = await fetch("/api/agent/skills/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, sourcePath: path }),
    })
    const payload = (await response.json()) as { skill?: SkillRecord; error?: string }
    if (!response.ok || !payload.skill) {
      throw new Error(payload.error ?? "Skill 导入失败")
    }
    await loadSkills()
    onSkillChange(payload.skill)
    setSourcePath("")
    setIsOpen(false)
  }

  const selected =
    skills.find((skill) => skill.id === value) ??
    (externalSelectedSkill?.id === value ? externalSelectedSkill : undefined)
  const normalizedQuery = skillQuery.trim().toLocaleLowerCase()
  const registeredContentHashes = new Set(
    skills.map((skill) => skill.contentHash)
  )
  const unregisteredDiscovered = discovered.filter(
    (skill) => !registeredContentHashes.has(skill.contentHash)
  )
  const filteredSkills = normalizedQuery
    ? skills.filter((skill) =>
        `${skillDisplayName(skill.name)} ${skill.name} ${skill.description}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : skills
  const filteredDiscovered = normalizedQuery
    ? unregisteredDiscovered.filter((skill) =>
        `${skillDisplayName(skill.name)} ${skill.name} ${skill.path}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : unregisteredDiscovered
  const triggerLabel = selected
    ? skillDisplayName(selected.name)
    : modelValue.trim() || "模型 / Skill"
  const importSkill = () => {
    if (!sourcePath.trim()) return
    void registerSkill("import", sourcePath.trim()).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Skill 导入失败")
    )
  }

  const openModelSettings = () => {
    setIsOpen(false)
    window.dispatchEvent(new Event("asui:open-api-config"))
  }

  return (
    <div ref={rootRef} className={`agent-skill-picker${compact ? " is-compact" : ""}`}>
      <button
        type="button"
        className={`agent-skill-trigger${compact ? " is-compact" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`选择模型与 Skill：${triggerLabel}`}
        title={`选择模型与 Skill：${triggerLabel}`}
      >
        {compact ? (
          <>
            <HugeiconsIcon icon={SparklesIcon} size={15} strokeWidth={1.7} />
            <span>{triggerLabel}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.8} />
          </>
        ) : (
          <>
            <span>{selected ? skillDisplayName(selected.name) : "我的 Skill"}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.7} />
          </>
        )}
      </button>
      {isOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          className="agent-resource-popover"
          role="dialog"
          aria-label="模型与 Skill 选择"
          style={popoverPosition}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="agent-resource-tabs" role="tablist" aria-label="选择类型">
            <button
              type="button"
              role="tab"
              id="agent-resource-model-tab"
              aria-selected={activeTab === "model"}
              aria-controls="agent-resource-model-panel"
              className={activeTab === "model" ? "is-active" : undefined}
              onClick={() => setActiveTab("model")}
            >
              <HugeiconsIcon icon={AiBrain03Icon} size={14} strokeWidth={1.7} />
              模型
            </button>
            <button
              type="button"
              role="tab"
              id="agent-resource-skill-tab"
              aria-selected={activeTab === "skill"}
              aria-controls="agent-resource-skill-panel"
              className={activeTab === "skill" ? "is-active" : undefined}
              onClick={() => setActiveTab("skill")}
            >
              <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.7} />
              Skill
            </button>
          </div>

          {activeTab === "model" ? (
            <div
              id="agent-resource-model-panel"
              className="agent-resource-panel"
              role="tabpanel"
              aria-labelledby="agent-resource-model-tab"
            >
              <div className="agent-resource-heading">
                <strong>思考模型</strong>
                <span>用于理解需求、规划与对话</span>
              </div>
              <button
                type="button"
                className={`agent-resource-option${isModelReady && (!modelValue.trim() || modelValue === configuredModel) ? " is-selected" : ""}`}
                onClick={() => {
                  if (!isModelReady) {
                    openModelSettings()
                    return
                  }
                  onModelChange(configuredModel)
                  setIsOpen(false)
                }}
              >
                <span className="agent-resource-option-icon">
                  <HugeiconsIcon icon={AiBrain03Icon} size={15} strokeWidth={1.7} />
                </span>
                <span className="agent-resource-option-copy">
                  <strong>{isModelReady ? configuredModel : "未配置思考模型"}</strong>
                  <small>
                    {isModelReady
                      ? "Agent 对话与任务理解模型"
                      : "请先在设置中填写 Base URL、API Key 和模型名"}
                  </small>
                </span>
                {isModelReady && (!modelValue.trim() || modelValue === configuredModel) && (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
                )}
              </button>

              <button type="button" className="agent-resource-settings" onClick={openModelSettings}>
                <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.7} />
                前往设置添加或修改模型
              </button>
            </div>
          ) : (
            <div
              id="agent-resource-skill-panel"
              className="agent-resource-panel"
              role="tabpanel"
              aria-labelledby="agent-resource-skill-tab"
            >
              <label className="agent-resource-search">
                <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.7} />
                <input
                  value={skillQuery}
                  onChange={(event) => setSkillQuery(event.target.value)}
                  placeholder="搜索 Skill"
                />
              </label>
              <div className="agent-resource-list">
                <button
                  type="button"
                  className={`agent-resource-option${!value ? " is-selected" : ""}`}
                  onClick={() => {
                    onSkillChange()
                    setIsOpen(false)
                  }}
                >
                  <span className="agent-resource-option-icon">
                    <HugeiconsIcon icon={SparklesIcon} size={15} strokeWidth={1.7} />
                  </span>
                  <span className="agent-resource-option-copy">
                    <strong>不使用 Skill</strong>
                    <small>仅使用 Agent 的默认创作能力</small>
                  </span>
                  {!value && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />}
                </button>
                {filteredSkills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className={`agent-resource-option${skill.id === value ? " is-selected" : ""}`}
                    onClick={() => {
                      onSkillChange(skill)
                      setIsOpen(false)
                    }}
                  >
                    <span className="agent-resource-option-icon">
                      <HugeiconsIcon
                        icon={skill.source.type === "builtin" ? AiImageIcon : SparklesIcon}
                        size={15}
                        strokeWidth={1.7}
                      />
                    </span>
                    <span className="agent-resource-option-copy">
                      <strong>{skillDisplayName(skill.name)}</strong>
                      <small>{skill.description}</small>
                    </span>
                    {skill.id === value && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />}
                  </button>
                ))}
                {filteredDiscovered.map((skill) => (
                  <button
                    key={skill.path}
                    type="button"
                    className="agent-resource-option"
                    onClick={() =>
                      void registerSkill("local", skill.path).catch((reason) =>
                        setError(reason instanceof Error ? reason.message : "Skill 调用失败")
                      )
                    }
                  >
                    <span className="agent-resource-option-icon">
                      <HugeiconsIcon icon={FolderInputIcon} size={15} strokeWidth={1.7} />
                    </span>
                    <span className="agent-resource-option-copy">
                      <strong>{skillDisplayName(skill.name)}</strong>
                      <small>本地 Skill · 点击调用</small>
                    </span>
                  </button>
                ))}
                {filteredSkills.length === 0 && filteredDiscovered.length === 0 && normalizedQuery && (
                  <p className="agent-resource-empty">没有找到匹配的 Skill</p>
                )}
              </div>
              <div className="agent-skill-import">
                <HugeiconsIcon icon={FolderInputIcon} size={15} strokeWidth={1.7} />
                <input
                  value={sourcePath}
                  onChange={(event) => setSourcePath(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      importSkill()
                    }
                  }}
                  placeholder="导入本地 Skill 路径"
                />
                <button type="button" aria-label="导入 Skill" onClick={importSkill} disabled={!sourcePath.trim()}>
                  <HugeiconsIcon icon={Refresh03Icon} size={14} strokeWidth={1.7} />
                </button>
              </div>
              {error && <p className="agent-skill-error" role="alert">{error}</p>}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
