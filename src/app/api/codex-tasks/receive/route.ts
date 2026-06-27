import { receiveNextCodexTask } from "../../../../lib/codex-tasks/store"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { receiver?: string }
  const result = await receiveNextCodexTask(body.receiver?.trim() || "codex-local-listener")

  if (!result) {
    return Response.json({ task: null, message: "暂无待接收任务" })
  }

  return Response.json({
    ...result,
    message: "Codex 接收器已接收任务",
  })
}
