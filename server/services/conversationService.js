import prisma from "../utils/prisma.js";

/**
 * Save a conversation message to the database
 * @param {Object} messageData - Message data to save
 * @param {string} messageData.sessionId - Session identifier
 * @param {string} messageData.role - Message role (USER or ASSISTANT)
 * @param {string} messageData.content - Message content
 * @param {string} [messageData.routerDecision] - Router decision (GENERAL, CERTIFICATE, etc.)
 * @param {string} [messageData.agentType] - Agent type used (GeneralKnowledgeAgent, CertificateValidationAgent)
 * @param {Object} [messageData.metadata] - Additional metadata (isNewSession, memoryActive, etc.)
 * @returns {Promise<Object>} Saved message object
 */
export async function saveConversationMessage({
  sessionId,
  role,
  content,
  routerDecision = null,
  agentType = null,
  metadata = null,
}) {
  try {
    // Get or create conversation for this session
    let conversation = await prisma.conversation.findUnique({
      where: { sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          sessionId,
          messageCount: 0,
          lastMessage: content.substring(0, 200), // Preview of first message
        },
      });
    }

    // Create the message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role,
        content,
        routerDecision,
        agentType,
        sessionId,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
      },
    });

    // Update conversation metadata
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messageCount: {
          increment: 1,
        },
        lastMessage: content.substring(0, 200), // Update last message preview
        updatedAt: new Date(),
      },
    });

    return message;
  } catch (error) {
    console.error("Error saving conversation message:", error);
    throw error;
  }
}

/**
 * Get conversation by sessionId
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Conversation object or null if not found
 */
export async function getConversationBySessionId(sessionId) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return conversation;
  } catch (error) {
    console.error("Error getting conversation by sessionId:", error);
    throw error;
  }
}

/**
 * Get all messages for a conversation
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Array>} Array of message objects
 */
export async function getConversationMessages(sessionId) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return conversation?.messages || [];
  } catch (error) {
    console.error("Error getting conversation messages:", error);
    throw error;
  }
}

/**
 * Get conversation statistics
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Conversation statistics
 */
export async function getConversationStats(sessionId) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { sessionId },
      include: {
        messages: true,
      },
    });

    if (!conversation) {
      return null;
    }

    const userMessages = conversation.messages.filter(
      (m) => m.role === "USER"
    ).length;
    const assistantMessages = conversation.messages.filter(
      (m) => m.role === "ASSISTANT"
    ).length;

    return {
      sessionId: conversation.sessionId,
      totalMessages: conversation.messageCount,
      userMessages,
      assistantMessages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  } catch (error) {
    console.error("Error getting conversation stats:", error);
    throw error;
  }
}

