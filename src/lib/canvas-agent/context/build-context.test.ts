import { describe, expect, it } from "vitest"

import { buildCanvasContextSnapshot } from "./build-context"

const SOURCE_NODE = {
  id: "image-1",
  kind: "image" as const,
  bounds: { x: 100, y: 80, w: 600, h: 800 },
  versionId: "version-1",
  media: {
    mediaType: "image" as const,
    src: "/canvas-assets/source.png",
    mimeType: "image/png",
    width: 600,
    height: 800,
  },
}

describe("buildCanvasContextSnapshot", () => {
  it("collects every annotation owned by the selected image", () => {
    const snapshot = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: SOURCE_NODE.id,
        nodes: [
          SOURCE_NODE,
          {
            id: "annotation-selected",
            kind: "annotation",
            sourceNodeId: SOURCE_NODE.id,
            text: "把标题改成阿水画布",
            bounds: { x: 150, y: 120, w: 240, h: 90 },
          },
          {
            id: "annotation-not-selected",
            kind: "annotation",
            sourceNodeId: SOURCE_NODE.id,
            text: "底部年份改成 2027",
            bounds: { x: 190, y: 720, w: 220, h: 70 },
          },
          {
            id: "annotation-other-image",
            kind: "annotation",
            sourceNodeId: "image-2",
            text: "不应该进入快照",
            bounds: { x: 900, y: 120, w: 180, h: 80 },
          },
        ],
      },
      {
        snapshotId: "snapshot-all-annotations",
        createdAt: "2026-07-25T08:00:00.000Z",
      }
    )

    expect(snapshot.sourceNode?.id).toBe(SOURCE_NODE.id)
    expect(snapshot.annotations.map((annotation) => annotation.id)).toEqual([
      "annotation-selected",
      "annotation-not-selected",
    ])
    expect(snapshot.annotations.map((annotation) => annotation.text)).toEqual([
      "把标题改成阿水画布",
      "底部年份改成 2027",
    ])
  })

  it("includes only one-hop related nodes unless whole-canvas scope is explicit", () => {
    const nodes = [
      SOURCE_NODE,
      {
        id: "video-downstream",
        kind: "video" as const,
        sourceNodeId: SOURCE_NODE.id,
        bounds: { x: 760, y: 80, w: 600, h: 800 },
        media: {
          mediaType: "video" as const,
          src: "https://cdn.example.com/result.mp4",
        },
      },
      {
        id: "image-upstream",
        kind: "image" as const,
        bounds: { x: -560, y: 80, w: 600, h: 800 },
        media: {
          mediaType: "image" as const,
          src: "/canvas-assets/upstream.png",
        },
      },
      {
        id: "unrelated-image",
        kind: "image" as const,
        bounds: { x: 1800, y: 80, w: 600, h: 800 },
        media: {
          mediaType: "image" as const,
          src: "/canvas-assets/unrelated.png",
        },
      },
    ]

    const selectionSnapshot = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: SOURCE_NODE.id,
        nodes,
      },
      {
        snapshotId: "snapshot-selection",
        createdAt: "2026-07-25T08:00:00.000Z",
      }
    )
    const wholeCanvasSnapshot = buildCanvasContextSnapshot(
      {
        scope: "whole-canvas",
        selectedNodeId: SOURCE_NODE.id,
        nodes,
      },
      {
        snapshotId: "snapshot-whole-canvas",
        createdAt: "2026-07-25T08:00:00.000Z",
      }
    )

    expect(selectionSnapshot.connectedNodes.map((node) => node.id)).toEqual([
      "video-downstream",
    ])
    expect(selectionSnapshot.canvasNodes).toBeUndefined()
    expect(wholeCanvasSnapshot.canvasNodes?.map((node) => node.id)).toEqual([
      "image-1",
      "video-downstream",
      "image-upstream",
      "unrelated-image",
    ])
  })

  it("treats the selected image and its holder as one-hop context", () => {
    const snapshot = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: SOURCE_NODE.id,
        nodes: [
          {
            ...SOURCE_NODE,
            parentNodeId: "holder-1",
          },
          {
            id: "holder-1",
            kind: "holder",
            bounds: { x: 80, y: 60, w: 640, h: 840 },
          },
        ],
      },
      {
        snapshotId: "snapshot-holder-parent",
        createdAt: "2026-07-25T08:00:00.000Z",
      }
    )

    expect(snapshot.connectedNodes.map((node) => node.id)).toEqual(["holder-1"])
  })

  it("never embeds inline image bytes in the snapshot", () => {
    const snapshot = buildCanvasContextSnapshot(
      {
        scope: "selection",
        selectedNodeId: SOURCE_NODE.id,
        nodes: [
          {
            ...SOURCE_NODE,
            media: {
              ...SOURCE_NODE.media,
              src: "data:image/png;base64,AA==",
            },
          },
        ],
      },
      {
        snapshotId: "snapshot-no-inline",
        createdAt: "2026-07-25T08:00:00.000Z",
      }
    )

    expect(snapshot.sourceNode?.media).toMatchObject({
      referenceType: "inline-omitted",
      mimeType: "image/png",
    })
    expect(JSON.stringify(snapshot)).not.toContain("base64")
  })
})
