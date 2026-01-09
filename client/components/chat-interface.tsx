"use client"

import * as React from "react"
import { Send, User, Bot, Paperclip, Loader2, ThumbsUp, ThumbsDown } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useChatStore, type ChatMessage, type ChatStore } from "@/lib/store"
import { askQuestion, submitFeedback } from "@/lib/api"

export function ChatInterface() {
  const [input, setInput] = React.useState("")
  const messages = useChatStore((state: ChatStore) => state.messages)
  const isLoading = useChatStore((state: ChatStore) => state.isLoading)
  const loadingMessage = useChatStore((state: ChatStore) => state.loadingMessage)
  const showSimpleLoader = useChatStore((state: ChatStore) => state.showSimpleLoader)
  const addMessage = useChatStore((state: ChatStore) => state.addMessage)
  const updateLastMessage = useChatStore((state: ChatStore) => state.updateLastMessage)
  const setLoading = useChatStore((state: ChatStore) => state.setLoading)
  const sessionId = useChatStore((state: ChatStore) => state.sessionId)
  const setSessionId = useChatStore((state: ChatStore) => state.setSessionId)
  const clearMessages = useChatStore((state: ChatStore) => state.clearMessages)
  const feedbackSubmitted = useChatStore((state: ChatStore) => state.feedbackSubmitted)
  const feedbackType = useChatStore((state: ChatStore) => state.feedbackType)
  const setFeedback = useChatStore((state: ChatStore) => state.setFeedback)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const viewportRef = React.useRef<HTMLElement | null>(null)

  // Clear conversation on page load/refresh
  React.useEffect(() => {
    clearMessages()
    console.log("🔄 Page refreshed - conversation cleared")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Find and store viewport reference when component mounts or scrollRef changes
  React.useEffect(() => {
    const findViewport = () => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
        if (viewport) {
          viewportRef.current = viewport
          return true
        }
      }
      return false
    }

    // Try immediately
    if (!findViewport()) {
      // If not found, try again after a short delay (viewport might not be rendered yet)
      const timeoutId = setTimeout(() => {
        findViewport()
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [])

  // Auto-scroll when messages, loading state, or loading message changes
  React.useEffect(() => {
    const scrollToBottom = () => {
      // Try to use stored viewport ref first
      const viewport = viewportRef.current || scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
      
      if (viewport) {
        // Update stored ref if we found it
        if (!viewportRef.current) {
          viewportRef.current = viewport
        }
        // Scroll to bottom - use 'auto' for instant scroll
        viewport.scrollTop = viewport.scrollHeight
      }
      
      // Also try scrollIntoView as backup
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
      }
    }

    // Use multiple timeouts to ensure DOM has fully updated
    const timeoutId1 = setTimeout(() => {
      requestAnimationFrame(() => {
        scrollToBottom()
      })
    }, 0)

    // Try again after a short delay to catch any async updates
    const timeoutId2 = setTimeout(() => {
      scrollToBottom()
    }, 100)

    // If loading, set up an interval to continuously scroll during streaming
    let intervalId: NodeJS.Timeout | null = null
    if (isLoading) {
      intervalId = setInterval(() => {
        scrollToBottom()
      }, 200) // Scroll every 200ms during loading
    }

    return () => {
      clearTimeout(timeoutId1)
      clearTimeout(timeoutId2)
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [messages, isLoading, loadingMessage])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = { role: "user" as const, content: input }
    addMessage(userMessage)
    const question = input
    setInput("")

    try {
      // Use simple loader for follow-up questions
      setLoading(true, "", true)

      // Log session info for debugging
      console.log("=== Frontend: Sending Question ===");
      console.log("🔗 Using Session Mode (MemorySession):");
      console.log("  - SessionId:", sessionId || "none (will be created)");
      console.log("  - Frontend messages in store:", messages.length);
      console.log("  - ℹ️ Chat history is stored in MemorySession on server");

      let accumulatedText = ""
      let botMessageCreated = false

      const response = await askQuestion(
        question,
        sessionId || null,
        (message) => {
          // Keep simple loader for follow-up questions
          setLoading(true, "", true)
        },
        {
          onChunk: (chunk: string) => {
            // Create bot message on first chunk if not already created
            if (!botMessageCreated) {
              accumulatedText = chunk
              addMessage({
                role: "bot",
                content: accumulatedText,
              })
              botMessageCreated = true
              setLoading(false) // Hide loading indicator once we have content
            } else {
              // Update message content as chunks arrive
              accumulatedText += chunk
              updateLastMessage({
                content: accumulatedText,
              })
            }
          },
          onComplete: (metadata) => {
            console.log("=== Frontend: Streaming Complete ===");
            console.log("  - SessionId:", metadata.sessionId);
            console.log("  - Memory Active:", metadata.memoryActive ? "✅ YES" : "❌ NO");
            console.log("  - Is New Session:", metadata.isNewSession ? "🆕 YES" : "📚 NO (using existing memory)");

            // Update sessionId if returned
            if (metadata.sessionId) {
              setSessionId(metadata.sessionId)
            }

            // Ensure message is finalized
            if (!botMessageCreated) {
              // If no chunks were received, create message with empty content or error
              if (accumulatedText) {
                addMessage({
                  role: "bot",
                  content: accumulatedText,
                })
              } else {
                // No content received - this shouldn't happen, but handle gracefully
                addMessage({
                  role: "bot",
                  content: "No response received.",
                })
              }
            } else {
              // Update existing message with final content
              updateLastMessage({
                content: accumulatedText,
              })
            }

            // Reset feedback state for new conversation turn
            setFeedback(null)
            setLoading(false)
          },
          onError: (error: string) => {
            console.error("Streaming error:", error)
            // Create error message if bot message wasn't created yet
            if (!botMessageCreated) {
              addMessage({
                role: "bot",
                content: `Error: ${error}`,
              })
            } else {
              updateLastMessage({
                content: `Error: ${error}`,
              })
            }
            setLoading(false)
          },
        }
      )

      // Handle non-streaming responses (fallback cases like upload prompts)
      if (response.answer && !botMessageCreated) {
        console.log("=== Frontend: Received Non-Streaming Response ===");
        console.log("  - SessionId:", response.sessionId);
        console.log("  - Status:", response.status);
        console.log("  - Memory Active:", response.memoryActive ? "✅ YES" : "❌ NO");
        console.log("  - Is New Session:", response.isNewSession ? "🆕 YES" : "📚 NO (using existing memory)");

        // Update sessionId if returned
        if (response.sessionId) {
          setSessionId(response.sessionId)
        }

        // Create the bot message with the complete response
        addMessage({
          role: "bot",
          content: response.answer,
          reasoning: response.validationResult
            ? `Validation ${response.validationResult.passed ? "passed" : "failed"}. ${response.validationResult.checks.length} criteria checked.`
            : undefined,
        })

        // Reset feedback state for new conversation turn
        setFeedback(null)
        setLoading(false)
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get response"
      updateLastMessage({
        content: `Error: ${errorMessage}`,
        reasoning: undefined,
      })
      setLoading(false)
    }
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
    input.accept = ".pdf,image/*"
    input.multiple = false
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        // Redirect to knowledge panel for upload
        // The knowledge panel handles the upload flow
        console.log("Please use the knowledge panel to upload certificates")
      }
    }
    input.click()
  }

  const handleFeedback = async (type: "LIKE" | "DISLIKE") => {
    if (!sessionId || feedbackSubmitted) return

    try {
      await submitFeedback(sessionId, type)
      setFeedback(type)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit feedback"
      console.error("Feedback submission error:", errorMessage)
      // Optionally show error toast/notification to user
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-6 pt-20">
        <div className="max-w-2xl mx-auto space-y-8 pb-40">
          {messages.map((msg: ChatMessage, i: number) => {
            const isLastBotMessage = msg.role === "bot" && i === messages.length - 1 && !isLoading
            return (
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
                  {isLastBotMessage && (
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        variant={feedbackType === "LIKE" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => handleFeedback("LIKE")}
                        disabled={feedbackSubmitted}
                        className={`h-8 px-3 text-xs ${
                          feedbackType === "LIKE"
                            ? "bg-green-500 hover:bg-green-600 text-white"
                            : "hover:bg-green-50 dark:hover:bg-green-950"
                        }`}
                      >
                        <ThumbsUp className="size-3 mr-1" />
                        Like
                      </Button>
                      <Button
                        variant={feedbackType === "DISLIKE" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => handleFeedback("DISLIKE")}
                        disabled={feedbackSubmitted}
                        className={`h-8 px-3 text-xs ${
                          feedbackType === "DISLIKE"
                            ? "bg-red-500 hover:bg-red-600 text-white"
                            : "hover:bg-red-50 dark:hover:bg-red-950"
                        }`}
                      >
                        <ThumbsDown className="size-3 mr-1" />
                        Dislike
                      </Button>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            )
          })}
          {isLoading && (
            <div className="flex gap-4">
              <div className="size-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                <Bot className="size-4" />
              </div>
              <div className="flex flex-col gap-2 max-w-[85%]">
                {showSimpleLoader ? (
                  // Simple loader for follow-up questions
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-card border border-border flex items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-primary" />
                  </div>
                ) : (
                  // Mixed text loader for PDF upload evaluation
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-card border border-border flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span>{loadingMessage || "Processing..."}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent pointer-events-none z-10">
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
                  disabled={!input.trim() || isLoading}
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
