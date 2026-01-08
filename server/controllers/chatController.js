import { run } from "@openai/agents";
import { RouterAgent } from "../agents/routerAgent.js";
import { GeneralKnowledgeAgent } from "../agents/generalAgent.js";
import { createCertificateValidationAgent } from "../agents/certificateAgent.js";
import { hasDocumentsForSession } from "../utils/documentQuery.js";
import { getOrCreateSession } from "../utils/sessionManager.js";
import { saveConversationMessage } from "../services/conversationService.js";   
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
    const { question, sessionId } = req.body;
  
    try {
      // Get or create session for conversation memory
      const { sessionId: currentSessionId, session, isNew } = getOrCreateSession(sessionId);
      console.log("🔗 Session ID:", currentSessionId);
      console.log(`💾 Memory Status: ${isNew ? 'NEW session - starting fresh conversation' : 'EXISTING session - conversation history preserved'}`);
      
      // Save user message to database
      try {
        await saveConversationMessage({
          sessionId: currentSessionId,
          role: "USER",
          content: question,
          metadata: {
            isNewSession: isNew,
            memoryActive: true,
          },
        });
      } catch (logError) {
        console.error("⚠️ Failed to log user message:", logError);
        // Continue execution even if logging fails
      }
      
      // Check if documents exist for this session (before routing)
      const documentsExist = await hasDocumentsForSession(currentSessionId);
      console.log("📄 Documents exist in Pinecone for session:", documentsExist);
      
      // Run router agent with session for memory
      const routerResult = await run(RouterAgent, question, { session });
      
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
        const generalResult = await run(GeneralKnowledgeAgent, question, { session });
        const answer = getFinalOutput(generalResult);
        console.log(`✅ Memory: Conversation stored in MemorySession (${currentSessionId.substring(0, 8)}...)`);
        
        // Save bot response to database
        let messageId = null;
        try {
          const savedMessage = await saveConversationMessage({
            sessionId: currentSessionId,
            role: "ASSISTANT",
            content: answer,
            routerDecision: decision,
            agentType: "GeneralKnowledgeAgent",
            metadata: {
              isNewSession: isNew,
              memoryActive: true,
            },
          });
          messageId = savedMessage.id;
        } catch (logError) {
          console.error("⚠️ Failed to log bot response:", logError);
          // Continue execution even if logging fails
        }
        
        return res.json({ 
          answer,
          sessionId: currentSessionId,
          memoryActive: true,
          isNewSession: isNew,
          ...(messageId && { messageId })
        });
      }
  
      if (decision === "CERTIFICATE") {
        // Handle upload-related queries even if no documents exist yet
        const lowerQuestion = question.toLowerCase().trim();
        const isUploadRelated = 
          lowerQuestion.includes("upload") || 
          lowerQuestion.includes("done") || 
          lowerQuestion.includes("it's done") ||
          lowerQuestion.includes("finished");
        
        // If user is confirming upload completion, check if documents exist
        if (isUploadRelated && !documentsExist) {
          // User might be confirming upload, but documents not indexed yet
          // Wait a moment and check again
          await new Promise(resolve => setTimeout(resolve, 2000));
          const documentsExistAfterWait = await hasDocumentsForSession(currentSessionId);
          
          if (!documentsExistAfterWait) {
            console.log("⚠️ Upload confirmation detected but documents not found after wait");
            const uploadWaitAnswer = "I'm waiting for your document upload. Please upload your certificate document first, then let me know when you're done.";
            
            // Save bot response to database
            let messageId = null;
            try {
              const savedMessage = await saveConversationMessage({
                sessionId: currentSessionId,
                role: "ASSISTANT",
                content: uploadWaitAnswer,
                routerDecision: decision,
                agentType: "CertificateValidationAgent",
                metadata: {
                  isNewSession: isNew,
                  memoryActive: true,
                  waitingForUpload: true,
                },
              });
              messageId = savedMessage.id;
            } catch (logError) {
              console.error("⚠️ Failed to log bot response:", logError);
            }
            
            return res.json({
              answer: uploadWaitAnswer,
              sessionId: currentSessionId,
              memoryActive: true,
              isNewSession: isNew,
              waitingForUpload: true,
              ...(messageId && { messageId })
            });
          }
        }
        
        // If no documents exist and not upload-related, prompt to upload
        if (!documentsExist && !isUploadRelated) {
          console.log("⚠️ Certificate question detected but no documents found");
          const uploadPromptAnswer = "Please upload your certificate document first so I can help you.";
          
          // Save bot response to database
          let messageId = null;
          try {
            const savedMessage = await saveConversationMessage({
              sessionId: currentSessionId,
              role: "ASSISTANT",
              content: uploadPromptAnswer,
              routerDecision: decision,
              agentType: "CertificateValidationAgent",
              metadata: {
                isNewSession: isNew,
                memoryActive: true,
              },
            });
            messageId = savedMessage.id;
          } catch (logError) {
            console.error("⚠️ Failed to log bot response:", logError);
          }
          
          return res.json({
            answer: uploadPromptAnswer,
            sessionId: currentSessionId,
            memoryActive: true,
            isNewSession: isNew,
            ...(messageId && { messageId })
          });
        }
        
        // Documents exist or upload-related query, proceed with certificate validation
        // Create agent with session-specific tool (includes sessionId filtering)
        const agent = createCertificateValidationAgent(currentSessionId);
        console.log("✅ Processing certificate question with memory");
        const certResult = await run(agent, question, { session });
        const answer = getFinalOutput(certResult);
        console.log(`✅ Memory: Conversation stored in MemorySession (${currentSessionId.substring(0, 8)}...)`);
        
        // Save bot response to database
        let messageId = null;
        try {
          const savedMessage = await saveConversationMessage({
            sessionId: currentSessionId,
            role: "ASSISTANT",
            content: answer,
            routerDecision: decision,
            agentType: "CertificateValidationAgent",
            metadata: {
              isNewSession: isNew,
              memoryActive: true,
              documentsExist,
            },
          });
          messageId = savedMessage.id;
        } catch (logError) {
          console.error("⚠️ Failed to log bot response:", logError);
          // Continue execution even if logging fails
        }
        
        return res.json({ 
          answer,
          sessionId: currentSessionId,
          memoryActive: true,
          isNewSession: isNew,
          ...(messageId && { messageId })
        });
      }
  
      // Fallback for unrecognized decisions
      const fallbackAnswer = "I'm not sure how to handle that request.";
      
      // Save bot response to database
      let messageId = null;
      try {
        const savedMessage = await saveConversationMessage({
          sessionId: currentSessionId,
          role: "ASSISTANT",
          content: fallbackAnswer,
          routerDecision: decision || "UNKNOWN",
          metadata: {
            isNewSession: isNew,
            memoryActive: true,
          },
        });
        messageId = savedMessage.id;
      } catch (logError) {
        console.error("⚠️ Failed to log bot response:", logError);
      }
      
      return res.json({ 
        answer: fallbackAnswer,
        sessionId: currentSessionId,
        memoryActive: true,
        isNewSession: isNew,
        ...(messageId && { messageId })
      });
  
    } catch (err) {
      console.error("Chat Error:", err);
      res.status(500).json({ error: "Chat processing failed" });
    }
  }
  

