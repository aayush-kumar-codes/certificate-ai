// In-memory state storage for graph runs
// In production, this should be replaced with a persistent store (Redis, database, etc.)
const stateStore = new Map();

/**
 * Get state for a thread/session
 * @param {string} threadId - Thread/session identifier
 * @returns {Object|null} Stored state or null if not found
 */
export function getState(threadId) {
  return stateStore.get(threadId) || null;
}

/**
 * Save state for a thread/session
 * @param {string} threadId - Thread/session identifier
 * @param {Object} state - State to store
 */
export function saveState(threadId, state) {
  stateStore.set(threadId, state);
}

/**
 * Create a new thread ID
 * @returns {string} New thread ID
 */
export function createThreadId() {
  return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clear state for a thread (optional cleanup)
 * @param {string} threadId - Thread/session identifier
 */
export function clearState(threadId) {
  stateStore.delete(threadId);
}

