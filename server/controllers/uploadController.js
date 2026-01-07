import { embedPdfToPinecone } from "../utils/process-pdf.js";

export async function uploadPdf(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;

    // Parse PDF and store in Pinecone DB
    await embedPdfToPinecone(filePath);

    return res.json({
      message: "PDF uploaded and processed successfully"
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to process PDF", details: err.message });
  }
}
