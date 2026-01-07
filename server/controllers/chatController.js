import { run } from "@openai/agents";
import { RouterAgent } from "../agents/routerAgent.js";
import { GeneralKnowledgeAgent } from "../agents/generalAgent.js";
import { CertificateValidationAgent } from "../agents/certificateAgent.js";
import { hasDocuments } from "../utils/process-pdf.js";   
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
        // If it's an object, skip and try other paths
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

    // Legacy fallbacks (for other structures)
    // 1. If final_output property exists
    if (result.final_output) {
      return typeof result.final_output === 'string' ? result.final_output.trim() : String(result.final_output).trim();
    }
  
    // 2. If output property exists
    if (result.output) {
      return typeof result.output === 'string' ? result.output.trim() : String(result.output).trim();
    }

    // 3. If messages array exists, get the last assistant message
    if (Array.isArray(result.messages) && result.messages.length > 0) {
      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage?.content) {
        return typeof lastMessage.content === 'string' 
          ? lastMessage.content.trim() 
          : String(lastMessage.content).trim();
      }
    }
  
    // 4. If generated items exist (top level)
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
  
    // 5. Last model response fallback
    if (result.lastModelResponse?.output_text) {
      return result.lastModelResponse.output_text.trim();
    }

    // 6. If result is a string itself
    if (typeof result === 'string') {
      return result.trim();
    }
  
    console.log("⚠️ getFinalOutput: Could not extract output from result structure");
    return "";
  }
  
  export async function chat(req, res) {
    const { question } = req.body;
  
    try {
      // Check if documents exist first (before routing)
      const documentsExist = await hasDocuments();
      console.log("📄 Documents exist in Pinecone:", documentsExist);
      
      const routerResult = await run(RouterAgent, question);
      
      // Debug: Check finalOutput (primary method per docs)
      if (routerResult?.finalOutput !== undefined) {
        console.log("🔍 finalOutput:", routerResult.finalOutput);
        console.log("🔍 finalOutput type:", typeof routerResult.finalOutput);
      }
      
      const decision = getFinalOutput(routerResult);
      console.log("🧭 Router Decision:", decision);
      
      if (!decision) {
        console.error("❌ Router Decision is empty!");
        console.error("finalOutput:", routerResult?.finalOutput);
        console.error("currentStep.output:", routerResult?.state?.currentStep?.output);
      }
  
      if (decision === "GENERAL") {
        const generalResult = await run(GeneralKnowledgeAgent, question);
        const answer = getFinalOutput(generalResult);
        return res.json({ answer });
      }
  
      if (decision === "CERTIFICATE") {
        // Check if documents exist - if not, prompt user to upload
        if (!documentsExist) {
          console.log("⚠️ Certificate question detected but no documents found");
          return res.json({
            answer: "Please upload your certificate document first so I can help you."
          });
        }
        
        // Documents exist, proceed with certificate validation
        console.log("✅ Documents found, processing certificate question");
        const certResult = await run(CertificateValidationAgent, question);
        const answer = getFinalOutput(certResult);
        return res.json({ answer });
      }
  
      // Fallback for unrecognized decisions
      return res.json({ answer: "I'm not sure how to handle that request." });
  
    } catch (err) {
      console.error("Chat Error:", err);
      res.status(500).json({ error: "Chat processing failed" });
    }
  }
  

