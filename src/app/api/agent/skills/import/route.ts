import { NextResponse } from "next/server"
import { z } from "zod"

import { isCanvasAgentEnabled } from "../../../../../lib/canvas-agent/feature-flags"
import { InvalidSkillDocumentError } from "../../../../../lib/canvas-agent/skills/parser"
import {
  importSkill,
  registerLocalSkill,
} from "../../../../../lib/canvas-agent/skills/registry"

export const runtime = "nodejs"

const requestSchema = z.object({
  mode: z.enum(["import", "local"]),
  sourcePath: z.string().trim().min(1),
})

export async function POST(request: Request) {
  if (!isCanvasAgentEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const input = requestSchema.parse(await request.json())
    const skill =
      input.mode === "import"
        ? await importSkill(input.sourcePath)
        : await registerLocalSkill(input.sourcePath)

    return NextResponse.json({ skill })
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      error instanceof InvalidSkillDocumentError ||
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Invalid Skill request",
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to register Skill",
      },
      { status: 500 }
    )
  }
}
