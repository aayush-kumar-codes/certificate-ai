import { searchDocuments } from "./searchDocs.js";
export const searchDocumentTool = {
  name: "search_document",
  description: "Search in uploaded certificate documents",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" }
    },
    required: ["query"]
  },
  handler: async ({ query }) => {
    const result = await searchDocuments(query);
    return result || "No relevant data found in document.";
  }
};
