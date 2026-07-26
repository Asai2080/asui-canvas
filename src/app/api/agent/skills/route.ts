import { NextResponse } from "next/server"

import { isCanvasAgentEnabled } from "../../../../lib/canvas-agent/feature-flags"
import {
  discoverLocalSkills,
  listRegisteredSkills,
} from "../../../../lib/canvas-agent/skills/registry"

export const runtime = "nodejs"

export async function GET() {
  if (!isCanvasAgentEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const [skills, discovered] = await Promise.all([
      listRegisteredSkills(),
      discoverLocalSkills(),
    ])
    return NextResponse.json({ skills, discovered })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list Skills",
      },
      { status: 500 }
    )
  }
}
