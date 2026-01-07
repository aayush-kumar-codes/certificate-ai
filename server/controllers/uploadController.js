import { embedPdfToPinecone } from "../utils/process-pdf.js";
import { embedImageToPinecone } from "../utils/process-image.js";
import { getOrCreateSession } from "../utils/sessionManager.js";

export async function uploadPdf(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const mimetype = req.file.mimetype || "";
    
    // Get or create sessionId (optional - for linking uploads to chat sessions)
    const sessionId = req.body.sessionId;
    const { sessionId: currentSessionId } = getOrCreateSession(sessionId);

    // Parse and store in Pinecone DB based on file type
    if (mimetype === "application/pdf") {
      await embedPdfToPinecone(filePath);
      return res.json({
        message: "PDF uploaded and processed successfully",
        sessionId: currentSessionId
      });
    } else if (mimetype.startsWith("image/")) {
      await embedImageToPinecone(filePath);
      return res.json({
        message: "Image uploaded and processed successfully",
        sessionId: currentSessionId
      });
    } else {
      return res.status(400).json({ 
        error: "Unsupported file type. Please upload a PDF or image file." 
      });
    }
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to process file", details: err.message });
  }
}
