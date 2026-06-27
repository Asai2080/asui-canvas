import {
  getBirefnetServiceStatus,
  startBirefnetService,
  stopBirefnetService,
} from "../../../../lib/cutout/birefnet-service"

export const runtime = "nodejs"

type ServiceActionRequest = {
  action?: "start" | "stop"
}

export async function GET() {
  return Response.json(await getBirefnetServiceStatus())
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ServiceActionRequest

  try {
    if (body.action === "start") {
      return Response.json(await startBirefnetService())
    }

    if (body.action === "stop") {
      return Response.json(await stopBirefnetService())
    }

    return Response.json({ error: "未知的服务操作" }, { status: 400 })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "BiRefNet HR 服务操作失败",
      },
      { status: 500 }
    )
  }
}
