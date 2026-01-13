const UPLOAD_API_URL = "http://116.202.210.102:5001/api/upload"
const UPLOAD_PROGRESS_API_URL = "http://116.202.210.102:5001/api/upload/progress"
const ASK_API_URL = "http://116.202.210.102:5001/api/chat"
const FEEDBACK_API_URL = "http://116.202.210.102:5001/api/feedback"
const GENERATE_CRITERIA_API_URL = "http://116.202.210.102:5001/api/generate-criteria"

export interface UploadProgressResponse {
  uploadId: string
  totalFiles: number
  currentFile: number
  overallProgress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  files: Array<{
    fileName: string
    progress: number
    status: 'uploading' | 'processing' | 'completed' | 'error'
  }>
  elapsedTime: number
  finalResult?: UploadResponse
  error?: string
}

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
  uploadId?: string
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

export interface GenerateCriteriaResponse {
  success: boolean
  criteriaId?: string
  criteria?: Record<string, any>
  description?: string
  threshold?: number
  message?: string
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

/**
 * Poll for upload progress
 */
export async function getUploadProgress(
  uploadId: string,
  signal?: AbortSignal,
): Promise<UploadProgressResponse> {
  const controller = signal ? new AbortController() : undefined
  if (signal) {
    signal.addEventListener('abort', () => controller?.abort())
  }

  const response = await fetch(`${UPLOAD_PROGRESS_API_URL}/${uploadId}`, {
    method: 'GET',
    signal: controller?.signal || signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to get progress" }))
    throw new Error(errorData.error || "Failed to get upload progress")
  }

  return response.json()
}

export async function uploadPDFs(
  files: File[],
  sessionId?: string,
  onProgress?: (progress: number, fileProgress?: Map<string, number>) => void,
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

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort()
      })
    }

    // Start upload and get uploadId
    const initialResponse = await new Promise<{ uploadId: string; totalFiles: number }>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status === 202) {
          try {
            const data = JSON.parse(xhr.responseText)
            resolve({ uploadId: data.uploadId, totalFiles: data.totalFiles })
          } catch (error) {
            reject(new Error("Failed to parse response"))
          }
        } else if (xhr.status >= 200 && xhr.status < 300) {
          // Legacy response format (non-async)
          try {
            const data: UploadResponse = JSON.parse(xhr.responseText)
            resolve({ uploadId: data.uploadId || '', totalFiles: fileCount })
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

    // If we got an uploadId, poll for progress
    if (initialResponse.uploadId) {
      return await pollUploadProgress(
        initialResponse.uploadId,
        files.map(f => f.name),
        onProgress,
        signal
      )
    }

    // Fallback: if no uploadId, return empty response (shouldn't happen)
    throw new Error("No uploadId received from server")
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Upload cancelled")
    }
    throw new Error(
      error instanceof Error ? error.message : `Failed to upload ${fileCount} file${fileCount > 1 ? 's' : ''}`,
    )
  }
}

/**
 * Poll for upload progress until completion
 */
async function pollUploadProgress(
  uploadId: string,
  fileNames: string[],
  onProgress?: (progress: number, fileProgress?: Map<string, number>) => void,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  const pollInterval = 500 // Poll every 500ms
  const maxPollTime = 5 * 60 * 1000 // Max 5 minutes
  const startTime = Date.now()

  while (true) {
    // Check timeout
    if (Date.now() - startTime > maxPollTime) {
      throw new Error("Upload timeout - exceeded maximum polling time")
    }

    // Check abort signal
    if (signal?.aborted) {
      throw new Error("Upload cancelled")
    }

    try {
      const progress = await getUploadProgress(uploadId, signal)

      // Update progress callback
      if (onProgress) {
        const fileProgressMap = new Map<string, number>()
        progress.files.forEach((file) => {
          fileProgressMap.set(file.fileName, file.progress)
        })
        onProgress(progress.overallProgress, fileProgressMap)
      }

      // If completed, return final result
      if (progress.status === 'completed' && progress.finalResult) {
        return progress.finalResult
      }

      // If error, throw
      if (progress.status === 'error') {
        throw new Error(progress.error || "Upload failed")
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.message === "Upload cancelled")) {
        throw new Error("Upload cancelled")
      }
      // If it's a 404, the upload might not have started yet, continue polling
      if (error instanceof Error && error.message.includes("not found")) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        continue
      }
      throw error
    }
  }
}

export async function askQuestion(
  question: string,
  sessionId?: string | null,
  onProgress?: (message: string) => void,
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
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
      cache: "no-store",
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Request failed" }))
      throw new Error(errorData.error || "Request failed")
    }

    const data: AskResponse = await response.json()
    console.log("=== API: Response Data ===");
    console.log("Answer:", data.answer);
    console.log("Answer length:", data.answer?.length);
    console.log("SessionId:", data.sessionId);
    console.log("Full response:", JSON.stringify(data, null, 2));
    return data
  } catch (error) {
    console.error("=== API: Error ===", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process request"
    throw new Error(errorMessage)
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

export async function generateCriteria(
  sessionId: string,
): Promise<GenerateCriteriaResponse> {
  try {
    const response = await fetch(GENERATE_CRITERIA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Request failed" }))
      throw new Error(errorData.error || "Failed to generate criteria")
    }

    const data: GenerateCriteriaResponse = await response.json()
    return data
  } catch (error) {
    console.error("Error generating criteria:", error)
    throw new Error(
      error instanceof Error ? error.message : "Failed to generate criteria"
    )
  }
}
