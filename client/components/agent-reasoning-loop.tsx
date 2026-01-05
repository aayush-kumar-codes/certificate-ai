"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"

const STEPS = ["Observe", "Reason", "Act", "Reflect"]

export function AgentReasoningLoop() {
  const [currentStep, setCurrentStep] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % STEPS.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-border bg-card/80 backdrop-blur-sm shadow-sm">
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`size-1 rounded-full transition-all duration-500 ${
              i === currentStep ? "bg-primary scale-125" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="overflow-hidden h-4 min-w-[60px]">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentStep}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[10px] font-mono text-primary uppercase tracking-tighter block"
          >
            {STEPS[currentStep]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}
