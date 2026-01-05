import { agent } from "./agent.js";

export async function askQuestion(query, chatHistory = []) {
  const finalState = await agent.invoke({
    messages: [...chatHistory, { role: "user", content: query }]
  });

  return {
    answer: finalState.messages[finalState.messages.length - 1].content,
    metadata: {
      docsUsed: finalState.retrievedDocs?.length || 0,
      question: finalState.lastQuestion,
      decisionLog: finalState.decisionLog
    }
  };
}
