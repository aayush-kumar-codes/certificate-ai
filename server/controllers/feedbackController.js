import { saveFeedback } from "../services/feedbackService.js";
import { getSession } from "../utils/sessionManager.js";
import { saveConversationMessage } from "../services/conversationService.js";

/**
 * Submit feedback for a conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function submitFeedback(req, res) {
  try {
    const { sessionId, feedbackType } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required",
      });
    }

    if (!feedbackType) {
      return res.status(400).json({
        success: false,
        error: "feedbackType is required",
      });
    }

    // Validate feedbackType
    if (feedbackType !== "LIKE" && feedbackType !== "DISLIKE") {
      return res.status(400).json({
        success: false,
        error: "feedbackType must be either 'LIKE' or 'DISLIKE'",
      });
    }

    // Save feedback to database
    let feedback;
    try {
      feedback = await saveFeedback(sessionId, feedbackType);
    } catch (error) {
      // Handle duplicate feedback error
      if (error.message.includes("already exists")) {
        return res.status(409).json({
          success: false,
          error: "Feedback already submitted for this conversation",
        });
      }
      // Handle conversation not found error
      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found for this sessionId",
        });
      }
      throw error;
    }

    // Get MemorySession if it exists
    const session = getSession(sessionId);

    // Inject feedback into MemorySession if session exists
    if (session) {
      try {
        // Format feedback message
        const feedbackMessage = `User feedback: Previous conversation was ${feedbackType === "LIKE" ? "LIKED" : "DISLIKED"}. Please adjust your responses accordingly.`;

        // Save feedback as a system/user message to the conversation
        // This ensures it's part of the conversation history
        // The MemorySession will pick up this feedback from conversation history when loaded
        await saveConversationMessage({
          sessionId,
          role: "USER",
          content: feedbackMessage,
          metadata: {
            isFeedback: true,
            feedbackType,
            feedbackId: feedback.id,
          },
        });
        
        console.log(`✅ Feedback saved to conversation history for session: ${sessionId.substring(0, 8)}...`);
      } catch (injectionError) {
        // Log error but don't fail the request
        console.warn("⚠️ Failed to inject feedback into conversation:", injectionError.message);
        // Continue - feedback is saved in database which is the primary storage
      }
    } else {
      console.log(`ℹ️ MemorySession not found for sessionId: ${sessionId.substring(0, 8)}... - Feedback saved to database only`);
    }

    // Return success response
    return res.json({
      success: true,
      feedback: {
        id: feedback.id,
        feedbackType: feedback.feedbackType,
        sessionId: feedback.sessionId,
        createdAt: feedback.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to submit feedback",
    });
  }
}

