"use client"

import * as React from "react"
import { FileText, Plus, Upload, X, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Certificate {
  id: string
  name: string
  status: "Pending" | "Processing" | "Evaluated" | "In Review"
  score: number
  file?: File
  extractedText?: string
}

export function KnowledgePanel() {
  const [certificates, setCertificates] = React.useState<Certificate[]>([
    { id: "1", name: "ISO_27001_Compliance.pdf", status: "Evaluated", score: 92 },
    { id: "2", name: "SOC2_Type_II_2025.pdf", status: "In Review", score: 78 },
  ])
  const [isDragging, setIsDragging] = React.useState(false)

  const extractTextFromPDF = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target?.result as ArrayBuffer)
          const pdfjsLib = await import("pdfjs-dist")
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

          const pdf = await pdfjsLib.getDocument(typedarray).promise
          let fullText = ""
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map((item: any) => item.str).join(" ")
            fullText += pageText + "\n\n"
          }
          console.log("[v0] Extracted text length:", fullText.length)
          resolve(fullText.slice(0, 5000))
        } catch (error) {
          console.error("[v0] PDF extraction error:", error)
          resolve("Failed to extract text. Check console for details.")
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  const processFiles = async (files: FileList) => {
    const newCerts: Certificate[] = []

    for (const file of Array.from(files)) {
      if (file.type === "application/pdf") {
        const id = `cert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const cert: Certificate = {
          id,
          name: file.name,
          status: "Processing",
          score: 0,
          file,
        }
        newCerts.push(cert)
        setCertificates((prev) => [...prev, cert])

        // Extract text asynchronously
        const extractedText = await extractTextFromPDF(file)
        setCertificates((prev) =>
          prev.map((c) => (c.id === id ? { ...c, extractedText, status: "Pending" as const } : c)),
        )
      }
    }
  }

  const handleFileUpload = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf"
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

  const removeCertificate = (id: string) => {
    setCertificates((prev) => prev.filter((c) => c.id !== id))
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
                      {cert.status === "Processing" ? (
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
                    {cert.status === "Processing"
                      ? "Extracting text..."
                      : cert.status === "Evaluated"
                        ? "Reasoning complete"
                        : cert.extractedText
                          ? `Extracted ${cert.extractedText.length} characters`
                          : "Waiting for context..."}
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
                <span className="text-xs font-medium">Upload Certificate PDF</span>
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
