import { describe, expect, it } from "vitest"

import {
  AGENT_TOOL_NAMES,
  parseAgentToolInput,
  registeredAgentTools,
} from "./registry"

describe("agent tool registry", () => {
  it("exposes only the approved canvas generation tools", () => {
    expect(Object.keys(registeredAgentTools)).toEqual([...AGENT_TOOL_NAMES])
    expect(AGENT_TOOL_NAMES).toEqual([
      "read_canvas_context",
      "compile_generation_prompt",
      "generate_image",
      "edit_image",
      "generate_video",
      "generate_3d_model",
      "get_generation_job",
      "cancel_generation_job",
      "create_canvas_nodes",
      "connect_canvas_nodes",
      "mark_recommended_node",
    ])
  })

  it("rejects unknown tools and unapproved file-system inputs", () => {
    expect(() =>
      parseAgentToolInput("run_shell" as never, { command: "rm -rf /" })
    ).toThrow(/未注册工具/)

    expect(() =>
      parseAgentToolInput("read_canvas_context", {
        snapshotId: "context-1",
        path: "/Users/example/secret",
      })
    ).toThrow()
  })
})
