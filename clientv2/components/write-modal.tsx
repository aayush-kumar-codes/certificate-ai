"use client"

import { X } from "lucide-react"
import { useState } from "react"
import { askQuestion } from "@/lib/api"

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  timestamp: number
  showCriteriaOptions?: boolean
}

interface WriteModalProps {
  onClose: () => void
  sessionId?: string
  setSessionId?: (sessionId: string) => void
  setChatMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
  setIsLoadingResponse?: (loading: boolean) => void
}

export default function WriteModal({ 
  onClose, 
  sessionId, 
  setSessionId, 
  setChatMessages,
  setIsLoadingResponse 
}: WriteModalProps) {
  const [criteria, setCriteria] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!criteria.trim() || isSubmitting) return

    const criteriaText = criteria.trim()
    setIsSubmitting(true)
    setIsLoadingResponse?.(true)

    // Add user message to chat immediately
    const userMessage: ChatMessage = { 
      id: `user-${Date.now()}-${Math.random()}`,
      role: 'user', 
      content: criteriaText,
      timestamp: Date.now()
    }
    setChatMessages?.(prev => [...prev, userMessage])

    // Close modal immediately
    onClose()

    // Continue API call in the background
    try {
      console.log('=== Sending criteria via WriteModal ===', { criteria: criteriaText, sessionId })
      
      // Call the API
      const response = await askQuestion(
        criteriaText,
        sessionId || undefined
      )

      console.log('=== Received response in WriteModal ===', { 
        answer: response.answer, 
        sessionId: response.sessionId,
        answerLength: response.answer?.length 
      })

      // Update sessionId if provided
      if (response.sessionId && setSessionId && !sessionId) {
        setSessionId(response.sessionId)
      }

      // Add bot response to chat
      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}-${Math.random()}`,
        role: 'bot',
        content: response.answer || '',
        timestamp: Date.now()
      }

      setChatMessages?.(prev => [...prev, botMessage])
    } catch (error) {
      console.error('=== Error sending criteria ===', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to send criteria'
      const errorBotMessage: ChatMessage = {
        id: `bot-error-${Date.now()}-${Math.random()}`,
        role: 'bot',
        content: `Error: ${errorMessage}`,
        timestamp: Date.now()
      }
      setChatMessages?.(prev => [...prev, errorBotMessage])
    } finally {
      setIsSubmitting(false)
      setIsLoadingResponse?.(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center  bg-black/50 backdrop-blur-sm !p-4">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0a0a0a] !p-6 shadow-xl flex flex-col gap-[20px]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Write Your Criteria</h2>
          <button onClick={onClose} className="rounded-md !p-1 hover:bg-white/10 transition-colors">
            <X className="h-5 w-5 text-white/60 hover:text-white" />
          </button>
        </div>

        <div className="space-y-4 flex flex-col gap-[20px]">
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Enter your evaluation criteria here..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.02] !px-4 !py-3 text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none focus:ring-0 resize-none"
            rows={6}
          />

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] !px-4 !py-2 text-white hover:bg-white/[0.05] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!criteria.trim() || isSubmitting}
              className="flex-1 rounded-lg bg-white px-4 py-2 text-[#0a0a0a] font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
