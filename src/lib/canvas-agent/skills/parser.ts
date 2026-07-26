import { parse as parseYaml } from "yaml"

import {
  parsedSkillDocumentSchema,
  type ParsedSkillDocument,
  type SkillRisk,
} from "./schema"

export class InvalidSkillDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidSkillDocumentError"
  }
}

const RISK_RULES: ReadonlyArray<{
  risk: SkillRisk
  patterns: RegExp[]
}> = [
  {
    risk: "shell",
    patterns: [
      /```(?:bash|sh|zsh|shell)\b/i,
      /\b(?:bash|zsh|sh)\s+-c\b/i,
      /\b(?:exec|spawn|child_process)\b/i,
    ],
  },
  {
    risk: "network",
    patterns: [
      /\bhttps?:\/\//i,
      /\b(?:curl|wget)\b/i,
      /\bfetch\s*\(/i,
      /\baxios\b/i,
    ],
  },
  {
    risk: "secret-read",
    patterns: [
      /(?:^|[/\s])\.env(?:[.\s/]|$)/i,
      /\b(?:api[_-]?key|secret|token|keychain|process\.env)\b/i,
    ],
  },
  {
    risk: "arbitrary-write",
    patterns: [
      /\brm\s+(?:-[a-z]*r[a-z]*f?|-[a-z]*f[a-z]*r?)\b/i,
      /\b(?:writeFile|appendFile|apply_patch)\b/i,
      /(?:^|\s)(?:cat|printf|echo)\b[^\n]*>{1,2}/im,
      /写入(?:任意)?文件/,
    ],
  },
]

function readFrontMatter(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n")
  if (!normalized.startsWith("---\n")) {
    throw new InvalidSkillDocumentError("SKILL.md must start with YAML front matter")
  }

  const closingIndex = normalized.indexOf("\n---\n", 4)
  if (closingIndex === -1) {
    throw new InvalidSkillDocumentError("SKILL.md front matter is not closed")
  }

  const metadataSource = normalized.slice(4, closingIndex)
  const instructions = normalized.slice(closingIndex + 5).trim()

  if (!instructions) {
    throw new InvalidSkillDocumentError("SKILL.md instructions cannot be empty")
  }

  let metadata: unknown
  try {
    metadata = parseYaml(metadataSource)
  } catch (error) {
    throw new InvalidSkillDocumentError(
      `SKILL.md front matter is invalid: ${
        error instanceof Error ? error.message : "unknown YAML error"
      }`
    )
  }

  return { metadata, instructions, normalized }
}

function detectRisks(source: string): SkillRisk[] {
  return RISK_RULES.filter(({ patterns }) =>
    patterns.some((pattern) => pattern.test(source))
  ).map(({ risk }) => risk)
}

export function parseSkillDocument(source: string): ParsedSkillDocument {
  const { metadata, instructions, normalized } = readFrontMatter(source)

  const result = parsedSkillDocumentSchema.safeParse({
    ...(typeof metadata === "object" && metadata !== null ? metadata : {}),
    instructions,
    risks: detectRisks(normalized),
  })

  if (!result.success) {
    throw new InvalidSkillDocumentError(
      `SKILL.md metadata is invalid: ${result.error.issues
        .map((issue) => issue.message)
        .join("; ")}`
    )
  }

  return result.data
}
