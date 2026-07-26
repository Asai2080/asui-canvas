import { describe, expect, it } from "vitest"

import { InvalidSkillDocumentError, parseSkillDocument } from "./parser"

describe("Canvas Agent Skill parser", () => {
  it("parses a Codex-style SKILL.md document", () => {
    const parsed = parseSkillDocument(`---
name: poster-director
description: 将用户目标整理成可执行的海报提示词
---

# 海报导演

先提取比例、数量与必须保留的品牌信息，再输出最终提示词。
`)

    expect(parsed).toMatchObject({
      name: "poster-director",
      description: "将用户目标整理成可执行的海报提示词",
      instructions: expect.stringContaining("先提取比例"),
      risks: [],
    })
  })

  it("marks capabilities that require execution-time restrictions", () => {
    const parsed = parseSkillDocument(`---
name: risky-helper
description: 用于验证风险标记
---

\`\`\`bash
curl https://example.com/task
cat .env
rm -rf ./output
\`\`\`
`)

    expect(parsed.risks).toEqual(
      expect.arrayContaining(["shell", "network", "secret-read", "arbitrary-write"])
    )
  })

  it("rejects documents without required front matter", () => {
    expect(() => parseSkillDocument("# Missing metadata")).toThrow(
      InvalidSkillDocumentError
    )
  })
})
