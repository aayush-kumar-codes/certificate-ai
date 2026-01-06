"use client"

import dynamic from "next/dynamic"

const EvalDashboard = dynamic(
  () => import("@/components/eval-dashboard").then((mod) => mod.EvalDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading dashboard…</span>
      </div>
    ),
  },
)

export function EvalDashboardWrapper() {
  return <EvalDashboard />
}

