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
import { uploadPDF, uploadPDFs } from "@/lib/api"

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
  const setSessionId = useChatStore((state) => state.setSessionId)

  const [isDragging, setIsDragging] = React.useState(false)
  const sessionId = useChatStore((state) => state.sessionId)

  const processFiles = async (files: FileList) => {
    const fileArray = Array.from(files).filter(file => {
      const isPDF = file.type === "application/pdf"
      const isImage = file.type.startsWith("image/")
      return isPDF || isImage
    })

    if (fileArray.length === 0) {
      return
    }

    // Create certificate entries for all files upfront
    const certificateMap = new Map<string, Certificate>()
    fileArray.forEach((file, index) => {
      const isPDF = file.type === "application/pdf"
      const fileType = isPDF ? "PDF" : "Image"
      const id = `cert-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`
      const cert: Certificate = {
        id,
        name: file.name,
        status: "Uploading",
        score: 0,
        loadingMessage: `Uploading ${fileType} (${index + 1}/${fileArray.length})...`,
      }
      certificateMap.set(file.name, cert)
      addCertificate(cert)
    })

    try {
      setChatLoading(true)

      // Upload all files in batch
      const uploadResponse = await uploadPDFs(
        fileArray,
        sessionId || undefined, // Use existing sessionId if available
        (message) => {
          // Update all certificates with progress message
          certificateMap.forEach((cert) => {
            updateLoadingMessage(cert.id, message)
            if (message.includes("Processing")) {
              updateCertificate(cert.id, { status: "Processing" })
            }
          })
        }
      )

      // Store sessionId from upload response
      const newSessionId = uploadResponse.sessionId
      setSessionId(newSessionId)

      // Update certificates with document info from response
      if (uploadResponse.documents) {
        uploadResponse.documents.forEach((doc, index) => {
          // Find certificate by matching file name or index
          const cert = Array.from(certificateMap.values())[index]
          if (cert) {
            updateCertificate(cert.id, {
              sessionId: newSessionId,
              documentId: doc.documentId,
              documentIndex: doc.documentIndex,
              status: "Evaluated",
              loadingMessage: undefined,
            })
          }
        })
      } else {
        // Fallback: mark all as evaluated
        certificateMap.forEach((cert) => {
          updateCertificate(cert.id, {
            sessionId: newSessionId,
            status: "Evaluated",
            loadingMessage: undefined,
          })
        })
      }

      // Add the agent's initial message to chat (asking for criteria)
      if (uploadResponse.message) {
        addMessage({
          role: "bot",
          content: uploadResponse.message,
        })
      }

      // Handle errors if any
      if (uploadResponse.errors && uploadResponse.errors.length > 0) {
        uploadResponse.errors.forEach((error) => {
          const cert = Array.from(certificateMap.values()).find(c => c.name === error.fileName)
          if (cert) {
            updateCertificate(cert.id, {
              status: "Error",
              loadingMessage: undefined,
              uploadError: error.error,
            })
          }
          addMessage({
            role: "bot",
            content: `Failed to process ${error.fileName}: ${error.error}`,
          })
        })
      }

      setChatLoading(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed"
      
      // Mark all certificates as error
      certificateMap.forEach((cert) => {
        updateCertificate(cert.id, {
          status: "Error",
          loadingMessage: undefined,
          uploadError: errorMessage,
        })
      })

      setChatLoading(false)

      // Add error message to chat
      addMessage({
        role: "bot",
        content: `Failed to process files: ${errorMessage}`,
      })
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
                Certificates ({certificates.length} document{certificates.length !== 1 ? 's' : ''})
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
                  className={`group flex flex-col gap-1 p-3 rounded-lg border transition-all ${
                    cert.status === "Evaluated"
                      ? "border-primary border-2 bg-primary/5"
                      : cert.status === "Error"
                        ? "border-destructive/50 border bg-destructive/5"
                        : "border-border/50 bg-background/50 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate flex-1" title={cert.name}>
                      {cert.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {cert.status !== "Evaluated" && cert.status !== "Error" ? (
                        <Loader2 className="size-3 animate-spin text-primary" />
                      ) : cert.status === "Error" ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1"
                        >
                          {cert.status}
                        </Badge>
                      ) : null}
                      <button
                        onClick={() => removeCertificate(cert.id)}
                        className={`p-0.5 hover:bg-destructive/10 rounded text-destructive transition-opacity ${
                          cert.status === "Evaluated" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  </div>
                  {cert.status !== "Evaluated" && (
                    <span className="text-[10px] text-muted-foreground italic">
                      {cert.loadingMessage ||
                        (cert.status === "Error"
                          ? cert.uploadError || cert.evaluationError || "Error occurred"
                          : "Waiting for context...")}
                    </span>
                  )}
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
