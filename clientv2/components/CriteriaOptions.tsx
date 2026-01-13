"use client"

import { FileText, Upload, Sparkles } from "lucide-react"
import { useState } from "react"
import WriteModal from "./write-modal"
import UploadModal from "./upload-modal"

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  timestamp: number
  showCriteriaOptions?: boolean
}

interface CriteriaOptionsProps {
  sessionId?: string
  setSessionId?: (sessionId: string) => void
  setChatMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
  setIsLoadingResponse?: (loading: boolean) => void
}

const options = [
  {
    title: "Write up",
    description: "Enter your evaluation criteria to customize the review process.",
    icon: FileText,
    id: "write",
  },
  {
    title: "Upload Attachment",
    description: "Upload a file containing your criteria or specifications.",
    icon: Upload,
    id: "upload",
  },
  {
    title: "AI Criteria Generator",
    description: "Let the AI generate smart, ready-to-use evaluation criteria for you.",
    icon: Sparkles,
    id: "ai",
  },
]

export default function CriteriaOptions({ 
  sessionId, 
  setSessionId, 
  setChatMessages,
  setIsLoadingResponse 
}: CriteriaOptionsProps) {
  const [activeModal, setActiveModal] = useState<string | null>(null)

  const handleOptionClick = (id: string) => {
    setActiveModal(id)
  }

  return (
    <>
      <div className="w-full">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 !mt-[18px]">
            {options.map((item, index) => (
              <div
                key={index}
                onClick={() => handleOptionClick(item.id)}
                className="group flex gap-4 rounded-lg border border-white/10 bg-white/[0.02] !p-[10px] backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[0.05] cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 transition-all duration-300 group-hover:bg-white/10">
                  <item.icon className="h-5 w-5 text-white/80 group-hover:text-white" />
                </div>

                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white leading-tight">{item.title}</h3>
                  <p className="mt-2 text-xs text-white/60 leading-relaxed group-hover:text-white/70 transition-colors duration-300">
                    {item.description}
                  </p>
                </div>

                {/* <div className="mt-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <svg className="h-4 w-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div> */}
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeModal === "write" && (
        <WriteModal 
          onClose={() => setActiveModal(null)} 
          sessionId={sessionId}
          setSessionId={setSessionId}
          setChatMessages={setChatMessages}
          setIsLoadingResponse={setIsLoadingResponse}
        />
      )}
      {activeModal === "upload" && <UploadModal onClose={() => setActiveModal(null)} />}
    </>
  )
}
