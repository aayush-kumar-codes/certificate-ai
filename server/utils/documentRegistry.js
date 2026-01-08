import { randomUUID } from "crypto";

// In-memory Map to track documents per session
// Structure: Map<sessionId, Array<{documentId, documentName, documentIndex, uploadTimestamp}>>
const documentRegistry = new Map();

/**
 * Add a document to the registry for a session
 * @param {string} sessionId - Session identifier
 * @param {string} documentId - Unique document identifier
 * @param {string} documentName - Original filename
 * @param {number} documentIndex - Index of document (1, 2, 3...)
 * @returns {Object} Document info object
 */
export function addDocument(sessionId, documentId, documentName, documentIndex) {
  if (!sessionId || !documentId) {
    throw new Error("sessionId and documentId are required");
  }

  if (!documentRegistry.has(sessionId)) {
    documentRegistry.set(sessionId, []);
  }

  const documentInfo = {
    documentId,
    documentName,
    documentIndex,
    uploadTimestamp: new Date().toISOString(),
  };

  const sessionDocuments = documentRegistry.get(sessionId);
  sessionDocuments.push(documentInfo);

  console.log(`📝 Registered document ${documentIndex} (${documentName}) for session ${sessionId.substring(0, 8)}...`);
  return documentInfo;
}

/**
 * Get all documents for a session
 * @param {string} sessionId - Session identifier
 * @returns {Array} Array of document info objects
 */
export function getDocumentsBySession(sessionId) {
  if (!sessionId) {
    return [];
  }
  return documentRegistry.get(sessionId) || [];
}

/**
 * Get document count for a session
 * @param {string} sessionId - Session identifier
 * @returns {number} Number of documents
 */
export function getDocumentCount(sessionId) {
  if (!sessionId) {
    return 0;
  }
  const documents = documentRegistry.get(sessionId);
  return documents ? documents.length : 0;
}

/**
 * Remove a document from the registry
 * @param {string} sessionId - Session identifier
 * @param {string} documentId - Document identifier to remove
 * @returns {boolean} True if document was removed, false if not found
 */
export function removeDocument(sessionId, documentId) {
  if (!sessionId || !documentId) {
    return false;
  }

  const documents = documentRegistry.get(sessionId);
  if (!documents) {
    return false;
  }

  const initialLength = documents.length;
  const filtered = documents.filter(doc => doc.documentId !== documentId);
  
  if (filtered.length < initialLength) {
    documentRegistry.set(sessionId, filtered);
    console.log(`🗑️ Removed document ${documentId} from session ${sessionId.substring(0, 8)}...`);
    return true;
  }

  return false;
}

/**
 * Clear all documents for a session
 * @param {string} sessionId - Session identifier
 * @returns {number} Number of documents removed
 */
export function clearSessionDocuments(sessionId) {
  if (!sessionId) {
    return 0;
  }

  const documents = documentRegistry.get(sessionId);
  const count = documents ? documents.length : 0;
  
  if (count > 0) {
    documentRegistry.delete(sessionId);
    console.log(`🗑️ Cleared ${count} document(s) for session ${sessionId.substring(0, 8)}...`);
  }

  return count;
}

/**
 * Get next document index for a session
 * @param {string} sessionId - Session identifier
 * @returns {number} Next document index (1-based)
 */
export function getNextDocumentIndex(sessionId) {
  const count = getDocumentCount(sessionId);
  return count + 1;
}

/**
 * Get registry statistics (for debugging)
 * @returns {Object} Registry stats
 */
export function getRegistryStats() {
  const totalSessions = documentRegistry.size;
  let totalDocuments = 0;
  
  for (const documents of documentRegistry.values()) {
    totalDocuments += documents.length;
  }

  return {
    totalSessions,
    totalDocuments,
  };
}

