"use client"

import * as React from "react"
import { Send, User, Bot, Sparkles, Paperclip } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

const INITIAL_MESSAGES = [
  {
    role: "bot",
    content:
      "Welcome to Certificate Validator AI. I'm an agentic evaluation system ready to help you validate certificates. Upload your PDF certificates using the sidebar, and I'll analyze them based on your requirements.",
    reasoning: "Initializing agent context. Ready to receive certificate uploads and user instructions.",
  },
  {
    role: "user",
    content: "I've uploaded two certificates. Can you tell me what information you've extracted from them?",
  },
  {
    role: "bot",
    content:
      "I've successfully extracted text from both certificates:\n\n1. **ISO_27001_Compliance.pdf** - Contains compliance information including audit dates, security controls, and certification scope.\n\n2. **SOC2_Type_II_2025.pdf** - Includes control objectives, test results, and attestation details.\n\nBoth documents are ready for evaluation. What specific criteria would you like me to validate against?",
    reasoning: "Analyzed uploaded PDFs. Detected key sections and metadata. Awaiting evaluation criteria from user.",
  },
]

export function ChatInterface() {
  const [input, setInput] = React.useState("")
  const [messages, setMessages] = React.useState(INITIAL_MESSAGES)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage = { role: "user" as const, content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")

    // Simulate agent response
    setTimeout(() => {
      const botMessage = {
        role: "bot" as const,
        content:
          "I understand your request. Let me analyze the uploaded certificates against that criteria. I'll need a moment to process the documents and provide a comprehensive evaluation.",
        reasoning: "Processing user query. Cross-referencing certificate content with evaluation requirements.",
      }
      setMessages((prev) => [...prev, botMessage])
    }, 1000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileAttach = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf"
    input.multiple = true
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files) {
        console.log(
          "[v0] Attaching files to chat:",
          Array.from(files).map((f) => f.name),
        )
        // Future: integrate with knowledge panel
      }
    }
    input.click()
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      <ScrollArea className="flex-1 px-6 pt-20" ref={scrollRef}>
        <div className="max-w-2xl mx-auto space-y-8 pb-32">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "bot" && (
                <div className="size-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                  <Bot className="size-4" />
                </div>
              )}
              <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : ""}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                  }`}
                >
                  {msg.content}
                </div>
                {"reasoning" in msg && msg.reasoning && (
                  <div className="flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground font-mono">
                    <Sparkles className="size-3" />
                    <span>Agent Reflection: {msg.reasoning}</span>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                  <User className="size-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-primary/5 rounded-2xl blur opacity-30 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative rounded-2xl border border-border bg-card shadow-2xl p-1 transition-all group-focus-within:border-primary/50">
              <div className="flex items-end gap-2 p-2">
                <button
                  onClick={handleFileAttach}
                  className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors"
                >
                  <Paperclip className="size-4" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me to validate certificates, explain findings, or adjust criteria..."
                  className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 px-1 text-sm max-h-32 min-h-[40px] outline-none"
                  rows={1}
                />
                <button
                  onClick={handleSend}
                  className="p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
                  disabled={!input.trim()}
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-3">
            Certificate Validator AI uses agentic reasoning to validate and evaluate your documents.
          </p>
        </div>
      </div>
    </div>
  )
}
