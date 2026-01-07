
import { Agent } from "@openai/agents";

export const RouterAgent = new Agent({
  name: "RouterAgent",
  instructions: `
You are a router agent.
Decide which agent should handle the user query.

Agents:
1. GENERAL - for normal questions, small talk, general knowledge
2. CERTIFICATE - for certificate validation, expiry, document-based questions
3. UPLOAD_REQUIRED - when user asks about certificate but no document uploaded

Reply with ONLY one word:
GENERAL or CERTIFICATE or UPLOAD_REQUIRED
`
});
