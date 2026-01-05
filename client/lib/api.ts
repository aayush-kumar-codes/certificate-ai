const UPLOAD_API_URL = "http://116.202.210.102:5001/upload"
const ASK_API_URL = "http://116.202.210.102:5001/ask"

export interface UploadResponse {
  message: string
}

export interface AskResponse {
  answer: string
  metadata: {
    docsUsed?: number
    question?: string
    decisionLog?: any
  }
}

export async function uploadPDF(
  file: File,
  onProgress?: (message: string) => void,
): Promise<UploadResponse> {
  if (onProgress) {
    onProgress("Uploading PDF...")
  }

  const formData = new FormData()
  formData.append("pdf", file)

  if (onProgress) {
    onProgress("Processing PDF...")
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
      onProgress("Embedding document to knowledge base...")
    }

    const data: UploadResponse = await response.json()
    return data
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to upload PDF",
    )
  }
}

export async function askQuestion(
  question: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  onProgress?: (message: string) => void,
): Promise<AskResponse> {
  if (onProgress) {
    onProgress("Evaluating certificate...")
  }

  try {
    // Simulate progress updates during evaluation
    const progressMessages = [
      "Analyzing compliance requirements...",
      "Extracting key information...",
      "Generating evaluation report...",
    ]

    let progressIndex = 0
    const progressInterval = setInterval(() => {
      if (onProgress && progressIndex < progressMessages.length) {
        onProgress(progressMessages[progressIndex])
        progressIndex++
      } else {
        clearInterval(progressInterval)
      }
    }, 1000)

    const response = await fetch(ASK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        chatHistory,
      }),
    })

    clearInterval(progressInterval)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Evaluation failed" }))
      throw new Error(errorData.error || "Evaluation failed")
    }

    const data: AskResponse = await response.json()
    return data
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to evaluate certificate",
    )
  }
}

