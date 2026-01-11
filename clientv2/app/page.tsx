'use client'

import React, { useState, useRef } from 'react'
import { LeftMenu } from '@/components/LeftMenu'
import { RightMenu } from '@/components/RightMenu'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DocumentWithBadgeIcon, ShareIcon, BellIcon, ChevronDownIcon, UploadIcon, MicIcon, PaperclipIcon, FolderOpenIcon, SendIcon, FileWithPaperclipIcon, CloseIcon } from '@/components/icons'
import { FileUploadProgress, FileUploadItem } from '@/components/FileUploadProgress'
import { uploadPDFs, UploadResponse } from '@/lib/api'

export default function Home() {
  const [uploadFiles, setUploadFiles] = useState<FileUploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [inputValue, setInputValue] = useState('ok here are the files')
  const [hasUploadedFiles, setHasUploadedFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map())

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

    // Set upload files immediately to show the progress component
    setUploadFiles(newFileItems)
    setHasUploadedFiles(true) // Hide upload zone and show chat interface

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
        (progress) => {
          // Update all files with same progress
          newFileItems.forEach((item) => {
            updateFileProgress(item.id, { progress })
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
      if (response.sessionId && !sessionId) {
        setSessionId(response.sessionId)
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
      
      // Store files for upload when Enter is pressed
      setSelectedFiles(validFiles)
      
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
      
      // Store files for upload when Enter is pressed
      setSelectedFiles(validFiles)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
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
      } else {
        console.log('No files selected')
      }
    }
  }

  const handleSendClick = () => {
    // If files are selected, upload them
    if (selectedFiles.length > 0) {
      handleFileUpload(selectedFiles)
      setSelectedFiles([]) // Clear selected files after starting upload
      setInputValue('') // Clear input
    }
  }
  return (
    <section className="flex mx-auto bg-[#1b1b1b] relative overflow-hidden min-h-screen">
      {/* <section className="w-[1728px] h-[960px] flex mx-auto bg-[#000000] relative overflow-hidden"> */}
      {/* Left Menu */}
      <LeftMenu />

      {/* Main Content Area */}
      <main className="flex-1 !pt-20 relative flex flex-col items-center bg-[#1b1b1b] w-full min-h-screen">
        <div
          className="mx-auto mt-8 opacity-100 w-[536px] h-[55px] rounded-[60px] p-[1px]"
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
                  boxShadow: '0px 0px 28.36px 0px #A3BDCE80',
                }}
              />

              <div className="flex flex-col">
                <span
                  className="text-gray-400 mb-0.5 font-medium text-[10px] leading-none tracking-normal"
                  style={{
                    fontFamily: 'Poppins, sans-serif',
                    fontStyle: 'normal',
                  }}
                >
                  Workspace
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-white font-medium text-xs leading-none tracking-normal"
                    style={{
                      fontFamily: 'Poppins, sans-serif',
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
                    fontFamily: 'Poppins, sans-serif',
                    fontStyle: 'normal',
                  }}
                >
                  Session
                </span>
                <span
                  className="text-white font-medium text-xs leading-none tracking-normal"
                  style={{
                    fontFamily: 'Poppins, sans-serif',
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
        <div className='flex flex-col !pt-10 !pb-10 gap-10 items-center justify-space-between h-full w-full'>
          <div className="flex-1 flex flex-col  px-8 py-12 w-full max-w-4xl">
            {/* Initial chat message - only show if no files uploaded */}
            {!hasUploadedFiles && (
              <div className="flex items-center !pt-10 gap-4 mb-8 w-full">
                <img
                  src="/mesh.jpg"
                  alt="AI Agent"
                  className="shrink-0 opacity-100 rounded-[25.52px]"
                  style={{
                    width: '51.04205703735356px',
                    height: '51.04205703735356px',
                    transform: 'rotate(90deg)',
                    boxShadow: '0px 0px 28.36px 0px #A3BDCE80',
                  }}
                />

                <div className="flex flex-col gap-2 flex-1">
                  <p
                    className="text-white font-normal text-sm tracking-normal"
                    style={{
                      fontFamily: 'Poppins, sans-serif',
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
              <div className="w-full max-w-3xl !pt-5 mx-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
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
                      fontFamily: 'Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    Drag & Drop files here or Upload it
                  </p>
                  <p
                    className="text-gray-400 font-normal text-sm leading-[16.2px] tracking-[-0.31px] text-center"
                    style={{
                      fontFamily: 'Poppins, sans-serif',
                      fontStyle: 'normal',
                    }}
                  >
                    You can upload your files in PDF, Excel, or CSV format (max 25 MB).
                  </p>
                </div>
              </div>
            )}

            {/* Chat message with file upload progress - show when files are uploaded */}
            {hasUploadedFiles && uploadFiles.length > 0 && (
              <div className="flex items-start gap-4 mb-8 w-full">
                <img
                  src="/mesh.jpg"
                  alt="User"
                  className="shrink-0 opacity-100 rounded-full"
                  style={{
                    width: '51.04205703735356px',
                    height: '51.04205703735356px',
                    transform: 'rotate(90deg)',
                    boxShadow: '0px 0px 28.36px 0px #A3BDCE80',
                  }}
                />
                <div className="flex flex-col gap-3 flex-1">
                  <div
                    className="rounded-[7px] p-4 w-full"
                    style={{
                      background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.1) 0%, rgba(227, 196, 193, 0.1) 50%, rgba(225, 231, 203, 0.1) 75%, rgba(177, 162, 195, 0.1) 100%)',
                      border: '1px solid rgba(232, 232, 225, 0.15)',
                    }}
                  >
                    <FileUploadProgress
                      files={uploadFiles}
                      onCancel={cancelUpload}
                      onRemove={removeFile}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Show selected files indicator */}
          {selectedFiles.length > 0 && uploadFiles.length === 0 && (
            <div className="w-full max-w-4xl px-8">
              <p
                className="text-white font-normal text-sm tracking-normal mb-2"
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  fontStyle: 'normal',
                }}
              >
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready. Press Enter to upload.
              </p>
            </div>
          )}

          <div
            className="opacity-100 h-[54px] w-[1016px] rounded-[37px] border border-[#303030]"
            style={{
              background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.05) 0%, rgba(177, 162, 195, 0.05) 100%)',
            }}
          >
            {/* Chat Input Bar */}
            <div className="flex items-center !px-2 gap-3 h-full w-full">
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
                    fontFamily: 'Poppins, sans-serif',
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
                      fontFamily: 'Poppins, sans-serif',
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
