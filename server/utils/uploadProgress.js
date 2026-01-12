// Progress tracking for file uploads
export const uploadProgress = new Map();

/**
 * Initialize progress for an upload
 * @param {string} uploadId - Unique upload identifier
 * @param {number} totalFiles - Total number of files to process
 */
export function initializeProgress(uploadId, totalFiles) {
  uploadProgress.set(uploadId, {
    uploadId,
    totalFiles,
    currentFile: 0,
    overallProgress: 0,
    fileProgress: new Map(), // Map of fileName -> progress
    status: 'uploading', // 'uploading' | 'processing' | 'completed' | 'error'
    startTime: Date.now(),
  });
}

/**
 * Update progress for a specific file
 * @param {string} uploadId - Upload identifier
 * @param {string} fileName - Name of the file
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} status - Current status ('uploading' | 'processing' | 'completed' | 'error')
 */
export function updateFileProgress(uploadId, fileName, progress, status = 'processing') {
  const upload = uploadProgress.get(uploadId);
  if (!upload) {
    console.warn(`Upload ${uploadId} not found`);
    return;
  }

  // Clamp progress between 0 and 100
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  
  upload.fileProgress.set(fileName, {
    fileName,
    progress: clampedProgress,
    status,
  });

  // Calculate overall progress
  const fileProgresses = Array.from(upload.fileProgress.values());
  const totalProgress = fileProgresses.reduce((sum, fp) => sum + fp.progress, 0);
  upload.overallProgress = Math.round(totalProgress / upload.totalFiles);

  // Update upload status
  if (status === 'error') {
    upload.status = 'error';
  } else if (upload.overallProgress >= 100) {
    upload.status = 'completed';
  } else if (upload.overallProgress > 0) {
    upload.status = 'processing';
  }
}

/**
 * Update current file being processed
 * @param {string} uploadId - Upload identifier
 * @param {number} fileIndex - Index of current file (0-based)
 */
export function setCurrentFile(uploadId, fileIndex) {
  const upload = uploadProgress.get(uploadId);
  if (upload) {
    upload.currentFile = fileIndex;
  }
}

/**
 * Get progress for an upload
 * @param {string} uploadId - Upload identifier
 * @returns {Object|null} Progress object or null if not found
 */
export function getProgress(uploadId) {
  const upload = uploadProgress.get(uploadId);
  if (!upload) {
    return null;
  }

  return {
    uploadId: upload.uploadId,
    totalFiles: upload.totalFiles,
    currentFile: upload.currentFile,
    overallProgress: upload.overallProgress,
    status: upload.status,
    files: Array.from(upload.fileProgress.values()),
    elapsedTime: Date.now() - upload.startTime,
  };
}

/**
 * Mark upload as completed
 * @param {string} uploadId - Upload identifier
 */
export function completeUpload(uploadId) {
  const upload = uploadProgress.get(uploadId);
  if (upload) {
    upload.status = 'completed';
    upload.overallProgress = 100;
    // Mark all files as completed
    upload.fileProgress.forEach((fp) => {
      fp.progress = 100;
      fp.status = 'completed';
    });
  }
}

/**
 * Mark upload as error
 * @param {string} uploadId - Upload identifier
 * @param {string} error - Error message
 */
export function setUploadError(uploadId, error) {
  const upload = uploadProgress.get(uploadId);
  if (upload) {
    upload.status = 'error';
    upload.error = error;
  }
}

/**
 * Clean up old progress entries (older than 1 hour)
 */
export function cleanupOldProgress() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [uploadId, upload] of uploadProgress.entries()) {
    if (upload.startTime < oneHourAgo) {
      uploadProgress.delete(uploadId);
    }
  }
}

// Cleanup old entries every 30 minutes
setInterval(cleanupOldProgress, 30 * 60 * 1000);
