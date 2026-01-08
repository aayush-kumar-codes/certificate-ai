import prisma from "../utils/prisma.js";

/**
 * Save feedback for a conversation
 * @param {string} sessionId - Session identifier
 * @param {string} feedbackType - Feedback type (LIKE or DISLIKE)
 * @returns {Promise<Object>} Saved feedback object
 */
export async function saveFeedback(sessionId, feedbackType) {
  try {
    // Find conversation by sessionId
    const conversation = await prisma.conversation.findUnique({
      where: { sessionId },
    });

    if (!conversation) {
      throw new Error(`Conversation not found for sessionId: ${sessionId}`);
    }

    // Check if feedback already exists (prevent duplicates)
    const existingFeedback = await prisma.feedback.findUnique({
      where: { conversationId: conversation.id },
    });

    if (existingFeedback) {
      throw new Error("Feedback already exists for this conversation");
    }

    // Create new feedback record
    const feedback = await prisma.feedback.create({
      data: {
        conversationId: conversation.id,
        sessionId,
        feedbackType,
      },
    });

    return feedback;
  } catch (error) {
    console.error("Error saving feedback:", error);
    throw error;
  }
}

/**
 * Get feedback by sessionId
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Feedback object or null if not found
 */
export async function getFeedbackBySessionId(sessionId) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { sessionId },
      include: {
        feedback: true,
      },
    });

    return conversation?.feedback || null;
  } catch (error) {
    console.error("Error getting feedback by sessionId:", error);
    throw error;
  }
}

/**
 * Get feedback by conversationId
 * @param {number} conversationId - Conversation ID
 * @returns {Promise<Object|null>} Feedback object or null if not found
 */
export async function getFeedbackByConversationId(conversationId) {
  try {
    const feedback = await prisma.feedback.findUnique({
      where: { conversationId },
    });

    return feedback;
  } catch (error) {
    console.error("Error getting feedback by conversationId:", error);
    throw error;
  }
}

