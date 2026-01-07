import { MemorySession } from "@openai/agents";
import { randomUUID } from "crypto";

// Map to store session instances
const sessions = new Map();

/**
 * Get or create a MemorySession for the given sessionId
 * @param {string} sessionId - Session identifier (optional, will generate UUID if not provided)
 * @returns {Object} Object containing sessionId and session instance
 */
export function getOrCreateSession(sessionId = null) {
  // Generate new sessionId if not provided
  const id = sessionId || randomUUID();
  
  // Return existing session if found
  if (sessions.has(id)) {
    console.log(`📚 Memory: Retrieved existing session (${id.substring(0, 8)}...) - MemorySession is maintaining conversation history`);
    return {
      sessionId: id,
      session: sessions.get(id),
      isNew: false
    };
  }
  
  // Create new session
  const session = new MemorySession();
  sessions.set(id, session);
  console.log(`✨ Memory: Created new session (${id.substring(0, 8)}...) - MemorySession initialized`);
  
  return {
    sessionId: id,
    session,
    isNew: true
  };
}

/**
 * Get an existing session by sessionId
 * @param {string} sessionId - Session identifier
 * @returns {MemorySession|null} Session instance or null if not found
 */
export function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  return sessions.get(sessionId) || null;
}

/**
 * Delete a session from memory
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session was deleted, false if not found
 */
export function deleteSession(sessionId) {
  return sessions.delete(sessionId);
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
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }
  
  try {
    // MemorySession stores items internally, we can check if it has any
    // Note: MemorySession doesn't expose a direct count, but we can verify it exists
    return {
      sessionId,
      exists: true,
      hasSession: !!session
    };
  } catch (err) {
    return {
      sessionId,
      exists: true,
      error: err.message
    };
  }
}

/**
 * Get total number of active sessions (for debugging)
 * @returns {number} Number of active sessions
 */
export function getActiveSessionCount() {
  return sessions.size;
}

