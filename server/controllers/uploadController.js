import { embedPdfToPinecone } from "../utils/process-pdf.js";
import { embedImageToPinecone } from "../utils/process-image.js";
import { getOrCreateSession } from "../utils/sessionManager.js";
import { run } from "@openai/agents";
import { createCertificateValidationAgent } from "../agents/certificateAgent.js";
import { randomUUID } from "crypto";
import { addDocument, getDocumentCount, getDocumentsBySession, getNextDocumentIndex } from "../utils/documentRegistry.js";
import { getDocumentCountBySession } from "../utils/documentQuery.js";
import { 
  initializeProgress, 
  updateFileProgress, 
  setCurrentFile, 
  completeUpload, 
  setUploadError,
  uploadProgress
} from "../utils/uploadProgress.js";

function getFinalOutput(result) {
  if (!result) {
    console.log("⚠️ getFinalOutput: result is null/undefined");
    return "";
  }

  // According to OpenAI Agents SDK docs: result.finalOutput is the primary way to get output
  if (result.finalOutput !== undefined) {
    if (typeof result.finalOutput === 'string') {
      return result.finalOutput.trim();
    }
    // If finalOutput is an object/array, try to extract text from it
    if (typeof result.finalOutput === 'object') {
      // Check if it's an array of content items
      if (Array.isArray(result.finalOutput)) {
        for (const item of result.finalOutput) {
          if (item?.type === "output_text" && item?.text) {
            return item.text.trim();
          }
          if (typeof item === 'string') {
            return item.trim();
          }
        }
      }
      // Check if it has a text property
      if (result.finalOutput.text && typeof result.finalOutput.text === 'string') {
        return result.finalOutput.text.trim();
      }
    }
  }

  // Handle OpenAI Agents SDK structure: result.state.*
  if (result.state) {
    // 1. Check currentStep.output (most direct path) - must be a string
    if (result.state.currentStep?.output) {
      const output = result.state.currentStep.output;
      if (typeof output === 'string') {
        return output.trim();
      }
    }

    // 2. Check lastModelResponse.providerData.output_text
    if (result.state.lastModelResponse?.providerData?.output_text) {
      const outputText = result.state.lastModelResponse.providerData.output_text;
      if (typeof outputText === 'string') {
        return outputText.trim();
      }
    }

    // 3. Check lastModelResponse.output[0].content[0].text
    if (result.state.lastModelResponse?.output?.[0]?.content?.[0]?.text) {
      const text = result.state.lastModelResponse.output[0].content[0].text;
      if (typeof text === 'string') {
        return text.trim();
      }
    }

    // 4. Check generatedItems (nested in state)
    if (Array.isArray(result.state.generatedItems) && result.state.generatedItems.length) {
      const item = result.state.generatedItems[0];
      if (item?.rawItem?.content?.[0]?.text) {
        const text = item.rawItem.content[0].text;
        if (typeof text === 'string') {
          return text.trim();
        }
      }
    }
  }

  // Legacy fallbacks
  if (result.final_output) {
    return typeof result.final_output === 'string' ? result.final_output.trim() : String(result.final_output).trim();
  }
  
  if (result.output) {
    return typeof result.output === 'string' ? result.output.trim() : String(result.output).trim();
  }

  if (Array.isArray(result.messages) && result.messages.length > 0) {
    const lastMessage = result.messages[result.messages.length - 1];
    if (lastMessage?.content) {
      return typeof lastMessage.content === 'string' 
        ? lastMessage.content.trim() 
        : String(lastMessage.content).trim();
    }
  }
  
  if (Array.isArray(result.generatedItems) && result.generatedItems.length) {
    let text = "";
    for (const item of result.generatedItems) {
      const content = item.rawItem?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c.type === "output_text" && c.text) {
            text += c.text;
          }
        }
      }
    }
    if (text.trim()) {
      return text.trim();
    }
  }
  
  if (result.lastModelResponse?.output_text) {
    return result.lastModelResponse.output_text.trim();
  }

  if (typeof result === 'string') {
    return result.trim();
  }
  
  console.log("⚠️ getFinalOutput: Could not extract output from result structure");
  return "";
}

