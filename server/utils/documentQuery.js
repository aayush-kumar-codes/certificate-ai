import { OpenAIEmbeddings } from "@langchain/openai";
import { pinecone } from "./pineconedb.js";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 1024,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get document count for a session by querying Pinecone metadata
 * @param {string} sessionId - Session identifier
 * @returns {Promise<number>} Number of unique documents
 */
export async function getDocumentCountBySession(sessionId) {
  if (!sessionId) {
    return 0;
  }

  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    
    // Use a generic query to retrieve documents with this session_id
    const testQuery = "certificate document";
    const queryEmbedding = await embeddings.embedQuery(testQuery);
    
    // Query with metadata filter to get all chunks for this session
    const queryResult = await index.query({
      vector: queryEmbedding,
      filter: {
        session_id: { $eq: sessionId }
      },
      topK: 1000, // Get enough to find all unique documents
      includeMetadata: true,
    });

    // Extract unique document_ids from the results
    const uniqueDocumentIds = new Set();
    
    if (queryResult.matches && queryResult.matches.length > 0) {
      for (const match of queryResult.matches) {
        if (match.metadata && match.metadata.document_id) {
          uniqueDocumentIds.add(match.metadata.document_id);
        }
      }
    }

    const count = uniqueDocumentIds.size;
    console.log(`📊 Found ${count} unique document(s) for session ${sessionId.substring(0, 8)}...`);
    return count;
  } catch (error) {
    console.error("❌ Error counting documents by session:", error.message);
    return 0;
  }
}

/**
 * Get document metadata from Pinecone for a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Array>} Array of document metadata objects
 */
export async function getDocumentsBySession(sessionId) {
  if (!sessionId) {
    return [];
  }

  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    
    // Use a generic query to retrieve documents with this session_id
    const testQuery = "certificate document";
    const queryEmbedding = await embeddings.embedQuery(testQuery);
    
    // Query with metadata filter
    const queryResult = await index.query({
      vector: queryEmbedding,
      filter: {
        session_id: { $eq: sessionId }
      },
      topK: 1000,
      includeMetadata: true,
    });

    // Extract unique document metadata
    const documentMap = new Map();
    
    if (queryResult.matches && queryResult.matches.length > 0) {
      for (const match of queryResult.matches) {
        if (match.metadata && match.metadata.document_id) {
          const docId = match.metadata.document_id;
          
          if (!documentMap.has(docId)) {
            documentMap.set(docId, {
              documentId: match.metadata.document_id,
              documentName: match.metadata.document_name || "Unknown",
              documentIndex: match.metadata.document_index || 0,
              documentType: match.metadata.document_type || "unknown",
              uploadTimestamp: match.metadata.upload_timestamp || null,
            });
          }
        }
      }
    }

    // Convert map to array and sort by document_index
    const documents = Array.from(documentMap.values()).sort((a, b) => 
      (a.documentIndex || 0) - (b.documentIndex || 0)
    );

    console.log(`📄 Retrieved ${documents.length} document(s) for session ${sessionId.substring(0, 8)}...`);
    return documents;
  } catch (error) {
    console.error("❌ Error retrieving documents by session:", error.message);
    return [];
  }
}

/**
 * Check if documents exist for a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} True if documents exist
 */
export async function hasDocumentsForSession(sessionId) {
  const count = await getDocumentCountBySession(sessionId);
  return count > 0;
}

