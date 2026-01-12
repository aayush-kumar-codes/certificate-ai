import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchDocuments } from "./searchDocs.js";

/**
 * Create a search document tool with sessionId injected from context
 * This factory function allows us to inject sessionId without making it a tool parameter
 * (which would violate strict schema validation)
 */
export function createSearchDocumentTool(sessionId) {
  return tool(
    async ({ query }) => {
      // Inject sessionId from context (passed to factory)
      const result = await searchDocuments(query, { sessionId });
      
      // Format result for agent consumption
      if (result && result.results && result.results.length > 0) {
        const formatted = {
          totalResults: result.results.length,
          documents: result.groupedByDocument || [],
          results: result.results.map(r => ({
            content: r.pageContent,
            documentId: r.metadata.document_id,
            documentName: r.metadata.document_name,
            documentIndex: r.metadata.document_index,
            score: r.score
          }))
        };
        return JSON.stringify(formatted, null, 2);
      }
      
      return "No relevant data found in document.";
    },
    {
      name: "search_document",
      description: "Search in uploaded certificate documents. This tool automatically filters by the current session's documents.",
      schema: z.object({
        query: z.string().describe("The search query text to find relevant information in the uploaded certificate documents")
      })
    }
  );
}

// Export a default tool for backward compatibility (without sessionId filtering)
// This will search all documents, not filtered by session
export const searchDocumentTool = tool(
  async ({ query }) => {
    const result = await searchDocuments(query);
    
    // Format result for agent consumption
    if (result && result.results && result.results.length > 0) {
      const formatted = {
        totalResults: result.results.length,
        documents: result.groupedByDocument || [],
        results: result.results.map(r => ({
          content: r.pageContent,
          documentId: r.metadata.document_id,
          documentName: r.metadata.document_name,
          documentIndex: r.metadata.document_index,
          score: r.score
        }))
      };
      return JSON.stringify(formatted, null, 2);
    }
    
    return "No relevant data found in document.";
  },
  {
    name: "search_document",
    description: "Search in uploaded certificate documents.",
    schema: z.object({
      query: z.string().describe("The search query text to find relevant information in the uploaded certificate documents")
    })
  }
);
