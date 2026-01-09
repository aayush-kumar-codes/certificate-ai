import { create } from "zustand"

export type CertificateStatus =
  | "Uploading"
  | "Processing"
  | "Embedding"
  | "Evaluating"
  | "Analyzing"
  | "Generating"
  | "Evaluated"
  | "Error"

export interface Certificate {
  id: string
  name: string
  status: CertificateStatus
  score: number
  loadingMessage?: string
  uploadError?: string
  evaluationError?: string
  sessionId?: string
  documentId?: string // Backend document ID from Pinecone
  documentIndex?: number // Document index (1, 2, 3...)
}

export interface ChatMessage {
  role: "user" | "bot"
  content: string
  reasoning?: string
}

interface CertificateStore {
  certificates: Certificate[]
  addCertificate: (cert: Certificate) => void
  updateCertificate: (id: string, updates: Partial<Certificate>) => void
  updateLoadingMessage: (id: string, message: string) => void
  removeCertificate: (id: string) => void
}

export interface ChatStore {
  messages: ChatMessage[]
  isLoading: boolean
  loadingMessage: string
  showSimpleLoader: boolean
  sessionId: string | null
  feedbackSubmitted: boolean
  feedbackType: "LIKE" | "DISLIKE" | null
  addMessage: (message: ChatMessage) => void
  updateLastMessage: (updates: Partial<ChatMessage>) => void
  setLoading: (isLoading: boolean, message?: string, showSimpleLoader?: boolean) => void
  clearMessages: () => void
  setSessionId: (sessionId: string | null) => void
  setFeedback: (feedbackType: "LIKE" | "DISLIKE" | null) => void
  chatHistory: () => Array<{ role: string; content: string }>
}

export const useCertificateStore = create<CertificateStore>((set) => ({
  certificates: [],
  addCertificate: (cert) =>
    set((state) => ({
      certificates: [...state.certificates, cert],
    })),
  updateCertificate: (id, updates) =>
    set((state) => ({
      certificates: state.certificates.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    })),
  updateLoadingMessage: (id, message) =>
    set((state) => ({
      certificates: state.certificates.map((c) =>
        c.id === id ? { ...c, loadingMessage: message } : c,
      ),
    })),
  removeCertificate: (id) =>
    set((state) => ({
      certificates: state.certificates.filter((c) => c.id !== id),
    })),
}))

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  loadingMessage: "",
  showSimpleLoader: false,
  sessionId: null,
  feedbackSubmitted: false,
  feedbackType: null,
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  updateLastMessage: (updates) =>
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        messages[messages.length - 1] = { ...lastMessage, ...updates }
      }
      return { messages }
    }),
  setLoading: (isLoading, message = "", showSimpleLoader = false) =>
    set({ isLoading, loadingMessage: message, showSimpleLoader }),
  clearMessages: () => set({ messages: [], sessionId: null, feedbackSubmitted: false, feedbackType: null }),
  setSessionId: (sessionId) => set({ sessionId }),
  setFeedback: (feedbackType) =>
    set({
      feedbackType,
      feedbackSubmitted: feedbackType !== null,
    }),
  chatHistory: () =>
    get().messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
}))