export async function uploadPdf(req, res) {
  // Generate upload ID for progress tracking
  const uploadId = randomUUID();
  
  try {
    // Handle both single file (req.file) and multiple files (req.files)
    const files = req.files || (req.file ? [req.file] : []);
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Get or create sessionId
    const sessionId = req.body.sessionId;
    const { sessionId: currentSessionId, session } = getOrCreateSession(sessionId);

    // Initialize progress tracking
    initializeProgress(uploadId, files.length);

    // Return upload ID immediately so frontend can start polling
    res.status(202).json({ 
      uploadId,
      message: "Upload started",
      totalFiles: files.length
    });

    const uploadedDocuments = [];
    const errors = [];

    // Process each file sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = file.path;
      const mimetype = file.mimetype || "";
      const fileName = file.originalname || file.filename || `file-${i + 1}`;

      // Update current file being processed
      setCurrentFile(uploadId, i);
      updateFileProgress(uploadId, fileName, 10, 'uploading');

      // Validate file type
      if (mimetype !== "application/pdf" && !mimetype.startsWith("image/")) {
        updateFileProgress(uploadId, fileName, 0, 'error');
        errors.push({
          fileName,
          error: "Unsupported file type. Please upload a PDF or image file."
        });
        continue;
      }

      try {
        updateFileProgress(uploadId, fileName, 30, 'processing');

        // Generate unique document ID
        const documentId = randomUUID();
        
        // Get next document index for this session
        const documentIndex = getNextDocumentIndex(currentSessionId);

        // Prepare metadata
        const metadata = {
          documentId,
          sessionId: currentSessionId,
          documentIndex,
          documentName: fileName,
        };

        updateFileProgress(uploadId, fileName, 50, 'processing');

        // Process and embed based on file type
        if (mimetype === "application/pdf") {
          await embedPdfToPinecone(filePath, metadata);
        } else if (mimetype.startsWith("image/")) {
          await embedImageToPinecone(filePath, metadata);
        }

        updateFileProgress(uploadId, fileName, 80, 'processing');

        // Register document in registry
        const documentInfo = addDocument(
          currentSessionId,
          documentId,
          fileName,
          documentIndex
        );

        uploadedDocuments.push({
          documentId,
          documentName: fileName,
          documentIndex,
        });

        updateFileProgress(uploadId, fileName, 100, 'completed');
        console.log(`✅ Successfully processed file ${i + 1}/${files.length}: ${fileName}`);
      } catch (fileError) {
        console.error(`❌ Error processing file ${fileName}:`, fileError);
        updateFileProgress(uploadId, fileName, 0, 'error');
        errors.push({
          fileName,
          error: fileError.message || "Failed to process file"
        });
      }
    }

    // If no files were successfully processed, mark as error
    if (uploadedDocuments.length === 0) {
      setUploadError(uploadId, "Failed to process any files");
      return;
    }

    // Verify document count from Pinecone (with retry for eventual consistency)
    let documentCount = uploadedDocuments.length;
    try {
      // Wait a bit for Pinecone to process
      await new Promise(resolve => setTimeout(resolve, 1500));
      const pineconeCount = await getDocumentCountBySession(currentSessionId);
      if (pineconeCount > 0) {
        documentCount = pineconeCount;
      }
    } catch (countError) {
      console.warn("⚠️ Could not verify document count from Pinecone:", countError.message);
      // Use registry count as fallback
      documentCount = getDocumentCount(currentSessionId);
    }

    // Create agent with session-specific tool (includes sessionId filtering)
    const agent = createCertificateValidationAgent(currentSessionId);
    
    // Check if this is a subsequent upload (not the first)
    // Get document count before this upload to determine if it's subsequent
    const existingCountBeforeUpload = documentCount - uploadedDocuments.length;
    const isSubsequentUpload = existingCountBeforeUpload > 0;
    
    // Invoke agent with different prompts based on upload type
    const documentCountText = documentCount === 1 ? "1 certificate document" : `${documentCount} certificate documents`;
    let prompt;
    
    if (isSubsequentUpload) {
      // Subsequent upload - acknowledge and ask about validation criteria
      prompt = `A user just uploaded an additional certificate document. You now have ${documentCountText} total in this session. Acknowledge the new upload and ask if they want to validate this new certificate using the same criteria as before, or if they want to use different criteria.`;
    } else {
      // First upload
      prompt = `A user just uploaded ${documentCountText}. Ask them how they want to validate their certificate(s) based on which criteria.`;
    }
    
    const agentResult = await run(agent, prompt, { session });
    const agentMessage = getFinalOutput(agentResult);

    // Get all documents for this session
    const allDocuments = getDocumentsBySession(currentSessionId);

    // Store final result in progress for frontend to retrieve
    const finalResult = {
      message: agentMessage || `Document${documentCount > 1 ? 's' : ''} uploaded successfully. How would you like to validate your certificate${documentCount > 1 ? 's' : ''} based on which criteria?`,
      sessionId: currentSessionId,
      documentCount: documentCount,
      documents: uploadedDocuments,
      allDocuments: allDocuments.map(doc => ({
        documentId: doc.documentId,
        documentName: doc.documentName,
        documentIndex: doc.documentIndex
      })),
      errors: errors.length > 0 ? errors : undefined
    };

    // Store final result and mark as completed
    const upload = uploadProgress.get(uploadId);
    if (upload) {
      upload.finalResult = finalResult;
      completeUpload(uploadId);
    }
  } catch (err) {
    console.error("Upload error:", err);
    // Make sure error is stored in progress tracker
    // Note: Response already sent, so we can't send another response
    // Frontend will poll and get the error status
    try {
      setUploadError(uploadId, err.message || "Failed to process files");
    } catch (progressError) {
      console.error("Failed to set upload error in progress tracker:", progressError);
    }
  }
}
