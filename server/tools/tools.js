import { tool } from "@openai/agents";
import { searchDocuments } from "./searchDocs.js";

export const searchDocumentTool = tool({
  name: "search_document",
  description: "Search in uploaded certificate documents",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" }
    },
    required: ["query"],
    additionalProperties: false
  },
  execute: async ({ query }) => {
    const result = await searchDocuments(query);
    return result || "No relevant data found in document.";
  }
});
