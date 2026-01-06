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
  const { question, threadId } = req.body;
  try {
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // If threadId is provided, use certificate evaluation graph
    if (threadId) {
      // Load existing state
      let currentState = getState(threadId);
      
      if (!currentState) {
        return res.status(404).json({ 
          error: "Thread not found. Please upload a document first." 
        });
      }

      // Add user message to state
      currentState.messages = [
        ...currentState.messages,
        {
          role: "user",
          content: question
        }
      ];

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

      return res.json({
        answer: lastMessage?.content || "No response generated",
        threadId: threadId,
        status: result.status,
        validationResult: result.validationResult,
        extractedFields: result.extractedFields
      });
    } else {
      // No threadId - handle general questions or create new conversation
      // For certificate validation, user should upload first, but we can handle general questions
      const { chatHistory = [] } = req.body;
      
      // Check if it's a general question (hi, hello, etc.)
      const lowerQuestion = question.toLowerCase().trim();
      const isGeneralQuestion = 
        lowerQuestion.startsWith("hi") || 
        lowerQuestion.startsWith("hello") || 
        lowerQuestion.startsWith("hey");
      
      if (isGeneralQuestion) {
        // For general questions without threadId, use the agent
        const result = await askQuestion(question, chatHistory);
        return res.json({
          answer: result.answer,
          threadId: null,
          status: "general_conversation"
        });
      } else {
        // For certificate-related questions without threadId, suggest uploading
        return res.json({
          answer: "I'd be happy to help you validate a certificate! To get started, please upload a certificate document first. Once you upload it, I'll help you set up the validation criteria. 📄",
          threadId: null,
          status: "awaiting_upload"
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