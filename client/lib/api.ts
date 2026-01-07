const UPLOAD_API_URL = "http://116.202.210.102:5001/api/upload"
const ASK_API_URL = "http://116.202.210.102:5001/api/chat"

export interface UploadResponse {
  message: string
  threadId: string
  status: string
}

export interface AskResponse {
  answer: string
  threadId: string | null
  status: string
  hasHistory?: boolean // Indicates if chat history exists
  messageCount?: number // Total messages in conversation (for threadId conversations)
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
  threadId?: string,
  onProgress?: (message: string) => void,
): Promise<UploadResponse> {
  const isImage = file.type.startsWith("image/")
  const fileType = isImage ? "Image" : "PDF"

  if (onProgress) {
    onProgress(`Uploading ${fileType}...`)
  }

  const formData = new FormData()
  formData.append("pdf", file)
  if (threadId) {
    formData.append("threadId", threadId)
  }

  if (onProgress) {
    onProgress(`Processing ${fileType}...`)
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
      onProgress("Processing certificate...")
    }

    const data: UploadResponse = await response.json()
    return data
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `Failed to upload ${fileType}`,
    )
  }
}

export async function askQuestion(
  question: string,
  threadId?: string | null,
  onProgress?: (message: string) => void,
  chatHistory?: Array<{ role: string; content: string }>,
): Promise<AskResponse> {
  if (onProgress) {
    onProgress("Processing your request...")
  }

  try {
    const requestBody = {
      question,
      ...(threadId && { threadId }),
      ...(chatHistory && chatHistory.length > 0 && { chatHistory }),
    };
    
    console.log("=== API: Request Body ===");
    console.log("Question:", question);
    console.log("ThreadId:", threadId || "none");
    console.log("ChatHistory in body:", requestBody.chatHistory ? `${requestBody.chatHistory.length} messages` : "not included");
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

