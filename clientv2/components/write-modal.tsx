"use client"

import { X } from "lucide-react"
import { useState } from "react"

interface WriteModalProps {
  onClose: () => void
}

export default function WriteModal({ onClose }: WriteModalProps) {
  const [criteria, setCriteria] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!criteria.trim()) return

    setIsSubmitting(true)
    // Mock API call - replace with actual API later
    console.log("Submitting criteria:", criteria)

    setTimeout(() => {
      setIsSubmitting(false)
      onClose()
    }, 1000)
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
