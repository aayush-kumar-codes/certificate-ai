import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
});

/**
 * Thinking node: Always reasons about the user's message before responding
 * This ensures the AI thinks through the context, intent, and appropriate response
 */
export async function thinkingNode(state) {
  const { messages, uploadedDocument, criteria, validationResult, status } = state;
  
  // Get the last user message
  const lastUserMessage = messages[messages.length - 1];
  if (!lastUserMessage || lastUserMessage.role !== "user") {
    return state;
  }

  // Build context for thinking
  const conversationHistory = messages
    .slice(-10) // Last 10 messages for context
    .map(msg => `${msg.role}: ${msg.content}`)
    .join("\n");

  const thinkingPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a thoughtful AI assistant helping users validate certificates. Before responding, you should think through:

1. What is the user asking? (general question, certificate validation, follow-up, etc.)
2. What is the current context? (document uploaded, criteria set, validation done, etc.)
3. What should be the appropriate response? (answer question, ask for criteria, provide validation results, continue conversation, etc.)
4. Should you ask a follow-up question to continue the conversation naturally?

Current state:
- Document uploaded: ${uploadedDocument ? "Yes" : "No"}
- Criteria set: ${criteria ? "Yes" : "No"}
- Validation done: ${validationResult ? "Yes" : "No"}
- Status: ${status}

Think through this step by step, then provide your reasoning in a structured way.`
    ],
    [
      "human",
      `Conversation history:
{history}

User's latest message: {userMessage}

Think through what the user wants and what you should do next.`
    ]
  ]);

  const chain = thinkingPrompt.pipe(llm);
  
  try {
    const thinkingResponse = await chain.invoke({
      history: conversationHistory,
      userMessage: lastUserMessage.content
    });

    // Store thinking result in state (for debugging/logging, not sent to user)
    return {
      ...state,
      thinking: thinkingResponse.content
    };
  } catch (error) {
    console.error("Error in thinking node:", error);
    // Continue even if thinking fails
    return state;
  }
}

