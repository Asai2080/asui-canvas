import type { ImageVersion } from "./types"

type GeneratePosterInput = {
  prompt: string
  feedback?: string
  parentVersionId?: string
}

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const feedbackCount = (feedback?: string) =>
  feedback
    ? feedback
        .split(/[，,。；;\n]/)
        .map((item) => item.trim())
        .filter(Boolean).length
    : 0

export async function generatePoster({
  prompt,
  feedback,
  parentVersionId,
}: GeneratePosterInput): Promise<ImageVersion> {
  const safePrompt = escapeXml(prompt.trim() || "牛肉拉面品牌海报")
  const count = feedbackCount(feedback)
  const edited = Boolean(feedback)
  const accent = edited ? "#ff7357" : "#e2b15b"
  const surface = edited ? "#fff2dc" : "#e8b879"
  const subtitle = edited ? `已根据 ${count} 条反馈优化` : "浓汤慢熬 · 一口入魂"
  const titleY = edited ? 190 : 150

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
      <defs>
        <radialGradient id="bg" cx="50%" cy="38%" r="78%">
          <stop offset="0%" stop-color="#49301f"/>
          <stop offset="58%" stop-color="#211713"/>
          <stop offset="100%" stop-color="#0c0a09"/>
        </radialGradient>
        <linearGradient id="bowl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#453126"/>
          <stop offset="100%" stop-color="#100d0c"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="28" stdDeviation="22" flood-color="#000" flood-opacity=".55"/>
        </filter>
        <filter id="steam" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10"/>
        </filter>
      </defs>
      <rect width="768" height="1024" rx="42" fill="url(#bg)"/>
      <circle cx="668" cy="118" r="170" fill="${accent}" opacity=".12"/>
      <path d="M80 0h76v360H80z" fill="${accent}" opacity=".92"/>
      <text x="118" y="62" text-anchor="middle" fill="#1b1410" font-size="18" font-weight="800" writing-mode="tb">每日现熬 · 匠心好味</text>
      <text x="208" y="${titleY}" fill="#f8e5b5" font-family="serif" font-size="86" font-weight="900" letter-spacing="5">拉面一番</text>
      <text x="214" y="${titleY + 54}" fill="${accent}" font-size="22" font-weight="700" letter-spacing="8">${escapeXml(subtitle)}</text>
      <text x="214" y="${titleY + 94}" fill="#c8b5a6" font-size="20">${safePrompt}</text>
      <g opacity=".32" filter="url(#steam)" fill="none" stroke="#fff7e8" stroke-width="22" stroke-linecap="round">
        <path d="M330 360c-65-78 56-102 2-190"/>
        <path d="M480 350c-52-70 60-96 15-180"/>
        <path d="M600 390c-40-58 42-86 8-152"/>
      </g>
      <g filter="url(#shadow)">
        <ellipse cx="410" cy="690" rx="300" ry="190" fill="url(#bowl)"/>
        <ellipse cx="410" cy="635" rx="278" ry="160" fill="#15100e" stroke="#8b6448" stroke-width="10"/>
        <ellipse cx="410" cy="628" rx="250" ry="136" fill="${surface}"/>
        <path d="M205 635c80-76 325-98 420 10" fill="none" stroke="#d79b42" stroke-width="16" opacity=".55"/>
        <g fill="none" stroke="#f2c66f" stroke-width="13" stroke-linecap="round" opacity=".95">
          <path d="M315 550c75 60 98 107 15 174"/>
          <path d="M350 540c85 68 103 118 20 198"/>
          <path d="M390 535c82 70 98 130 18 205"/>
          <path d="M430 540c74 66 84 124 5 198"/>
        </g>
        <ellipse cx="530" cy="600" rx="68" ry="48" fill="#f1e0b4" transform="rotate(-14 530 600)"/>
        <ellipse cx="530" cy="600" rx="30" ry="32" fill="#df8f2e" transform="rotate(-14 530 600)"/>
        <path d="M190 605c62-88 152-80 188-4-48 80-142 98-188 4z" fill="#986044"/>
        <path d="M210 600c45-42 104-46 145 2" fill="none" stroke="#c99470" stroke-width="8" opacity=".7"/>
        <path d="M310 690c60-72 133-88 198-44" fill="none" stroke="#4e8f4e" stroke-width="24" stroke-dasharray="8 18"/>
      </g>
      <g stroke="#d8a153" stroke-width="12" stroke-linecap="round">
        <path d="M548 190L375 565"/>
        <path d="M590 208L405 575"/>
      </g>
      <circle cx="640" cy="850" r="66" fill="${accent}"/>
      <text x="640" y="840" text-anchor="middle" fill="#1a120d" font-size="18" font-weight="800">今日限定</text>
      <text x="640" y="875" text-anchor="middle" fill="#1a120d" font-size="27" font-weight="900">¥ 29</text>
      <text x="90" y="940" fill="#f5e9d4" font-size="24" font-weight="800">ASUI CREATIVE LAB</text>
      <text x="90" y="974" fill="#9f8d80" font-size="17" letter-spacing="4">CRAFTED ON AN INFINITE CANVAS</text>
    </svg>
  `

  return {
    versionId: `version-${globalThis.crypto.randomUUID()}`,
    parentVersionId,
    prompt,
    feedback,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: 768,
    height: 1024,
    createdAt: new Date().toISOString(),
  }
}
