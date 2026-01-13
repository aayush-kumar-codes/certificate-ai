'use client'

import React, { useState, useRef, useEffect } from 'react'
import { LeftMenu } from '@/components/LeftMenu'
import { RightMenu } from '@/components/RightMenu'
import { cn } from '@/lib/utils'
import { DocumentWithBadgeIcon, ShareIcon, BellIcon, ChevronDownIcon, UploadIcon, MicIcon, PaperclipIcon, FolderOpenIcon, SendIcon, CloneIcon, EditIcon, CopyIcon, BackIcon } from '@/components/icons'
import { FileUploadProgress, FileUploadItem } from '@/components/FileUploadProgress'
import { uploadPDFs, UploadResponse, askQuestion, AskResponse } from '@/lib/api'
import CriteriaOptions from '@/components/CriteriaOptions'

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  timestamp: number
  showCriteriaOptions?: boolean
}

export default function Home() {
  const [uploadFiles, setUploadFiles] = useState<FileUploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [inputValue, setInputValue] = useState('')
  const [hasUploadedFiles, setHasUploadedFiles] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isLoadingResponse, setIsLoadingResponse] = useState(false)
  const [uploadResponseMessage, setUploadResponseMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Add upload response message to chat when upload completes
  useEffect(() => {
    if (uploadResponseMessage && uploadFiles.length > 0) {
      const allCompleted = uploadFiles.every(file => file.status === 'completed' || file.status === 'error')
      if (allCompleted) {
        // Add upload response message to chat messages
        setChatMessages((prev) => {
          // Check if message already exists to avoid duplicates
          const alreadyExists = prev.some(
            (msg) => msg.role === 'bot' && msg.showCriteriaOptions === true
          )
          if (!alreadyExists) {
            return [...prev, { 
              id: `bot-upload-${Date.now()}-${Math.random()}`,
              role: 'bot', 
              content: 'Enter Your Questionnaire',
              timestamp: Date.now(),
              showCriteriaOptions: true
            }]
          }
          return prev
        })
        // Don't clear upload files - keep them visible
        setUploadResponseMessage(null)
      }
    }
  }, [uploadFiles, uploadResponseMessage])

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    if (chatContainerRef.current) {
      // Use requestAnimationFrame for better performance and immediate DOM updates
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      })
    }
  }, [chatMessages, isLoadingResponse])

  const generateFileId = () => {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  const updateFileProgress = (fileId: string, updates: Partial<FileUploadItem>) => {
    setUploadFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, ...updates } : file))
    )
  }

  const removeFile = (fileId: string) => {
    setUploadFiles((prev) => prev.filter((file) => file.id !== fileId))
    uploadAbortControllers.current.delete(fileId)
  }

  const cancelUpload = (fileId: string) => {
    const controller = uploadAbortControllers.current.get(fileId)
    if (controller) {
      controller.abort()
      // Cancel all files that share the same controller
      setUploadFiles((prev) =>
        prev.map((file) => {
          const fileController = uploadAbortControllers.current.get(file.id)
          if (fileController === controller && file.status === 'uploading') {
            uploadAbortControllers.current.delete(file.id)
            return { ...file, status: 'error' as const, error: 'Upload cancelled' }
          }
          return file
        })
      )
    }
  }

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const validFiles = fileArray.filter(
      (file) => file.type === 'application/pdf' || file.type.startsWith('image/')
    )

    if (validFiles.length === 0) {
      alert('Please upload PDF or image files only')
      return
    }

    console.log('Starting upload for files:', validFiles.map(f => f.name))

    // Create file items for tracking
    const newFileItems: FileUploadItem[] = validFiles.map((file) => ({
      id: generateFileId(),
      file,
      progress: 0,
      status: 'uploading',
    }))

    // Set upload files immediately to show the progress component - append to existing files
    setUploadFiles(prev => [...prev, ...newFileItems])
    setHasUploadedFiles(true) // Hide upload zone and show chat interface
    setIsLoadingResponse(false) // Reset loading state
    setUploadResponseMessage(null) // Clear previous upload response message

    // Upload all files together (as the API expects)
    const controller = new AbortController()
    newFileItems.forEach((item) => {
      uploadAbortControllers.current.set(item.id, controller)
    })

    try {
      // Upload all files at once
      const response = await uploadPDFs(
        validFiles,
        sessionId,
        (overallProgress, fileProgressMap) => {
          // Update each file with its individual progress
          newFileItems.forEach((item) => {
            const fileProgress = fileProgressMap?.get(item.file.name) || 0
            updateFileProgress(item.id, { progress: fileProgress })
          })
        },
        controller.signal
      )

      // Update files based on response
      if (response.errors && response.errors.length > 0) {
        // Handle errors
        response.errors.forEach((error) => {
          const fileItem = newFileItems.find((item) => item.file.name === error.fileName)
          if (fileItem) {
            updateFileProgress(fileItem.id, {
              status: 'error',
              progress: 100,
              error: error.error,
            })
          }
        })

        // Mark successful files as completed
        const errorFileNames = new Set(response.errors.map((e) => e.fileName))
        newFileItems.forEach((item) => {
          if (!errorFileNames.has(item.file.name)) {
            updateFileProgress(item.id, {
              status: 'completed',
              progress: 100,
            })
          }
        })
      } else {
        // All files succeeded
        newFileItems.forEach((item) => {
          updateFileProgress(item.id, {
            status: 'completed',
            progress: 100,
          })
        })
      }

      // Set session ID if provided
      const newSessionId = response.sessionId || sessionId
      if (response.sessionId && !sessionId) {
        setSessionId(response.sessionId)
      }

      // Store the upload response message to show after upload completes
      // We'll show CriteriaOptions component instead of the text message
      if (response.message) {
        setUploadResponseMessage(response.message)
      }

      // Handle errors if any - add error messages to chat
      if (response.errors && response.errors.length > 0) {
        response.errors.forEach((error) => {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `bot-error-${Date.now()}-${Math.random()}`,
              role: 'bot',
              content: `Failed to process ${error.fileName}: ${error.error}`,
              timestamp: Date.now()
            },
          ])
        })
      }
    } catch (error) {
      // Handle upload error
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      newFileItems.forEach((item) => {
        updateFileProgress(item.id, {
          status: 'error',
          progress: 100,
          error: errorMessage,
        })
      })
    } finally {
      newFileItems.forEach((item) => {
        uploadAbortControllers.current.delete(item.id)
      })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = Array.from(e.target.files)
      const validFiles = fileArray.filter(
        (file) => file.type === 'application/pdf' || file.type.startsWith('image/')
      )
      
      if (validFiles.length === 0) {
        alert('Please upload PDF or image files only')
        return
      }
      
      // Immediately upload files when selected (especially during ongoing conversation)
      handleFileUpload(validFiles)
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileArray = Array.from(e.dataTransfer.files)
      const validFiles = fileArray.filter(
        (file) => file.type === 'application/pdf' || file.type.startsWith('image/')
      )
      
      if (validFiles.length === 0) {
        alert('Please upload PDF or image files only')
        return
      }
      
      // Immediately upload files when dropped
      handleFileUpload(validFiles)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoadingResponse) return

    // Add user message to chat
    const userMessage: ChatMessage = { 
      id: `user-${Date.now()}-${Math.random()}`,
      role: 'user', 
      content: message,
      timestamp: Date.now()
    }
    setChatMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsLoadingResponse(true)

    // Immediately scroll to bottom when user sends message
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }
    })

    try {
      console.log('=== Sending message ===', { message, sessionId })
      const response = await askQuestion(
        message,
        sessionId || undefined
      )

      console.log('=== Received response ===', { 
        answer: response.answer, 
        sessionId: response.sessionId,
        answerLength: response.answer?.length 
      })

      if (response.sessionId && !sessionId) {
        setSessionId(response.sessionId)
      }

      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}-${Math.random()}`,
        role: 'bot',
        content: response.answer || '',
        timestamp: Date.now()
      }

      console.log('=== Adding bot message to chat ===', { 
        content: botMessage.content,
        id: botMessage.id 
      })

      setChatMessages((prev) => {
        const updated = [...prev, botMessage]
        console.log('=== Updated chat messages ===', updated.map(m => ({ id: m.id, role: m.role, content: m.content.substring(0, 50) })))
        return updated
      })
      setIsLoadingResponse(false)
    } catch (error) {
      console.error('=== Error sending message ===', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
      const errorBotMessage: ChatMessage = {
        id: `bot-error-${Date.now()}-${Math.random()}`,
        role: 'bot',
        content: `Error: ${errorMessage}`,
        timestamp: Date.now()
      }
      setChatMessages((prev) => [...prev, errorBotMessage])
      setIsLoadingResponse(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      
      // If files are selected, upload them
      if (selectedFiles.length > 0) {
        console.log('Uploading files:', selectedFiles.map(f => f.name))
        handleFileUpload(selectedFiles)
        setSelectedFiles([]) // Clear selected files after starting upload
        setInputValue('') // Clear input
      } else if (inputValue.trim()) {
        // If no files but there's text input, send the message
        sendMessage(inputValue.trim())
      }
    }
  }

  const handleSendClick = () => {
    // If files are selected, upload them
    if (selectedFiles.length > 0) {
      handleFileUpload(selectedFiles)
      setSelectedFiles([]) // Clear selected files after starting upload
      setInputValue('') // Clear input
    } else if (inputValue.trim()) {
      // If no files but there's text input, send the message
      sendMessage(inputValue.trim())
    }
  }
  return (
    <section className="flex mx-auto bg-[#1b1b1b] relative overflow-hidden h-screen">
      {/* <section className="w-[1728px] h-[960px] flex mx-auto bg-[#000000] relative overflow-hidden"> */}
      {/* Certificate Images Display */}
      <div
        className="flex items-center gap-4 absolute"
        style={{
          width: '814px',
          height: '58.35846710205078px',
          transform: 'rotate(0deg)',
          opacity: 1,
          top: '61px',
          left: '28px',
        }}
      >
        <div className="flex-1 h-full">
          
        </div>
        <div className="flex-1 h-full">
          <img
            src="/certificate2.jpeg"
            alt="Certificate 2"
            className="w-full h-full object-contain"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
      {/* Left Menu */}
      <LeftMenu />

      {/* Main Content Area */}
      <main className="flex-1 !pt-20 relative flex flex-col items-center bg-[#1b1b1b] w-full min-h-0 overflow-hidden">
        <div
          className="mx-auto opacity-100 w-[536px] h-[55px] rounded-[60px] p-[1px]"
          style={{
            background: 'linear-gradient(90deg, rgba(96, 82, 169, 0.2) 0%, rgba(232, 232, 225, 0.2) 50%, rgba(199, 181, 193, 0.2) 75%, rgba(153, 83, 107, 0.2) 100%)',
            boxShadow: '0px 0px 15.79px 0px #A3BDCE4D',
          }}
        >
          <header
            className={cn(
              'relative flex items-center justify-between !px-6 py-4 h-full w-full',
              'rounded-[60px]'
            )}
            style={{
              background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.2) 0%, rgba(227, 196, 193, 0.2) 50%, rgba(225, 231, 203, 0.2) 75%, rgba(177, 162, 195, 0.2) 100%)',
            }}
          >
            {/* Left Section - Workspace/Contracts */}
            <div className="flex items-center gap-3">
              {/* Workspace Avatar - Mesh Image */}
              <img
                src="/mesh.jpg"
                alt="Workspace"
                className="shrink-0 opacity-100 rounded-[25.52px]"
                style={{
                  width: '26.779117584228516px',
                  height: '26.779117584228516px',
                  transform: 'rotate(90deg)',
                }}
              />

              <div className="flex flex-col">
                <span
                  className="text-gray-400 mb-0.5 font-medium text-[10px] leading-none tracking-normal"
                  style={{
                    fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                    fontStyle: 'normal',
                  }}
                >
                  Workspace
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-white font-medium text-xs leading-none tracking-normal"
                    style={{
                      fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    Contracts
                  </span>
                  <ChevronDownIcon
                    width={14}
                    height={14}
                    className="text-white opacity-60"
                  />
                </div>
              </div>
            </div>

            <div className="w-[1px] h-7 bg-[#C7B5C180]" />

            {/* Middle Section - Session/Smart Mining Engine */}
            <div className="flex items-center gap-4">
              <DocumentWithBadgeIcon
                width={16}
                height={16}
                className="text-white"
              />

              <div className="flex flex-col">
                <span
                  className="text-gray-400 mb-0.5 font-medium text-[10px] leading-none tracking-normal"
                  style={{
                    fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                    fontStyle: 'normal',
                  }}
                >
                  Session
                </span>
                <span
                  className="text-white font-medium text-xs leading-none tracking-normal"
                  style={{
                    fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                    fontStyle: 'normal',
                  }}
                >
                  Smart Mining Engine for Deep Insights
                </span>
              </div>

              <ShareIcon
                width={16}
                height={16}
                className="text-white opacity-80 cursor-pointer hover:opacity-100 transition-opacity"
              />
            </div>

            <div className="w-[1px] h-7 bg-[#C7B5C180]" />

            <BellIcon
              width={16}
              height={16}
              className="text-white opacity-80 cursor-pointer hover:opacity-100 transition-opacity"
            />
          </header>
        </div>

        {/* Chat Content Area - Centered */}
        <div className='flex flex-col pb-4 gap-4 items-center justify-between w-full flex-1 min-h-0 overflow-hidden'>
          <div 
            ref={chatContainerRef} 
            className="flex-1 flex flex-col overflow-y-auto py-12 w-full max-w-4xl min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Initial chat message - only show if no files uploaded and no messages */}
            {!hasUploadedFiles && chatMessages.length === 0 && (
              <div className="flex items-center gap-4 mb-8 w-full">
                {/* Mesh Image on the left */}
                <img
                  src="/mesh.jpg"
                  alt="AI Agent"
                  className="shrink-0 opacity-100 rounded-full"
                  style={{
                    width: '60px',
                    height: '60px',
                    transform: 'rotate(90deg)',
                  }}
                />
                <div className="flex flex-col gap-2 flex-1">
                  <p
                    className="text-white font-normal text-sm tracking-normal"
                    style={{
                      fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    You're now in Chat Mode.<br /> Upload the certificates or documents you'd like the AI agent to verify ✨
                  </p>
                </div>
              </div>
            )}

            {/* File Upload Zone - hide when files are uploaded */}
            {!hasUploadedFiles && (
              <div className="w-full max-w-3xl mx-auto">
                <div
                  onClick={handleUploadClick}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'relative rounded-[7px] flex flex-col items-center justify-center opacity-100',
                    'hover:opacity-90 transition-opacity cursor-pointer w-[814px] h-[168px]',
                    isDragging && 'opacity-80 border-2 border-cyan-400'
                  )}
                  style={{
                    background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.05) 0%, rgba(227, 196, 193, 0.05) 50%, rgba(225, 231, 203, 0.05) 75%, rgba(177, 162, 195, 0.05) 100%)',
                  }}
                >
                  {/* SVG border with controlled dash pattern */}
                  <svg
                    width="814"
                    height="168"
                    className="absolute inset-0 pointer-events-none"
                    style={{ borderRadius: '7px' }}
                  >
                    <defs>
                      <clipPath id="borderClip">
                        <rect x="0" y="0" width="814" height="168" rx="7" />
                      </clipPath>
                    </defs>
                    <rect
                      x="0.5"
                      y="0.5"
                      width="813"
                      height="167"
                      rx="6.5"
                      fill="none"
                      stroke="rgba(232, 232, 225, 0.15)"
                      strokeWidth="1"
                      strokeDasharray="10 10"
                      clipPath="url(#borderClip)"
                    />
                  </svg>
                  <UploadIcon
                    width={"31px"}
                    height={"31px"}
                    className="text-white opacity-70 mb-4"
                  />
                  <p
                    className="text-white mb-2 font-medium text-lg leading-[40px] tracking-[-0.25px] text-center"
                    style={{
                      fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    Drag & Drop files here or Upload it
                  </p>
                  <p
                    className="text-gray-400 font-normal text-sm leading-[16.2px] tracking-[-0.31px] text-center"
                    style={{
                      fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    You can upload your files in PDF, Excel, or CSV format (max 25 MB).
                  </p>
                </div>
              </div>
            )}

            {/* File upload progress - sticky component that always stays visible when files are uploaded */}
            {hasUploadedFiles && uploadFiles.length > 0 && (
              <div className="sticky top-0 z-10 flex items-start gap-4 mb-8 w-full bg-[#1b1b1b]">
               <div>
               <div className="flex flex-col gap-3 flex-1">
                  <div
                    className="p-4 opacity-100 min-h-[149px]"
                    style={{
                      width: '875px',
                      background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.2) 0%, rgba(227, 196, 193, 0.2) 50%, rgba(225, 231, 203, 0.2) 75%, rgba(177, 162, 195, 0.2) 100%)',
                      borderTopLeftRadius: '30px',
                      borderBottomRightRadius: '30px',
                      borderBottomLeftRadius: '30px',
                    }}
                  >
                    <FileUploadProgress
                      files={uploadFiles}
                      onCancel={cancelUpload}
                      onRemove={removeFile}
                    />
                  </div>
                  
                </div>
                {/* Action Buttons */}
                <div 
        className="flex items-center gap-2 justify-end !pt-[14px] !pr-[30px]"
      >
        <button
          className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
          aria-label="Clone"
        >
          <CloneIcon
            width={32}
            height={32}
            className="text-white"
          />
        </button>
        <button
          className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
          aria-label="Edit"
        >
          <EditIcon
            width={32}
            height={32}
            className="text-white"
          />
        </button>
        <button
          className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
          aria-label="Copy"
        >
          <CopyIcon
            width={32}
            height={32}
            className="text-white"
          />
        </button>
      </div>
               </div>
              </div>
            )}

            {/* Chat Messages */}
            {chatMessages.length > 0 && (
              <div 
                className="flex flex-col gap-4 w-full"
                style={{
                  marginTop: hasUploadedFiles && uploadFiles.length > 0 ? '50px' : undefined
                }}
              >
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start w-full ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                    style={{
                      gap: msg.role === 'bot' ? '16px' : '16px',
                    }}
                  >
                    {msg.role === 'bot' && (
                      <img
                        src="/mesh.jpg"
                        alt="AI Agent"
                        className="shrink-0 opacity-100 rounded-[25.52px]"
                        style={{
                          width: '51.04205703735356px',
                          height: '51.04205703735356px',
                          transform: 'rotate(90deg)',
                        }}
                      />
                    )}
                    {msg.role === 'user' ? (
                      <div className="flex flex-col items-end">
                        <div className="flex items-start" style={{ gap: '16px' }}>
                          <div
                            className="opacity-100"
                            style={{
                              maxWidth: '760px',
                              minWidth: 'fit-content',
                              opacity: 1,
                              borderTopLeftRadius: '30px',
                              borderTopRightRadius: '30px',
                              borderBottomLeftRadius: '30px',
                              borderBottomRightRadius: '0px',
                              background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.2) 0%, rgba(227, 196, 193, 0.2) 50%, rgba(225, 231, 203, 0.2) 75%, rgba(177, 162, 195, 0.2) 100%)',
                              padding: '12px 16px',
                            }}
                          >
                            <p
                              className="font-normal text-sm tracking-normal whitespace-pre-line break-words text-white"
                              style={{
                                fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                                fontStyle: 'normal',
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word',
                              }}
                            >
                              {msg.content}
                            </p>
                          </div>
                          <img
                            src="/demouser.jpg"
                            alt="User"
                            className="shrink-0 opacity-100 rounded-full"
                            style={{
                              width: '51.04205703735356px',
                              height: '51.04205703735356px',
                            }}
                          />
                        </div>
                        {/* Action Buttons for User Messages - aligned to left edge of message container */}
                        <div 
                          className="flex items-center gap-2 !pt-[14px]"
                          style={{
                            alignSelf: 'flex-start',
                          }}
                        >
                          <button
                            className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
                            aria-label="Back"
                          >
                            <CloneIcon
                              width={32}
                              height={32}
                              className="text-white"
                            />
                          </button>
                          <button
                            className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
                            aria-label="Edit"
                          >
                            <EditIcon
                              width={32}
                              height={32}
                              className="text-white"
                            />
                          </button>
                          <button
                            className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
                            aria-label="Copy"
                          >
                            <CopyIcon
                              width={32}
                              height={32}
                              className="text-white"
                            />
                          </button>
                        </div>
                      </div>
                    ) : (
                      msg.showCriteriaOptions ? (
                        <div
                          className="opacity-100 bg-[#1B1B1B]"
                          style={{
                            padding: '16px',
                            borderTopLeftRadius: '30px',
                            borderTopRightRadius: '30px',
                            borderBottomLeftRadius: '30px',
                            borderBottomRightRadius: '0px',
                            background: '#1B1B1B',
                          }}
                        >
                          <h2
                            className="text-white font-semibold text-lg mb-2"
                            style={{
                              fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                              fontStyle: 'normal',
                            }}
                          >
                            {msg.content}
                          </h2>
                          <p
                            className="text-white font-normal text-sm mb-6"
                            style={{
                              fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                              fontStyle: 'normal',
                            }}
                          >
                            Please provide the questions or information you want to include in your questionnaire. The clearer and more organized your inputs are, the more accurate and useful the final questionnaire will be.
                          </p>
                          <CriteriaOptions />
                        </div>
                      ) : (
                        <div
                          className="opacity-100 bg-[#1B1B1B]"
                          style={{
                            maxWidth: '760px',
                            padding: '16px',
                            borderTopLeftRadius: '30px',
                            borderTopRightRadius: '30px',
                            borderBottomLeftRadius: '30px',
                            borderBottomRightRadius: '0px',
                            background: '#1B1B1B',
                          }}
                        >
                          <p
                            className="font-normal text-sm tracking-normal whitespace-pre-line break-words text-white"
                            style={{
                              fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                              fontStyle: 'normal',
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word',
                            }}
                          >
                            {msg.content}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Loading indicator - show when waiting for response */}
            {isLoadingResponse && chatMessages.length > 0 && (
              <div className="flex items-start gap-4 mb-8 w-full">
                <img
                  src="/mesh.jpg"
                  alt="AI Agent"
                  className="shrink-0 opacity-100 rounded-[25.52px]"
                  style={{
                    width: '51.04205703735356px',
                    height: '51.04205703735356px',
                    transform: 'rotate(90deg)',
                  }}
                />
                <div
                  className="p-4 opacity-100"
                  style={{
                    background: '#1B1B1B',
                    borderTopLeftRadius: '30px',
                    borderBottomRightRadius: '30px',
                    borderBottomLeftRadius: '30px',
                  }}
                >
                  <p
                    className="text-white font-normal text-sm tracking-normal"
                    style={{
                      fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    Thinking...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Show selected files indicator - only show if files are selected but not yet uploaded */}
          {selectedFiles.length > 0 && (
            <div className="w-full max-w-4xl px-8 flex-shrink-0 pb-2">
              <p
                className="text-white font-normal text-sm tracking-normal mb-2"
                style={{
                  fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                  fontStyle: 'normal',
                }}
              >
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready. Press Enter to upload.
              </p>
            </div>
          )}

          <div
            className="opacity-100 h-[54px] w-full max-w-[1016px] rounded-[37px] border border-[#303030] flex-shrink-0 mb-4 mx-auto"
            style={{
              background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.05) 0%, rgba(177, 162, 195, 0.05) 100%)',
            }}
          >
            {/* Chat Input Bar */}
            <div className="flex items-center !px-2 gap-3 h-full w-full">
              {/* Hidden file input - always accessible */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              {/* Attach Button */}
              <button
                onClick={handleUploadClick}
                className="flex items-center justify-center gap-[10px] border border-[rgba(232,232,225,0.15)] opacity-100 transition-colors w-[78px] h-[33px] rounded-[35px] pt-[3px] pr-[6px] pb-[3px] pl-[6px]"
                style={{
                  background: 'linear-gradient(90deg, rgba(232, 232, 225, 0.2) 50%, rgba(199, 181, 193, 0.2) 75%)',
                  boxShadow: '0px 0px 10.3px 0px #FFFFFF05',
                }}
              >
                <PaperclipIcon
                  width={16}
                  height={16}
                  className="text-white opacity-70"
                />
                <span
                  className="opacity-100 text-white font-medium text-[11px] leading-none tracking-normal"
                  style={{
                    fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                    fontStyle: 'normal',
                  }}
                >
                  Attach
                </span>
              </button>

              {/* Folder Button */}
              <button
                className="bg-[rgba(26,26,26,0.9)] hover:bg-[rgba(26,26,26,1)] border border-[rgba(232,232,225,0.15)] flex items-center justify-center opacity-100 transition-colors gap-[10px] w-[34px] h-[34px] rounded-[35px]"
              >
                <FolderOpenIcon
                  width={16}
                  height={16}
                  className="text-white opacity-70"
                />
              </button>

              {/* Text Input */}
              <input
                type="text"
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-4 py-2 h-full rounded-lg bg-transparent text-white placeholder-gray-500 outline-none text-sm focus:border-[rgba(232,232,225,0.3)] transition-colors"
              />

              {/* Microphone Button */}
              <button>
                <MicIcon
                  width={20}
                  height={20}
                  className="text-white opacity-70"
                />
              </button>

              {/* Send Button */}
              <button
                onClick={handleSendClick}
                className="text-white transition-colors flex items-center justify-center opacity-100 gap-[10px] w-[74px] h-[34px] rounded-[35px] pt-[3px] pr-[6px] pb-[3px] pl-[6px]"
                style={{
                  background: 'linear-gradient(90deg, rgba(96, 82, 169, 0.2) 0%, rgba(232, 232, 225, 0.2) 50%, rgba(199, 181, 193, 0.2) 75%, rgba(153, 83, 107, 0.2) 100%)',
                  boxShadow: '0px 0px 10.3px 0px #00BEF10D',
                }}
              >
                <div
                  className="flex opacity-100 gap-[5px] w-[50px] h-[17px]"
                >
                  <span
                    className="opacity-100 flex items-center gap-2 font-medium text-[11px] leading-none tracking-normal"
                    style={{
                      fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    Send
                  </span>
                  <SendIcon
                    width={16}
                    height={16}
                    className="text-white"
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Right Menu */}
      <RightMenu />
    </section>
  );
}
