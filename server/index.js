import express from "express";
import dotenv from "dotenv";
import { upload } from "./utils/upload.js";
import { askQuestion } from "./askQuestion.js";
import { embedPdfToPinecone } from "./utils/process-pdf.js";
import { embedImageToPinecone } from "./utils/process-image.js";
import cors from "cors";
import { certificateEvaluationGraph } from "./graph/index.js";
import { getState, saveState, createThreadId } from "./graph/stateStorage.js";
import { STATUS } from "./graph/state.js";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors( {
  origin: "http://116.202.210.102:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const path = file.path;
    const mimetype = file.mimetype || "";

    // Get or create thread ID
    const threadId = req.body.threadId || createThreadId();

    // Load existing state or create new
    let currentState = getState(threadId);
    if (!currentState) {
      currentState = {
        messages: [],
        uploadedDocument: null,
        criteria: null,
        extractedFields: null,
        validationResult: null,
        status: STATUS.AWAITING_UPLOAD,
        threadId: threadId
      };
    }

    // Update state with uploaded document
    currentState.uploadedDocument = {
      path: path,
      mimetype: mimetype,
      filename: file.filename,
      originalname: file.originalname
    };

    // Save state before running graph
    saveState(threadId, currentState);

    // Run the graph starting from upload node
    const config = { configurable: { thread_id: threadId } };
    const result = await certificateEvaluationGraph.invoke(currentState, config);

    // Save updated state
    saveState(threadId, result);

    // Get the last assistant message
    const lastMessage = result.messages[result.messages.length - 1];

    // Also embed to Pinecone for backward compatibility (if needed)
    if (mimetype === "application/pdf") {
      await embedPdfToPinecone(path);
    } else if (mimetype.startsWith("image/")) {
      await embedImageToPinecone(path);
    }

    return res.json({
      message: lastMessage?.content || "Document uploaded successfully",
      threadId: threadId,
      status: result.status
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process file" });
  }
});

app.post("/ask", async (req, res) => {
  const { question, threadId, chatHistory } = req.body;
  
  // Log all incoming requests for debugging
  console.log("=== /ask Request ===");
  console.log("Question:", question);
  console.log("ThreadId:", threadId || "none");
  console.log("ChatHistory provided:", chatHistory !== undefined);
  console.log("ChatHistory type:", Array.isArray(chatHistory) ? "array" : typeof chatHistory);
  console.log("ChatHistory length:", Array.isArray(chatHistory) ? chatHistory.length : "N/A");
  console.log("Full request body keys:", Object.keys(req.body));
  
  try {
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // If threadId is provided, use certificate evaluation graph
    if (threadId) {
      console.log("=== Using ThreadId Path ===");
      console.log("ThreadId:", threadId);
      
      // Load existing state
      let currentState = getState(threadId);
      
      if (!currentState) {
        console.log("❌ Thread not found in state storage");
        return res.status(404).json({ 
          error: "Thread not found. Please upload a document first." 
        });
      }

      // Log existing chat history from state storage
      const existingMessages = currentState.messages || [];
      console.log("✅ Thread found in state storage");
      console.log("📋 Chat History from State Storage:");
      console.log("  - Total messages:", existingMessages.length);
      console.log("  - Status:", currentState.status);
      console.log("  - Has uploaded document:", !!currentState.uploadedDocument);
      console.log("  - Has criteria:", !!currentState.criteria);
      console.log("  - Has validation result:", !!currentState.validationResult);
      
      if (existingMessages.length > 0) {
        console.log("  - Message history preview:");
        existingMessages.slice(-3).forEach((msg, idx) => {
          console.log(`    [${existingMessages.length - 3 + idx}] ${msg.role}: ${msg.content?.substring(0, 50)}...`);
        });
      } else {
        console.log("  - ⚠️ No previous messages in state");
      }

      // Add user message to state
      currentState.messages = [
        ...currentState.messages,
        {
          role: "user",
          content: question
        }
      ];
      
      console.log("➕ Added new user message. Total messages now:", currentState.messages.length);

      // Save state before running graph
      saveState(threadId, currentState);

      // Run the graph from conversation node
      // We'll use streamEvents or invoke with proper routing
      const config = { configurable: { thread_id: threadId } };
      
      // Determine which node to start from based on current state
      let result;
      if (currentState.status === STATUS.AWAITING_UPLOAD) {
        // Shouldn't happen if upload was done, but handle it
        result = await certificateEvaluationGraph.invoke(currentState, config);
      } else {
        // Continue from conversation node
        result = await certificateEvaluationGraph.invoke(currentState, config);
      }

      // Save updated state
      saveState(threadId, result);

      // Get the last assistant message
      const lastMessage = result.messages[result.messages.length - 1];
      
      // Log final state after processing
      console.log("✅ Conversation completed");
      console.log("  - Final message count:", result.messages.length);
      console.log("  - Final status:", result.status);
      console.log("  - Last message role:", lastMessage?.role);
      console.log("  - Response length:", lastMessage?.content?.length || 0);

      return res.json({
        answer: lastMessage?.content || "No response generated",
        threadId: threadId,
        status: result.status,
        validationResult: result.validationResult,
        extractedFields: result.extractedFields,
        messageCount: result.messages.length, // Include for debugging
        hasHistory: result.messages.length > 1 // Indicates conversation history exists
      });
    } else {
      // No threadId - handle general questions or create new conversation
      // For certificate validation, user should upload first, but we can handle general questions
      const chatHistoryArray = chatHistory || [];
      
      // Verify if chatHistory exists and has content
      const hasHistory = Array.isArray(chatHistoryArray) && chatHistoryArray.length > 0;
      console.log("=== No ThreadId - Using Frontend Chat History ===");
      console.log("📋 Chat History from Request Body:");
      console.log("  - Has history:", hasHistory);
      console.log("  - History length:", chatHistoryArray?.length || 0);
      console.log("  - History provided in request:", chatHistory !== undefined);
      console.log("  - History type:", Array.isArray(chatHistoryArray) ? "array" : typeof chatHistoryArray);
      
      if (hasHistory) {
        console.log("  - History preview (last 3 messages):");
        chatHistoryArray.slice(-3).forEach((msg, idx) => {
          console.log(`    [${chatHistoryArray.length - 3 + idx}] ${msg.role}: ${msg.content?.substring(0, 50)}...`);
        });
      } else {
        console.log("  - ⚠️ No chat history provided - starting new conversation");
      }
      
      // Check if it's a general question (hi, hello, etc.)
      const lowerQuestion = question.toLowerCase().trim();
      const isGeneralQuestion = 
        lowerQuestion.startsWith("hi") || 
        lowerQuestion.startsWith("hello") || 
        lowerQuestion.startsWith("hey");
      
      if (isGeneralQuestion) {
        // For general questions without threadId, use the agent
        console.log("Calling askQuestion with history:", hasHistory ? `${chatHistoryArray.length} messages` : "empty");
        const result = await askQuestion(question, hasHistory ? chatHistoryArray : []);
        return res.json({
          answer: result.answer,
          threadId: null,
          status: "general_conversation",
          hasHistory: hasHistory // Include in response for debugging
        });
      } else {
        // For certificate-related questions without threadId, suggest uploading
        return res.json({
          answer: "I'd be happy to help you validate a certificate! To get started, please upload a certificate document first. Once you upload it, I'll help you set up the validation criteria. 📄",
          threadId: null,
          status: "awaiting_upload",
          hasHistory: hasHistory // Include in response for debugging
        });
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate answer" });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));