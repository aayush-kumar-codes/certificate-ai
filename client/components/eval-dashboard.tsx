"use client"
import { ChatInterface } from "./chat-interface"
import { KnowledgePanel } from "./knowledge-panel"
import { AgentReasoningLoop } from "./agent-reasoning-loop"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"

export function EvalDashboard() {
  return (
    <div className="flex-1 flex overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-card/30">
          <KnowledgePanel />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border/50" />

        <ResizablePanel defaultSize={75}>
          <div className="flex flex-col h-full relative">
            <div className="absolute top-4 right-6 z-10">
              <AgentReasoningLoop />
            </div>
            <ChatInterface />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
