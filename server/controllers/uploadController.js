import { embedPdfToPinecone } from "../utils/process-pdf.js";
import { embedImageToPinecone } from "../utils/process-image.js";
import { getOrCreateSession } from "../utils/sessionManager.js";
import { createAgentGraph } from "../agents/agentGraph.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
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

    // Get or create session for LangGraph checkpointing
    const { threadId, checkpointer } = getOrCreateSession(currentSessionId);
    
    // Create agent graph with session-specific tools
    const graph = createAgentGraph(currentSessionId);
    const compiledGraph = graph.compile({
      checkpointer: checkpointer,
    });
    
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
    
    // Invoke graph with the prompt
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };
    
    const initialState = {
      messages: [new HumanMessage(prompt)],
      sessionId: currentSessionId,
      routerDecision: null,
      documentsExist: true, // Documents were just uploaded
    };
    
    const result = await compiledGraph.invoke(initialState, config);
    
    // Extract the final AI message from the result
    const messages = result.messages || [];
    const lastAIMessage = messages.filter(m => m instanceof AIMessage).pop();
    const agentMessage = lastAIMessage?.content 
      ? (typeof lastAIMessage.content === 'string' ? lastAIMessage.content : String(lastAIMessage.content))
      : '';

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
