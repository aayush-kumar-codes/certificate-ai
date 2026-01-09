import prisma from "../utils/prisma.js";

/**
 * Validate weights in criteria object
 * @param {Object} criteria - Criteria object
 * @returns {Object} Validation result with isValid and message
 */
function validateWeights(criteria) {
  if (!criteria || typeof criteria !== "object") {
    return { isValid: false, message: "Criteria must be an object" };
  }

  const entries = Object.entries(criteria);
  let totalWeight = 0;
  const issues = [];

  for (const [criterionName, criterionData] of entries) {
    if (criterionData && typeof criterionData === "object" && "weight" in criterionData) {
      const weight = criterionData.weight;
      if (typeof weight !== "number" || weight < 0) {
        issues.push(`${criterionName}: weight must be a non-negative number`);
      } else {
        totalWeight += weight;
      }
    }
  }

  // Weights should ideally sum to ≤ 1.0, but allow flexibility
  if (totalWeight > 1.0) {
    issues.push(`Total weights (${totalWeight.toFixed(2)}) exceed 1.0. Scores will be normalized.`);
  }

  return {
    isValid: issues.length === 0,
    message: issues.length > 0 ? issues.join("; ") : "Weights validated",
    totalWeight,
  };
}

/**
 * Store evaluation criteria for a session
 * @param {string} sessionId - Session identifier
 * @param {Object} criteria - Criteria object (will be stored as JSON)
 * @param {string} [description] - Optional natural language description
 * @param {number} [threshold] - Optional pass/fail threshold (0-100), defaults to 70
 * @returns {Promise<Object>} Created criteria object
 */
export async function storeCriteria(sessionId, criteria, description = null, threshold = null) {
  try {
    // Ensure conversation exists for this session
    let conversation = await prisma.conversation.findUnique({
      where: { sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          sessionId,
          messageCount: 0,
        },
      });
    }

    // Validate weights (non-blocking, just for logging)
    const weightValidation = validateWeights(criteria);
    if (!weightValidation.isValid) {
      console.warn("Weight validation warnings:", weightValidation.message);
    }

    // Create the criteria
    const createData = {
      sessionId,
      criteria: JSON.parse(JSON.stringify(criteria)), // Ensure proper JSON serialization
      description,
    };

    if (threshold !== null && threshold !== undefined) {
      createData.threshold = Math.max(0, Math.min(100, threshold)); // Clamp to 0-100
    }

    const evaluationCriteria = await prisma.evaluationCriteria.create({
      data: createData,
    });

    return evaluationCriteria;
  } catch (error) {
    console.error("Error storing criteria:", error);
    throw error;
  }
}

/**
 * Get the latest evaluation criteria for a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Latest criteria object or null if not found
 */
export async function getCriteria(sessionId) {
  try {
    const criteria = await prisma.evaluationCriteria.findFirst({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });

    return criteria;
  } catch (error) {
    console.error("Error getting criteria:", error);
    throw error;
  }
}

/**
 * Get evaluation criteria by ID
 * @param {string} id - Criteria ID
 * @returns {Promise<Object|null>} Criteria object or null if not found
 */
export async function getCriteriaById(id) {
  try {
    const criteria = await prisma.evaluationCriteria.findUnique({
      where: { id },
    });

    return criteria;
  } catch (error) {
    console.error("Error getting criteria by ID:", error);
    throw error;
  }
}

/**
 * Update existing evaluation criteria
 * @param {string} id - Criteria ID
 * @param {Object} criteria - Updated criteria object
 * @param {string} [description] - Optional updated description
 * @param {number} [threshold] - Optional pass/fail threshold (0-100)
 * @returns {Promise<Object>} Updated criteria object
 */
export async function updateCriteria(id, criteria, description = null, threshold = null) {
  try {
    // Validate weights (non-blocking, just for logging)
    const weightValidation = validateWeights(criteria);
    if (!weightValidation.isValid) {
      console.warn("Weight validation warnings:", weightValidation.message);
    }

    const updateData = {
      criteria: JSON.parse(JSON.stringify(criteria)), // Ensure proper JSON serialization
      updatedAt: new Date(),
    };

    if (description !== null) {
      updateData.description = description;
    }

    if (threshold !== null && threshold !== undefined) {
      updateData.threshold = Math.max(0, Math.min(100, threshold)); // Clamp to 0-100
    }

    const updatedCriteria = await prisma.evaluationCriteria.update({
      where: { id },
      data: updateData,
    });

    return updatedCriteria;
  } catch (error) {
    console.error("Error updating criteria:", error);
    throw error;
  }
}

/**
 * Delete evaluation criteria
 * @param {string} id - Criteria ID
 * @returns {Promise<Object>} Deleted criteria object
 */
export async function deleteCriteria(id) {
  try {
    const deletedCriteria = await prisma.evaluationCriteria.delete({
      where: { id },
    });

    return deletedCriteria;
  } catch (error) {
    console.error("Error deleting criteria:", error);
    throw error;
  }
}

/**
 * Get all evaluation criteria for a session (history)
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Array>} Array of criteria objects ordered by creation date (newest first)
 */
export async function getAllCriteriaForSession(sessionId) {
  try {
    const criteriaList = await prisma.evaluationCriteria.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });

    return criteriaList;
  } catch (error) {
    console.error("Error getting all criteria for session:", error);
    throw error;
  }
}
