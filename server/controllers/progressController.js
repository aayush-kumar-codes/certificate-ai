import { getProgress, uploadProgress } from "../utils/uploadProgress.js";

/**
 * Get upload progress by uploadId
 */
export async function getUploadProgress(req, res) {
  try {
    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({ error: "uploadId is required" });
    }

    const progress = getProgress(uploadId);

    if (!progress) {
      return res.status(404).json({ error: "Upload not found" });
    }

    // If upload is completed, include final result
    const response = {
      ...progress,
    };

    // Get final result if available
    const uploadData = uploadProgress.get(uploadId);
    if (uploadData?.finalResult) {
      response.finalResult = uploadData.finalResult;
    }

    res.json(response);
  } catch (error) {
    console.error("Error getting upload progress:", error);
    res.status(500).json({ error: "Failed to get upload progress" });
  }
}
