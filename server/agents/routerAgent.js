import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { AgentGraphState } from "./graphState.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

// Schema for structured output to use as routing logic
const routeSchema = z.object({
  decision: z.enum(["GENERAL", "CERTIFICATE", "AGENT_INFO"]).describe(
    "The routing decision: GENERAL for normal questions, CERTIFICATE for certificate validation, AGENT_INFO for questions about the agent itself"
  ),
});

// Augment the LLM with schema for structured output
const routerLLM = llm.withStructuredOutput(routeSchema, {
  name: "router",
});

/**
 * Router node: Determines which agent should handle the user query
 */
export async function routerNode(state) {
  const { messages, sessionId, documentsExist } = state;
  
  // Get the last user message
  const lastMessage = messages[messages.length - 1];
  const userMessage = typeof lastMessage?.content === 'string' 
    ? lastMessage.content 
    : String(lastMessage?.content || "");
  
  const routerInstructions = `
You are a router agent that decides which agent should handle the user query.

Agents:
1. GENERAL - for normal questions, small talk, general knowledge, non-certificate questions (e.g., "what is the capital of India", "hello", "how are you")
2. CERTIFICATE - for certificate validation, expiry, document-based questions, questions about certificates, upload confirmations, validation requests
3. AGENT_INFO - for questions about the agent itself, its capabilities, identity, purpose, or limitations (e.g., "who are you", "what can you do", "what are your features", "tell me about yourself", "what is your purpose")

Context awareness:
- If user says "upload", "upload another", "upload one more doc" → CERTIFICATE
- If user says "done", "it's done", "uploaded" (and previous context was about upload) → CERTIFICATE
- If user says "validate", "go with same", "same" (in context of certificates) → CERTIFICATE
- If user asks general knowledge questions → GENERAL
- If user asks about certificates, validation, expiry → CERTIFICATE
- If user asks about the agent itself → AGENT_INFO

Agent self-awareness questions (route to AGENT_INFO):
- Identity questions: "who are you", "what are you", "introduce yourself", "what is your name"
- Capability questions: "what can you do", "what are your features", "what are your capabilities", "how can you help", "what do you do"
- Purpose questions: "what is your purpose", "why were you created", "what are you for", "why do you exist"
- Limitation questions: "what can't you do", "what are your limitations", "what are you not able to do"
- Meta questions: "tell me about yourself", "describe yourself", "what are you good at", "how do you work"

Your job is to determine the INTENT of the question based on conversation context, not whether documents are available.
- If the question is about the agent itself (identity, capabilities, purpose, limitations), route to AGENT_INFO.
- If the question is about certificates, validation, expiry, or document analysis, route to CERTIFICATE.
- Otherwise, route to GENERAL.

You have access to conversation history through messages, so use context to make better routing decisions.

Reply with ONLY one word:
GENERAL, CERTIFICATE, or AGENT_INFO
`;

  // Build messages array with system prompt and conversation history
  const messagesForRouter = [
    new SystemMessage(routerInstructions),
    ...messages,
  ];

  console.log(`🔀 Router: Processing ${messages.length} messages`);
  console.log(`📋 Router messages: ${messages.map(m => `${m.constructor.name}: ${typeof m.content === 'string' ? m.content.substring(0, 60) : '...'}`).join(' | ')}`);

  try {
    const decision = await routerLLM.invoke(messagesForRouter);
    console.log(`✅ Router decision: ${decision.decision}`);
    
    return {
      routerDecision: decision.decision,
    };
  } catch (error) {
    console.error("❌ Router error:", error);
    // Default to GENERAL on error
    return {
      routerDecision: "GENERAL",
    };
  }
}
