
import { Agent } from "@openai/agents";
import { searchDocumentTool } from "../tools/tools.js";

export const CertificateValidationAgent = new Agent({
  name: "CertificateValidationAgent",
  instructions: `
You are a certificate validation expert.
Your job is to validate certificates strictly based on:
- expiry date
- validity rules found in the document

Rules:
- Use ONLY document data
- If expiry date is passed, say "Certificate is expired"
- If not found, say "Certificate data not found in document"
- Never guess
`,
  tools: [searchDocumentTool]
});
