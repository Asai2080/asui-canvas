import {
  agentCanvasCommandAcknowledgementSchema,
  agentCanvasCommandBatchSchema,
  type AgentCanvasCommandAcknowledgement,
  type AgentCanvasCommandBatch,
} from "./schema"

type CanvasCommandHandler = (
  batch: AgentCanvasCommandBatch
) =>
  | AgentCanvasCommandAcknowledgement
  | Promise<AgentCanvasCommandAcknowledgement>

export type CanvasCommandBridge = {
  publish: (
    batch: AgentCanvasCommandBatch
  ) => Promise<AgentCanvasCommandAcknowledgement>
  subscribe: (handler: CanvasCommandHandler) => () => void
}

function rejectedAcknowledgement(
  batch: AgentCanvasCommandBatch,
  message: string
): AgentCanvasCommandAcknowledgement {
  return {
    batchId: batch.id,
    taskId: batch.taskId,
    status: "rejected",
    resultNodeIds: [],
    artifactNodeIds: {},
    errors: [{ message }],
  }
}

export function createCanvasCommandBridge(): CanvasCommandBridge {
  const handlers = new Set<CanvasCommandHandler>()
  const inflight = new Map<
    string,
    Promise<AgentCanvasCommandAcknowledgement>
  >()

  return {
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    publish(input) {
      const batch = agentCanvasCommandBatchSchema.parse(input)
      const existing = inflight.get(batch.id)
      if (existing) return existing

      const handler = handlers.values().next().value as
        | CanvasCommandHandler
        | undefined
      const application = handler
        ? Promise.resolve(handler(batch)).then((acknowledgement) =>
            agentCanvasCommandAcknowledgementSchema.parse(acknowledgement)
          )
        : Promise.resolve(
            rejectedAcknowledgement(batch, "当前没有可写入的画布")
          )

      inflight.set(batch.id, application)
      return application
    },
  }
}

export const canvasCommandBridge = createCanvasCommandBridge()
