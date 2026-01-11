const UPLOAD_API_URL = "http://116.202.210.102:5001/api/upload"
const ASK_API_URL = "http://116.202.210.102:5001/api/chat"
const FEEDBACK_API_URL = "http://116.202.210.102:5001/api/feedback"

export interface UploadResponse {
  message: string
  sessionId: string
  status?: string
  documentCount?: number
  documents?: Array<{
    documentId: string
    documentName: string
    documentIndex: number
  }>
  allDocuments?: Array<{
    documentId: string
    documentName: string
    documentIndex: number
  }>
  errors?: Array<{
    fileName: string
    error: string
  }>
}

export interface AskResponse {
  answer: string
  sessionId: string | null
  status: string
  memoryActive?: boolean
  isNewSession?: boolean
  hasHistory?: boolean
  messageCount?: number
  waitingForUpload?: boolean
  validationResult?: {
    passed: boolean
    checks: Array<{
      criterion: string
      expected: string
      found: string
      passed: boolean
    }>
    details: Record<string, any>
  }
  extractedFields?: {
    agencyName?: string | null
    expiryDate?: string | null
  }
}

export interface FeedbackResponse {
  success: boolean
  feedback?: {
    id: number
    feedbackType: "LIKE" | "DISLIKE"
    sessionId: string
    createdAt: string
  }
  error?: string
}

export interface FileUploadProgress {
  file: File
  progress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
  id: string
}

export async function uploadPDF(
  file: File,
  sessionId?: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  return uploadPDFs([file], sessionId, onProgress)
}

export async function uploadPDFs(
  files: File[],
  sessionId?: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  if (!files || files.length === 0) {
    throw new Error("No files provided")
  }

  const fileCount = files.length
  const fileType = files[0].type.startsWith("image/") ? "Image" : "PDF"

  const formData = new FormData()
  
  // Append all files with the same field name "pdf" (multer.array expects this)
  files.forEach((file) => {
    formData.append("pdf", file)
  })
  
  if (sessionId) {
    formData.append("sessionId", sessionId)
  }

  try {
    const xhr = new XMLHttpRequest()

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          onProgress(percentComplete)
        }
      })
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort()
      })
    }

    const response = await new Promise<UploadResponse>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data: UploadResponse = JSON.parse(xhr.responseText)
            resolve(data)
          } catch (error) {
            reject(new Error("Failed to parse response"))
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            reject(new Error(errorData.error || "Upload failed"))
          } catch {
            reject(new Error("Upload failed"))
          }
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error("Network error during upload"))
      })

      xhr.addEventListener('abort', () => {
        reject(new Error("Upload cancelled"))
      })

      xhr.open("POST", UPLOAD_API_URL)
      xhr.send(formData)
    })

    return response
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Upload cancelled")
    }
    throw new Error(
      error instanceof Error ? error.message : `Failed to upload ${fileCount} file${fileCount > 1 ? 's' : ''}`,
    )
  }
}

export interface StreamingCallbacks {
  onChunk?: (text: string) => void
  onComplete?: (metadata: Partial<AskResponse>) => void
  onError?: (error: string) => void
}

export async function askQuestion(
  question: string,
  sessionId?: string | null,
  onProgress?: (message: string) => void,
  streamingCallbacks?: StreamingCallbacks,
): Promise<AskResponse> {
  if (onProgress) {
    onProgress("Processing your request...")
  }

  try {
    const requestBody = {
      question,
      ...(sessionId && { sessionId }),
    };
    
    console.log("=== API: Request Body ===");
    console.log("Question:", question);
    console.log("SessionId:", sessionId || "none");
    console.log("Request body keys:", Object.keys(requestBody));
    
    const response = await fetch(ASK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Request failed" }))
      throw new Error(errorData.error || "Request failed")
    }

    // Check if response is streaming (SSE format)
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("text/event-stream")) {
      // Handle streaming response
      return await handleStreamingResponse(response, streamingCallbacks)
    } else {
      // Handle non-streaming response (fallback cases like upload prompts)
      const data: AskResponse = await response.json()
      return data
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to process request"
    streamingCallbacks?.onError?.(errorMessage)
    throw new Error(errorMessage)
  }
}

