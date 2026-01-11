'use client'

import React from 'react'
import { FileWithPaperclipIcon, CloseIcon } from './icons'
import { cn } from '@/lib/utils'

export interface FileUploadItem {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
}

interface FileUploadProgressProps {
  files: FileUploadItem[]
  onCancel?: (fileId: string) => void
  onRemove?: (fileId: string) => void
}

export function FileUploadProgress({ files, onCancel, onRemove }: FileUploadProgressProps) {
  if (files.length === 0) return null

  return (
    <div className="relative w-full">
      {/* Header text - absolutely positioned */}
      <p
        className="text-white font-normal text-sm tracking-normal absolute"
        style={{
          fontFamily: 'Poppins, sans-serif',
          fontStyle: 'normal',
          width: '394px',
          height: '21px',
          opacity: 1,
          top: '24px',
          left: '28px',
          transform: 'rotate(0deg)',
        }}
      >
        Ok here are the files
      </p>

      {/* Files container - horizontal layout with top padding to avoid overlap */}
      <div 
        className="flex items-center gap-3 flex-wrap"
        style={{
          paddingTop: '60px', // 24px (top) + 21px (text height) + 15px (spacing)
        }}
      >
        {files.map((fileItem) => (
          <FileProgressItem
            key={fileItem.id}
            fileItem={fileItem}
            onCancel={onCancel}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}

interface FileProgressItemProps {
  fileItem: FileUploadItem
  onCancel?: (fileId: string) => void
  onRemove?: (fileId: string) => void
}

function FileProgressItem({ fileItem, onCancel, onRemove }: FileProgressItemProps) {
  const { id, file, progress, status, error } = fileItem
  const displayProgress = Math.min(Math.max(progress, 0), 100)
  const isCompleted = status === 'completed'
  const isError = status === 'error'

  const handleClose = () => {
    if (status === 'uploading' && onCancel) {
      onCancel(id)
    } else if (onRemove) {
      onRemove(id)
    }
  }

  return (
    <div
      className={cn(
        "flex items-center justify-start gap-3 relative p-3 px-4 border",
        isError ? "border-red-500/30" : "border-[rgba(232,232,225,0.15)]"
      )}
      style={{
        width: '264.6254577636719px',
        height: '58.35846710205078px',
        opacity: 1,
        top: '0px',
        borderRadius: '7.04px',
        background: isError
          ? 'linear-gradient(90deg, rgba(232, 232, 225, 0.08) 50%, rgba(199, 181, 193, 0.08) 75%)'
          : 'linear-gradient(90deg, rgba(232, 232, 225, 0.12) 50%, rgba(199, 181, 193, 0.12) 75%)',
        boxShadow: '0px 1px 2px 0px rgba(255, 255, 255, 0.05) inset, 0px 0px 1px 0px rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Left Section - File Icon */}
      <div
        className="flex items-center justify-center shrink-0 w-10 h-10 rounded-md bg-white/8"
      >
        <FileWithPaperclipIcon
          width={20}
          height={20}
          className={cn(
            isError ? "text-red-400" : "text-cyan-300"
          )}
        />
      </div>

      {/* Middle Section - File Name and Progress Bar */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <span
          className={cn(
            "truncate font-normal text-sm leading-none tracking-normal",
            isError ? "text-red-300" : "text-white"
          )}
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontStyle: 'normal',
          }}
          title={file.name}
        >
          {file.name}
        </span>

        {/* Progress Bar */}
        <div
          className="relative h-2 w-full rounded-full overflow-hidden bg-[rgba(45,55,70,0.8)]"
        >
          {/* Progress Fill with Gradient */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isError && "bg-red-500"
            )}
            style={{
              width: `${displayProgress}%`,
              background: isError
                ? undefined
                : 'linear-gradient(90deg, rgba(135, 206, 250, 1) 0%, rgba(100, 181, 246, 0.9) 50%, rgba(80, 165, 255, 0.8) 100%)',
            }}
          />
        </div>
      </div>

      {/* Right Section - Close Button and Percentage */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          onClick={handleClose}
          className="p-1 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none outline-none"
          aria-label={status === 'uploading' ? "Cancel upload" : "Remove file"}
        >
          <CloseIcon
            width={16}
            height={16}
            className={cn(
              isError ? "text-red-300" : "text-white"
            )}
          />
        </button>

        <span
          className={cn(
            "font-normal text-sm leading-none tracking-normal whitespace-nowrap",
            isError ? "text-red-300" : "text-white"
          )}
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontStyle: 'normal',
          }}
        >
          {isError ? 'Error' : `${Math.round(displayProgress)}%`}
        </span>
      </div>
    </div>
  )
}
