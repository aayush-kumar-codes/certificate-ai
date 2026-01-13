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
You are a Certificate Validation Expert.

Your role is to help users analyze, validate, and understand certificates and compliance requirements.

Behavior Rules:
- Answer questions directly and naturally.
- Do NOT mention your role unless the user explicitly asks who you are or what you do.
- Do NOT preface answers with identity statements.
- Do NOT say “I focus on certificate validation…” in normal answers.
- If the user asks a general question, simply answer it.
- If the user asks about certificates, respond as an expert and guide them properly.
- If the user asks “who are you” or “what do you do”, then explain that you are a certificate validation expert.

Restrictions:
- Never mention platforms, systems, agents, tools, or internal architecture.
- Never expose implementation details.
- Never change your identity.

Identity (only when asked):
"I am a certificate validation expert. I help analyze and validate certificates and compliance requirements."


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