async function handleStreamingResponse(
  response: Response,
  callbacks?: StreamingCallbacks,
): Promise<AskResponse> {
  const reader = response.body?.getReader()
  if (!reader) {
    const errorMessage = "Response body is not readable"
    callbacks?.onError?.(errorMessage)
    throw new Error(errorMessage)
  }

  const decoder = new TextDecoder()
  let accumulatedText = ""
  let finalMetadata: Partial<AskResponse> = {}
  let streamCompleted = false

  try {
    while (true) {
      let readResult
      try {
        readResult = await reader.read()
      } catch (readError) {
        const errorMessage = `Failed to read stream: ${readError instanceof Error ? readError.message : "Unknown error"}`
        callbacks?.onError?.(errorMessage)
        throw new Error(errorMessage)
      }

      const { value, done } = readResult
      if (done) {
        break
      }

      let chunk
      try {
        chunk = decoder.decode(value, { stream: true })
      } catch (decodeError) {
        console.warn("Failed to decode chunk:", decodeError)
        continue
      }

      const lines = chunk.split("\n")

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6)) // Remove "data: " prefix

            if (data.type === "chunk" && data.text) {
              accumulatedText += data.text
              callbacks?.onChunk?.(data.text)
            } else if (data.type === "done") {
              // Extract metadata from done event
              finalMetadata = {
                sessionId: data.sessionId || null,
                memoryActive: data.memoryActive,
                isNewSession: data.isNewSession,
                status: "completed",
                ...(data.messageId && { messageId: data.messageId }),
              }
              streamCompleted = true
              callbacks?.onComplete?.(finalMetadata)
            } else if (data.type === "error") {
              const errorMessage = data.message || data.error || "Streaming error occurred"
              callbacks?.onError?.(errorMessage)
              throw new Error(errorMessage)
            }
          } catch (parseError) {
            // If it's an Error we threw, re-throw it
            if (parseError instanceof Error && parseError.message.includes("Streaming error")) {
              throw parseError
            }
            // Skip malformed JSON lines
            console.warn("Failed to parse SSE data:", line, parseError)
          }
        }
      }
    }

    // If stream ended without completion event, check if we have content
    if (!streamCompleted && accumulatedText) {
      // Stream ended but we have content, treat as completed
      callbacks?.onComplete?.(finalMetadata)
    } else if (!streamCompleted && !accumulatedText) {
      // Stream ended with no content and no completion event - likely an error
      const errorMessage = "Stream ended unexpectedly without content"
      callbacks?.onError?.(errorMessage)
      throw new Error(errorMessage)
    }

    return {
      answer: accumulatedText,
      sessionId: finalMetadata.sessionId || null,
      status: finalMetadata.status || (accumulatedText ? "completed" : "error"),
      memoryActive: finalMetadata.memoryActive,
      isNewSession: finalMetadata.isNewSession,
    } as AskResponse
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Streaming failed"
    callbacks?.onError?.(errorMessage)
    
    // Try to release the reader
    try {
      reader.releaseLock()
    } catch (releaseError) {
      // Ignore release errors
    }
    
    throw new Error(errorMessage)
  } finally {
    // Ensure reader is released
    try {
      reader.releaseLock()
    } catch (releaseError) {
      // Ignore release errors
    }
  }
}

export async function submitFeedback(
  sessionId: string,
  feedbackType: "LIKE" | "DISLIKE",
): Promise<FeedbackResponse> {
  try {
    const response = await fetch(FEEDBACK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        feedbackType,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Feedback submission failed" }))
      throw new Error(errorData.error || "Feedback submission failed")
    }

    const data: FeedbackResponse = await response.json()
    return data
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to submit feedback",
    )
  }
}
