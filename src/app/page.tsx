"use client"

import dynamic from "next/dynamic"

const AiCanvas = dynamic(
  () => import("@/components/canvas/ai-canvas").then((module) => module.AiCanvas),
  {
    ssr: false,
    loading: () => (
      <main className="flex min-h-screen items-center justify-center bg-muted text-sm text-muted-foreground">
        正在准备无限画布…
      </main>
    ),
  }
)

export default function Home() {
  return <AiCanvas />
}
