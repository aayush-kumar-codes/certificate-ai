import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js";
import Tesseract from "tesseract.js";

/**
 * Extract text from a document file (PDF or image)
 * @param {string} filePath - Path to the file
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
export async function extractTextFromDocument(filePath, mimetype) {
  if (mimetype === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    return pdfData.text;
  } else if (mimetype.startsWith("image/")) {
    const { data: { text } } = await Tesseract.recognize(filePath, "eng");
    return text || "";
  } else {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }
}

