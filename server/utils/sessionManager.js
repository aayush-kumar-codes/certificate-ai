import { MemorySaver } from "@langchain/langgraph";
import { randomUUID } from "crypto";

// Global MemorySaver instance for checkpointing
const memory = new MemorySaver();

// Map to store session metadata (for backward compatibility)
const sessionMetadata = new Map();

/**
 * Get or create a checkpoint config for the given sessionId
 * LangGraph uses threadId instead of sessionId, so we map sessionId to threadId
 * @param {string} sessionId - Session identifier (optional, will generate UUID if not provided)
 * @returns {Object} Object containing sessionId, threadId, checkpointer, and isNew flag
 */
export function getOrCreateSession(sessionId = null) {
  // Generate new sessionId if not provided
  const id = sessionId || randomUUID();
  
  // Use sessionId as threadId for LangGraph (they're conceptually the same)
  const threadId = id;
  
  // Check if session exists in metadata
  const exists = sessionMetadata.has(id);
  
  if (exists) {
    console.log(`📚 Memory: Retrieved existing session (${id.substring(0, 8)}...) - LangGraph checkpointing maintains conversation history`);
    return {
      sessionId: id,
      threadId: threadId,
      checkpointer: memory,
      isNew: false
    };
  }
  
  // Create new session metadata entry
  sessionMetadata.set(id, {
    createdAt: new Date(),
    threadId: threadId,
  });
  
  console.log(`✨ Memory: Created new session (${id.substring(0, 8)}...) - LangGraph checkpointing initialized`);
  
  return {
    sessionId: id,
    threadId: threadId,
    checkpointer: memory,
    isNew: true
  };
}

/**
 * Get an existing session by sessionId
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Session info with threadId and checkpointer, or null if not found
 */
export function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  
  if (!sessionMetadata.has(sessionId)) {
    return null;
  }
  
  const metadata = sessionMetadata.get(sessionId);
  return {
    sessionId,
    threadId: metadata.threadId,
    checkpointer: memory,
  };
}

/**
 * Delete a session from memory
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session was deleted, false if not found
 */
export function deleteSession(sessionId) {
  const deleted = sessionMetadata.delete(sessionId);
  // Note: LangGraph MemorySaver doesn't have a delete method for checkpoints
  // The checkpoints will remain but won't be accessed if sessionId is removed from metadata
  return deleted;
}

/**
 * Generate a new session ID
 * @returns {string} New UUID
 */
export function generateSessionId() {
  return randomUUID();
}

/**
 * Get memory statistics for a session (for verification)
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Memory stats or null if session not found
 */
export function getSessionMemoryStats(sessionId) {
  if (!sessionMetadata.has(sessionId)) {
    return null;
  }
  
  const metadata = sessionMetadata.get(sessionId);
  return {
    sessionId,
    exists: true,
    threadId: metadata.threadId,
    createdAt: metadata.createdAt,
  };
}

/**
 * Get total number of active sessions (for debugging)
 * @returns {number} Number of active sessions
 */
export function getActiveSessionCount() {
  return sessionMetadata.size;
}

/**
 * Get the global MemorySaver instance
 * @returns {MemorySaver} The global MemorySaver instance
 */
export function getCheckpointer() {
  return memory;
}