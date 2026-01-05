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
  addMessage: (message: ChatMessage) => void
  setLoading: (isLoading: boolean, message?: string) => void
  clearMessages: () => void
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
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setLoading: (isLoading, message = "") =>
    set({ isLoading, loadingMessage: message }),
  clearMessages: () => set({ messages: [] }),
  chatHistory: () =>
    get().messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
}))

