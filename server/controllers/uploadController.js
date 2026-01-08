import { embedPdfToPinecone } from "../utils/process-pdf.js";
import { embedImageToPinecone } from "../utils/process-image.js";
import { getOrCreateSession } from "../utils/sessionManager.js";
import { run } from "@openai/agents";
import { CertificateValidationAgent } from "../agents/certificateAgent.js";

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
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const mimetype = req.file.mimetype || "";
    
    // Get or create sessionId (optional - for linking uploads to chat sessions)
    const sessionId = req.body.sessionId;
    const { sessionId: currentSessionId, session } = getOrCreateSession(sessionId);

    // Parse and store in Pinecone DB based on file type
    if (mimetype === "application/pdf") {
      await embedPdfToPinecone(filePath);
    } else if (mimetype.startsWith("image/")) {
      await embedImageToPinecone(filePath);
    } else {
      return res.status(400).json({ 
        error: "Unsupported file type. Please upload a PDF or image file." 
      });
    }

    // Invoke agent to ask about validation criteria
    const prompt = "A user just uploaded a certificate document. Ask them how they want to validate their certificate based on which criteria.";
    const agentResult = await run(CertificateValidationAgent, prompt, { session });
    const agentMessage = getFinalOutput(agentResult);

    return res.json({
      message: agentMessage || "Document uploaded successfully. How would you like to validate your certificate based on which criteria?",
      sessionId: currentSessionId
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to process file", details: err.message });
  }
}
