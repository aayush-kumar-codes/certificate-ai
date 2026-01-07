
import { Agent } from "@openai/agents";

export const GeneralKnowledgeAgent = new Agent({
  name: "GeneralKnowledgeAgent",
  instructions: `
You are a general knowledge assistant.
Answer clearly and concisely.
Do NOT reference any documents.
`
});
