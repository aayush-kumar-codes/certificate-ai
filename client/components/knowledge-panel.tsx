"use client"

import * as React from "react"
import { FileText, Plus, Upload, X, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  useCertificateStore,
  useChatStore,
  type Certificate,
} from "@/lib/store"
import { uploadPDF, askQuestion } from "@/lib/api"

export function KnowledgePanel() {
  const certificates = useCertificateStore((state) => state.certificates)
  const addCertificate = useCertificateStore((state) => state.addCertificate)
  const updateCertificate = useCertificateStore((state) => state.updateCertificate)
  const updateLoadingMessage = useCertificateStore(
    (state) => state.updateLoadingMessage,
  )
  const removeCertificate = useCertificateStore((state) => state.removeCertificate)
  const addMessage = useChatStore((state) => state.addMessage)
  const setChatLoading = useChatStore((state) => state.setLoading)
  const chatHistory = useChatStore((state) => state.chatHistory)

  const [isDragging, setIsDragging] = React.useState(false)

  const processFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const isPDF = file.type === "application/pdf"
      const isImage = file.type.startsWith("image/")
      
      if (isPDF || isImage) {
        const fileType = isPDF ? "PDF" : "Image"
        const id = `cert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const cert: Certificate = {
          id,
          name: file.name,
          status: "Uploading",
          score: 0,
          loadingMessage: `Uploading ${fileType}...`,
        }

        addCertificate(cert)

        try {
          // Upload file with progress updates
          await uploadPDF(file, (message) => {
            updateLoadingMessage(id, message)
            if (message === `Processing ${fileType}...` || message === "Processing PDF..." || message === "Processing Image...") {
              updateCertificate(id, { status: "Processing" })
            } else if (message === "Embedding document to knowledge base...") {
              updateCertificate(id, { status: "Embedding" })
            }
          })

          // Update to evaluating status
          updateCertificate(id, {
            status: "Evaluating",
            loadingMessage: "Evaluating certificate...",
          })

          // Auto-trigger evaluation
          const evaluationPrompt =
            "Evaluate the uploaded certificate and provide a summary of its key information, compliance status, and any important findings."

          // Use mixed text loader for PDF upload evaluation
          setChatLoading(true, "Evaluating certificate...", false)

          const response = await askQuestion(
            evaluationPrompt,
            chatHistory(),
            (message) => {
              updateLoadingMessage(id, message)
              // Keep mixed text loader for PDF upload evaluation
              setChatLoading(true, message, false)
              if (message === "Analyzing compliance requirements...") {
                updateCertificate(id, { status: "Analyzing" })
              } else if (message === "Generating evaluation report...") {
                updateCertificate(id, { status: "Generating" })
              }
            },
          )

          // Add AI response to chat
          addMessage({
            role: "bot",
            content: response.answer,
            reasoning: "Certificate evaluation completed.",
          })

          // Update certificate to evaluated
          updateCertificate(id, {
            status: "Evaluated",
            loadingMessage: undefined,
          })

          setChatLoading(false)
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Upload failed"
          updateCertificate(id, {
            status: "Error",
            loadingMessage: undefined,
            uploadError: errorMessage,
          })
          setChatLoading(false)

          // Add error message to chat
          addMessage({
            role: "bot",
            content: `Failed to process ${file.name}: ${errorMessage}`,
          })
        }
      }
    }
  }

  const handleFileUpload = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf,image/*"
    input.multiple = true
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files) processFiles(files)
    }
    input.click()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files)
    }
  }


  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <FileText className="size-3.5" />
                Certificates ({certificates.length})
              </div>
              <button
                onClick={handleFileUpload}
                className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="group flex flex-col gap-1 p-3 rounded-lg border border-border/50 bg-background/50 hover:border-primary/50 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate flex-1" title={cert.name}>
                      {cert.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {cert.status !== "Evaluated" && cert.status !== "Error" ? (
                        <Loader2 className="size-3 animate-spin text-primary" />
                      ) : (
                        <Badge
                          variant={cert.status === "Evaluated" ? "default" : "outline"}
                          className="text-[10px] h-4 px-1"
                        >
                          {cert.score > 0 ? `${cert.score}%` : cert.status}
                        </Badge>
                      )}
                      <button
                        onClick={() => removeCertificate(cert.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/10 rounded text-destructive transition-opacity"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground italic">
                    {cert.loadingMessage ||
                      (cert.status === "Evaluated"
                        ? "Reasoning complete"
                        : cert.status === "Error"
                          ? cert.uploadError || cert.evaluationError || "Error occurred"
                          : "Waiting for context...")}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleFileUpload}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full mt-4 p-4 border-2 border-dashed rounded-lg transition-all group ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/50 hover:bg-muted/20"
              }`}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary">
                <Upload className="size-5" />
                <span className="text-xs font-medium">Upload Certificate (PDF/Image)</span>
                <span className="text-[10px] opacity-70">
                  {isDragging ? "Drop files here" : "Click or drag files here"}
                </span>
              </div>
            </button>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
