import { EvalDashboard } from "@/components/eval-dashboard"

export default function Page() {
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        {/* <CHANGE> Updated branding to Certificate Validator AI */}
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-primary" />
          <span className="text-sm font-semibold tracking-tight">Certificate Validator AI</span>
          <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground uppercase">
            Agentic Core v2.0
          </span>
        </div>
        {/* <CHANGE> Removed Share Session button, kept only Agent Active indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Agent Active</span>
        </div>
      </header>
      <EvalDashboard />
    </main>
  )
}
