"use client"

import type React from "react"

import { X, Upload, AlertCircle } from "lucide-react"
import { useState, useRef } from "react"
import { uploadPDFs, generateCriteria } from "@/lib/api"

interface UploadModalProps {
  onClose: () => void
  sessionId?: string
  setSessionId?: (sessionId: string) => void
  onUploadComplete?: (response: any) => void
  setIsLoadingResponse?: (loading: boolean) => void
}

export default function UploadModal({ onClose, sessionId, setSessionId, onUploadComplete, setIsLoadingResponse }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const droppedFile = files[0]
      // Validate file type
      if (droppedFile.type === 'application/pdf' || droppedFile.type.startsWith('image/')) {
        setFile(droppedFile)
      } else {
        alert('Please upload PDF or image files only')
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      // Validate file type
      if (selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/')) {
        setFile(selectedFile)
      } else {
        alert('Please upload PDF or image files only')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    }
  }

  const handleUpload = async () => {
    if (!file || isUploading) return

    setIsUploading(true)
    
    // Show loading state in chat immediately
    setIsLoadingResponse?.(true)

    try {
      // Close modal immediately
      onClose()

      // Upload file using the API
      const uploadResponse = await uploadPDFs(
        [file],
        sessionId,
        undefined, // onProgress callback
        undefined  // abort signal
      )

      // Update sessionId if provided
      const currentSessionId = uploadResponse.sessionId || sessionId
      if (uploadResponse.sessionId && setSessionId && !sessionId) {
        setSessionId(uploadResponse.sessionId)
      }

      // Get the documentId from the uploaded document
      const uploadedDocument = uploadResponse.documents && uploadResponse.documents.length > 0 
        ? uploadResponse.documents[0] 
        : null

      if (uploadedDocument && currentSessionId) {
        // Generate criteria from the uploaded document
        try {
          console.log("🔄 Generating criteria from uploaded document:", uploadedDocument.documentId)
          const criteriaResponse = await generateCriteria(currentSessionId, uploadedDocument.documentId)
          
          // Notify parent component of upload and criteria completion
          if (onUploadComplete) {
            onUploadComplete({
              ...uploadResponse,
              criteria: criteriaResponse.success ? {
                criteriaId: criteriaResponse.criteriaId,
                criteria: criteriaResponse.criteria,
                description: criteriaResponse.description,
                threshold: criteriaResponse.threshold,
              } : undefined,
              criteriaGenerationStatus: criteriaResponse.success ? 'completed' : 'failed',
              criteriaGenerationError: criteriaResponse.error,
            })
          }
        } catch (criteriaError) {
          console.error("Error generating criteria:", criteriaError)
          // Notify parent even if criteria generation fails
          if (onUploadComplete) {
            onUploadComplete({
              ...uploadResponse,
              criteriaGenerationStatus: 'failed',
              criteriaGenerationError: criteriaError instanceof Error ? criteriaError.message : 'Failed to generate criteria',
            })
          }
        }
      } else {
        // No document uploaded or no sessionId, just notify of upload completion
        if (onUploadComplete) {
          onUploadComplete(uploadResponse)
        }
      }

      // Hide loading state after everything completes
      setIsLoadingResponse?.(false)
    } catch (error) {
      console.error("Error uploading file:", error)
      setIsLoadingResponse?.(false)
      // Error handling is done in the parent component
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm !p-4">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0a0a0a] !p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Upload Attachment</h2>
          <button onClick={onClose} className="rounded-md !p-1 hover:bg-white/10 transition-colors">
            <X className="h-5 w-5 text-white/60 hover:text-white" />
          </button>
        </div>

        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed !p-6 text-center cursor-pointer transition-all ${
              isDragging ? "border-white/40 bg-white/[0.05]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".pdf,image/*"
              onChange={handleFileSelect} 
              className="hidden" 
            />
            <Upload className="h-8 w-8 text-white/40 mx-auto mb-2" />
            <p className="text-sm text-white/60">
              {file ? file.name : "Drag and drop your file here or click to select"}
            </p>
          </div>

          {file && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] !p-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-white/40 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-white/60">
                Selected: <span className="text-white/80 font-medium">{file.name}</span>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] !px-4 !py-2 text-white hover:bg-white/[0.05] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="flex-1 rounded-lg bg-white !px-4 !py-2 text-[#0a0a0a] font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
