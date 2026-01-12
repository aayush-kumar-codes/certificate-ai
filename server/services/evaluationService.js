import prisma from "../utils/prisma.js";

/**
 * Save an evaluation result to the database
 * @param {string} sessionId - Session identifier
 * @param {string} criteriaId - Criteria ID used for evaluation
 * @param {string|null} documentId - Optional document ID
 * @param {Object} evaluationResult - Full evaluation result object (checks, evidence, etc.)
 * @param {number|null} score - Overall score (0-100)
 * @param {boolean} passed - Pass/fail status
 * @returns {Promise<Object>} Created evaluation object
 */
export async function saveEvaluation(sessionId, criteriaId, documentId, evaluationResult, score, passed) {
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

    // Verify criteria exists
    const criteria = await prisma.evaluationCriteria.findUnique({
      where: { id: criteriaId },
    });

    if (!criteria) {
      throw new Error(`Criteria with ID ${criteriaId} not found`);
    }

    // Create the evaluation
    const evaluation = await prisma.evaluation.create({
      data: {
        sessionId,
        criteriaId,
        documentId: documentId || null,
        passed,
        score: score !== null && score !== undefined ? score : null,
        result: JSON.parse(JSON.stringify(evaluationResult)), // Ensure proper JSON serialization
      },
    });
    console.log("Evaluation saved:", evaluation);
    return evaluation;
  } catch (error) {
    console.error("Error saving evaluation:", error);
    throw error;
  }
}

/**
 * Get evaluation history for a session
 * @param {string} sessionId - Session identifier
 * @param {string|null} documentId - Optional document ID to filter by
 * @returns {Promise<Array>} Array of evaluation objects ordered by creation date (newest first)
 */
export async function getEvaluationHistory(sessionId, documentId = null) {
  try {
    const where = { sessionId };
    if (documentId) {
      where.documentId = documentId;
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        criteria: {
          select: {
            id: true,
            criteria: true,
            description: true,
            threshold: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return evaluations;
  } catch (error) {
    console.error("Error getting evaluation history:", error);
    throw error;
  }
}

/**
 * Get the latest evaluation for a session
 * @param {string} sessionId - Session identifier
 * @param {string|null} documentId - Optional document ID to filter by
 * @returns {Promise<Object|null>} Latest evaluation object or null if not found
 */
export async function getLatestEvaluation(sessionId, documentId = null) {
  try {
    const where = { sessionId };
    if (documentId) {
      where.documentId = documentId;
    }

    const evaluation = await prisma.evaluation.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        criteria: {
          select: {
            id: true,
            criteria: true,
            description: true,
            threshold: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return evaluation;
  } catch (error) {
    console.error("Error getting latest evaluation:", error);
    throw error;
  }
}

/**
 * Get a specific evaluation by ID
 * @param {string} id - Evaluation ID
 * @returns {Promise<Object|null>} Evaluation object or null if not found
 */
export async function getEvaluationById(id) {
  try {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        criteria: {
          select: {
            id: true,
            criteria: true,
            description: true,
            threshold: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return evaluation;
  } catch (error) {
    console.error("Error getting evaluation by ID:", error);
    throw error;
  }
}

/**
 * Compare two evaluations
 * @param {string} evaluationId1 - First evaluation ID (typically older)
 * @param {string} evaluationId2 - Second evaluation ID (typically newer)
 * @returns {Promise<Object>} Comparison object with differences
 */
export async function compareEvaluations(evaluationId1, evaluationId2) {
  try {
    const evaluation1 = await getEvaluationById(evaluationId1);
    const evaluation2 = await getEvaluationById(evaluationId2);

    if (!evaluation1 || !evaluation2) {
      throw new Error("One or both evaluations not found");
    }

    // Extract criteria differences
    const criteria1 = evaluation1.criteria.criteria;
    const criteria2 = evaluation2.criteria.criteria;
    const criteriaModified = [];

    // Check for modified criteria
    const allCriteriaKeys = new Set([
      ...Object.keys(criteria1),
      ...Object.keys(criteria2),
    ]);

    for (const key of allCriteriaKeys) {
      const c1 = criteria1[key];
      const c2 = criteria2[key];

      if (!c1 || !c2) {
        criteriaModified.push(key);
      } else {
        // Deep compare criterion objects
        const c1Str = JSON.stringify(c1);
        const c2Str = JSON.stringify(c2);
        if (c1Str !== c2Str) {
          criteriaModified.push(key);
        }
      }
    }

    // Calculate score delta
    const scoreDelta =
      (evaluation2.score || 0) - (evaluation1.score || 0);

    // Check if status changed
    const statusChanged = evaluation1.passed !== evaluation2.passed;

    // Extract check differences
    const checks1 = evaluation1.result?.checks || [];
    const checks2 = evaluation2.result?.checks || [];

    const checkChanges = checks1.map((check1, index) => {
      const check2 = checks2[index];
      if (!check2) return null;

      return {
        criterion: check1.criterion,
        passedChanged: check1.passed !== check2.passed,
        previousPassed: check1.passed,
        newPassed: check2.passed,
      };
    }).filter(Boolean);

    return {
      previous: {
        evaluationId: evaluation1.id,
        criteria: criteria1,
        score: evaluation1.score,
        passed: evaluation1.passed,
        checks: checks1,
        createdAt: evaluation1.createdAt.toISOString(),
      },
      new: {
        evaluationId: evaluation2.id,
        criteria: criteria2,
        score: evaluation2.score,
        passed: evaluation2.passed,
        checks: checks2,
        createdAt: evaluation2.createdAt.toISOString(),
      },
      changes: {
        criteriaModified,
        scoreDelta: Math.round(scoreDelta * 100) / 100, // Round to 2 decimal places
        statusChanged,
        checkChanges,
      },
    };
  } catch (error) {
    console.error("Error comparing evaluations:", error);
    throw error;
  }
}
