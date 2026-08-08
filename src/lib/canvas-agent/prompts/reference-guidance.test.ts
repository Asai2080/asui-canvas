import { describe, expect, it } from "vitest"

import type { CanvasContextSnapshot } from "../context/schema"
import { buildReferenceImageGuidance } from "./reference-guidance"

const context: CanvasContextSnapshot = {
  id: "context-references",
  createdAt: "2026-08-06T00:00:00.000Z",
  scope: "selection",
  selectedNodeId: "primary",
  selectedNodeIds: ["primary", "support"],
  sourceNode: {
    id: "primary",
    kind: "image",
    bounds: { x: 0, y: 0, w: 750, h: 1624 },
    referenceIds: [],
    media: {
      referenceType: "url",
      mediaType: "image",
      src: "https://example.test/primary.png",
    },
  },
  annotations: [],
  connectedNodes: [],
  references: [
    {
      id: "support",
      kind: "image",
      bounds: { x: 800, y: 0, w: 750, h: 1624 },
      referenceIds: [],
      media: {
        referenceType: "url",
        mediaType: "image",
        src: "https://example.test/support.png",
      },
    },
  ],
}

describe("reference image guidance", () => {
  it("assigns deterministic primary and supporting roles", () => {
    const guidance = buildReferenceImageGuidance("general", context).join("\n")
    expect(guidance).toContain("本次共有 2 张明确选中的参考图")
    expect(guidance).toContain("参考图 1 是当前画布中主动选中的主参考")
    expect(guidance).toContain("不得读取未选中的画布")
  })

  it("keeps UI, product, and photography reference semantics isolated", () => {
    const ui = buildReferenceImageGuidance("ui-interface", context).join("\n")
    const product = buildReferenceImageGuidance("product", context).join("\n")
    const photography = buildReferenceImageGuidance("photography", context).join("\n")

    expect(ui).toContain("信息架构")
    expect(ui).toContain("不要照抄参考图中的品牌名")
    expect(ui).toContain("不继承它的绝对坐标、贴边位置、裁切或溢出")
    expect(ui).toContain("外边距、区块间距、组件间距与内部留白")
    expect(ui).toContain("按当前空间 token")
    expect(ui).toContain("参考图颜色只作为可识别性观察")
    expect(ui).not.toContain("包装比例")
    expect(product).toContain("包装比例")
    expect(product).not.toContain("字体层级、组件几何")
    expect(photography).toContain("机位、焦段感、光源和色调")
    expect(photography).not.toContain("信息密度")
  })
})
