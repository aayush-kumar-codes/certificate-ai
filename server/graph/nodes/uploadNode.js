import { STATUS } from "../state.js";
import { extractTextFromDocument } from "../utils/documentExtractor.js";

/**
 * Upload node: Handles document upload and sets status to awaiting_criteria
 */
export async function uploadNode(state) {
  const { uploadedDocument } = state;
  
  if (!uploadedDocument) {
    return {
      ...state,
      status: STATUS.AWAITING_UPLOAD,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "Please upload a certificate document to begin evaluation."
        }
      ]
    };
  }

  // Extract text from the document
  let documentText = "";
  try {
    documentText = await extractTextFromDocument(
      uploadedDocument.path,
      uploadedDocument.mimetype
    );
  } catch (error) {
    console.error("Error extracting text from document:", error);
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "I encountered an error processing your document. Please try uploading again."
        }
      ]
    };
  }

  // Update state with extracted text and set status to awaiting criteria
  const updatedDocument = {
    ...uploadedDocument,
    extractedText: documentText
  };

  // Check if criteria were already set (new upload after criteria)
  const hadCriteria = state.criteria !== null;
  
  // Reset validation-related fields if a new document is uploaded
  const resetState = {
    ...state,
    uploadedDocument: updatedDocument,
    extractedFields: null,
    validationResult: null
  };

  if (hadCriteria) {
    // New document uploaded, but criteria exist - reset criteria and ask to reconfirm
    return {
      ...resetState,
      criteria: null,
      status: STATUS.AWAITING_CRITERIA,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "I've received a new certificate document. Please specify how you would like me to evaluate this certificate. For example, you can specify criteria like agency name and expiry date."
        }
      ]
    };
  } else {
    // First upload
    return {
      ...resetState,
      status: STATUS.AWAITING_CRITERIA,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "Thank you for uploading your certificate. How would you like me to evaluate your certificate? For example, you can specify criteria like agency name and expiry date."
        }
      ]
    };
  }
}

