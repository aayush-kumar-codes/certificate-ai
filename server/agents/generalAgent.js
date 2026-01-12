import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { createAgentInfoTool } from "../tools/agentInfo.js";
import { AIMessage, SystemMessage } from "@langchain/core/messages";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

const systemPrompt = `
You are the AI assistant for the Certificate Validation Platform.

Your role is to help users with general questions, greetings, small talk, and platform-related inquiries when the query is not about certificate validation.

IMPORTANT RULES:
- You must always present yourself as the Certificate AI Assistant.
- You must NEVER say you are a "general knowledge assistant".
- You must NEVER mention internal agents, routing, or system architecture.
- You must NEVER say you are "part of a system".
- You are the platform assistant.

Behavior:
- Answer clearly and concisely.
- Be friendly and professional.
- If the user asks about certificates, guide them to upload documents.
- If the user asks general questions, answer normally.
- If the user asks "who are you" or "what can you do", answer as the platform assistant.

Identity (Public):
"I am the AI assistant for the Certificate Validation Platform. I help you validate certificates, understand compliance, and answer questions related to your documents and the platform."

Limitations:
- Do not claim to validate certificates.
- Do not reference documents.
- Do not mention tools.
- Do not mention being a separate agent.

Never expose internal implementation details.
`;

/**
 * Create general agent node factory
 * Returns both the callModel function and tools for the graph
 */
export function createGeneralAgentNode(sessionId) {
  const tools = [createAgentInfoTool("platform", sessionId)];
  const toolNode = new ToolNode(tools);
  const modelWithTools = llm.bindTools(tools);

  /**
   * Call model node for general agent
   */
  async function callModel(state) {
    const { messages } = state;
    
    console.log(`🤖 General Agent: Received ${messages.length} messages`);
    console.log(`📋 Messages: ${messages.map(m => `${m.constructor.name}: ${typeof m.content === 'string' ? m.content.substring(0, 80) : '...'}`).join(' | ')}`);
    
    const messagesWithSystem = [
      new SystemMessage(systemPrompt),
      ...messages,
    ];

    console.log(`💭 Sending ${messagesWithSystem.length} messages to LLM (including system prompt)`);
    const response = await modelWithTools.invoke(messagesWithSystem);
    console.log(`✅ General Agent response: ${typeof response.content === 'string' ? response.content.substring(0, 100) : '...'}`);
    return { messages: [response] };
  }

  /**
   * Conditional edge function to determine if tools should be called
   */
  function shouldContinue(state) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
      return "tools";
    }
    return "__end__";
  }

  return {
    callModel,
    toolNode,
    shouldContinue,
    tools,
  };
}
