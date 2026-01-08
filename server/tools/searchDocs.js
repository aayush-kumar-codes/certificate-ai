import { OpenAIEmbeddings } from "@langchain/openai";
import { pinecone } from "../utils/pineconedb.js";
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 1024,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Search documents in Pinecone with optional metadata filtering
 * @param {string} query - Search query text
 * @param {Object} options - Search options
 * @param {string} options.sessionId - Optional session ID to filter by
 * @param {string} options.documentId - Optional document ID to filter by
 * @param {number} options.topK - Number of results to return (default: 10)
 * @returns {Promise<Array>} Array of search results grouped by document
 */
export async function searchDocuments(query, options = {}) {
  const { sessionId, documentId, topK = 10 } = options;
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  const queryEmbedding = await embeddings.embedQuery(query);

  // Build metadata filter
  const filter = {};
  if (sessionId) {
    filter.session_id = { $eq: sessionId };
  }
  if (documentId) {
    filter.document_id = { $eq: documentId };
  }

  const queryOptions = {
    vector: queryEmbedding,
    topK: topK,
    includeMetadata: true,
  };

  // Only add filter if we have filtering criteria
  if (Object.keys(filter).length > 0) {
    queryOptions.filter = filter;
  }

  const searchResults = await index.query(queryOptions);

  const results = searchResults.matches.map(match => ({
    pageContent: match.metadata?.text || match.metadata?.chunk_text || match.metadata?.pageContent || "",
    metadata: match.metadata || {},
    score: match.score,
  }));

  // Group results by document_id if available
  if (results.length > 0 && results[0].metadata.document_id) {
    const grouped = {};
    results.forEach(result => {
      const docId = result.metadata.document_id;
      if (!grouped[docId]) {
        grouped[docId] = {
          documentId: docId,
          documentName: result.metadata.document_name || "Unknown",
          documentIndex: result.metadata.document_index || 0,
          chunks: [],
        };
      }
      grouped[docId].chunks.push(result);
    });
    return {
      results,
      groupedByDocument: Object.values(grouped),
    };
  }

  return {
    results,
    groupedByDocument: [],
  };
}
