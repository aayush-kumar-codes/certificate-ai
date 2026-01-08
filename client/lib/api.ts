const UPLOAD_API_URL = "http://116.202.210.102:5001/api/upload"
const ASK_API_URL = "http://116.202.210.102:5001/api/chat"

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
  memoryActive?: boolean // Indicates if MemorySession is active
  isNewSession?: boolean // Indicates if this is a new session
  hasHistory?: boolean // Indicates if chat history exists
  messageCount?: number // Total messages in conversation (for sessionId conversations)
  waitingForUpload?: boolean // Optional: indicates agent is waiting for upload
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

export async function uploadPDF(
  file: File,
  sessionId?: string,
  onProgress?: (message: string) => void,
): Promise<UploadResponse> {
  return uploadPDFs([file], sessionId, onProgress)
}

export async function uploadPDFs(
  files: File[],
  sessionId?: string,
  onProgress?: (message: string) => void,
): Promise<UploadResponse> {
  if (!files || files.length === 0) {
    throw new Error("No files provided")
  }

  const fileCount = files.length
  const fileType = files[0].type.startsWith("image/") ? "Image" : "PDF"

  if (onProgress) {
    onProgress(`Uploading ${fileCount} file${fileCount > 1 ? 's' : ''}...`)
  }

  const formData = new FormData()
  
  // Append all files with the same field name "pdf" (multer.array expects this)
  files.forEach((file) => {
    formData.append("pdf", file)
  })
  
  if (sessionId) {
    formData.append("sessionId", sessionId)
  }

  if (onProgress) {
    onProgress(`Processing ${fileCount} file${fileCount > 1 ? 's' : ''}...`)
  }

  try {
    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Upload failed" }))
      throw new Error(errorData.error || "Upload failed")
    }

    if (onProgress) {
      onProgress("Processing certificate(s)...")
    }

    const data: UploadResponse = await response.json()
    return data
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `Failed to upload ${fileCount} file${fileCount > 1 ? 's' : ''}`,
    )
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
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Request failed" }))
      throw new Error(errorData.error || "Request failed")
    }

    const data: AskResponse = await response.json()
    return data
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to process request",
    )
  }
}

