"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  FolderInputIcon,
  Refresh03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import type {
  DiscoveredSkill,
  SkillRecord,
} from "@/lib/canvas-agent/skills/schema"

type SkillPickerProps = {
  value: string
  onChange: (skillId: string) => void
  compact?: boolean
}

export function SkillPicker({ value, onChange, compact = false }: SkillPickerProps) {
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredSkill[]>([])
  const [isOpen, setIsOpen] = useState(false)
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
    onChange(payload.skill.id)
    setSourcePath("")
    setIsOpen(false)
  }

  const selected = skills.find((skill) => skill.id === value)
  const importSkill = () => {
    if (!sourcePath.trim()) return
    void registerSkill("import", sourcePath.trim()).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Skill 导入失败")
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={`agent-skill-trigger${compact ? " is-compact" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={selected ? `我的 Skill：${selected.name}` : "我的 Skill"}
        title={selected ? `我的 Skill：${selected.name}` : "我的 Skill"}
      >
        {compact ? (
          <HugeiconsIcon icon={SparklesIcon} size={18} strokeWidth={1.7} />
        ) : (
          <>
            <span>{selected?.name ?? "我的 Skill"}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.7} />
          </>
        )}
      </button>
      {isOpen && (
        <div className="agent-skill-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { onChange(""); setIsOpen(false) }}>
            不使用 Skill
          </button>
          {skills.map((skill) => (
            <button key={skill.id} type="button" role="menuitem" onClick={() => { onChange(skill.id); setIsOpen(false) }}>
              <span>{skill.name}</span>
              <small>{skill.description}</small>
            </button>
          ))}
          {discovered.map((skill) => (
            <button key={skill.path} type="button" role="menuitem" onClick={() => void registerSkill("local", skill.path).catch((reason) => setError(reason.message))}>
              <span>{skill.name}</span>
              <small>本地 Skill · 点击调用</small>
            </button>
          ))}
          <div className="agent-skill-import">
            <HugeiconsIcon icon={FolderInputIcon} size={16} strokeWidth={1.7} />
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
            <button type="button" aria-label="导入 Skill" onClick={importSkill}>
              <HugeiconsIcon icon={Refresh03Icon} size={14} strokeWidth={1.7} />
            </button>
          </div>
          {error && <p className="agent-skill-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
