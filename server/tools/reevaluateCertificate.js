import { tool } from "@openai/agents";
import { z } from "zod";
import { getCriteria, getCriteriaById, updateCriteria } from "../services/criteriaService.js";
import {
  getLatestEvaluation,
  saveEvaluation,
  compareEvaluations,
} from "../services/evaluationService.js";
import { createEvaluateCertificateTool } from "./evaluateCertificate.js";
import { createCalculateScoreTool } from "./calculateScore.js";

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object to merge into target
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

/**
 * Create a re-evaluate certificate tool with sessionId injected from context
 * This tool allows re-evaluating certificates with modified criteria and comparing results
 */
export function createReevaluateCertificateTool(sessionId) {
  return tool({
    name: "reevaluate_certificate",
    description:
      "Re-evaluate a certificate with optional criteria modifications. Merges criteria updates with existing criteria, performs new evaluation, and returns a comparison showing what changed. Use this when the user modifies criteria (e.g., 'change weight of X to Y') or requests re-evaluation.",
    parameters: z.object({
      criteriaUpdates: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Partial criteria object as JSON string for merging with existing criteria. Only include criteria you want to update. Example: '{\"expiryDate\": {\"weight\": 0.5, \"value\": \"2025-12-31\"}}'"
        ),
      criteriaId: z
        .string()
        .nullable()
        .optional()
        .describe(
          "ID of the criteria to update and use for evaluation. If not provided, uses latest criteria for session."
        ),
      documentId: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Optional document ID to re-evaluate a specific document. If not provided, evaluates all documents in the session."
        ),
      updateCriteria: z
        .boolean()
        .nullable()
        .optional()
        .default(true)
        .describe(
          "Whether to update the stored criteria with the merged criteria. Defaults to true. Set to false to evaluate with merged criteria without saving."
        ),
    }),
    execute: async ({ criteriaUpdates, criteriaId, documentId, updateCriteria = true }) => {
      try {
        // Get existing criteria
        let existingCriteria = null;
        let criteriaToUse = null;

        if (criteriaId) {
          existingCriteria = await getCriteriaById(criteriaId);
          if (!existingCriteria) {
            return JSON.stringify({
              success: false,
              error: `Criteria with ID ${criteriaId} not found`,
            });
          }
          criteriaToUse = existingCriteria.criteria;
        } else {
          // Get latest criteria for session
          existingCriteria = await getCriteria(sessionId);
          if (!existingCriteria) {
            return JSON.stringify({
              success: false,
              error: "No criteria found for this session. Please store criteria first using manage_criteria.",
            });
          }
          criteriaId = existingCriteria.id;
          criteriaToUse = existingCriteria.criteria;
        }

        // Merge criteria updates if provided
        let mergedCriteria = criteriaToUse;
        if (criteriaUpdates) {
          try {
            const updates =
              typeof criteriaUpdates === "string"
                ? JSON.parse(criteriaUpdates)
                : criteriaUpdates;
            mergedCriteria = deepMerge(criteriaToUse, updates);
          } catch (parseError) {
            return JSON.stringify({
              success: false,
              error: `Invalid JSON in criteriaUpdates: ${parseError.message}`,
            });
          }
        }

        // Get previous evaluation for comparison
        const previousEvaluation = await getLatestEvaluation(sessionId, documentId || null);

        // Update stored criteria if requested
        let updatedCriteriaId = criteriaId;
        if (updateCriteria && criteriaUpdates) {
          const updated = await updateCriteria(
            criteriaId,
            mergedCriteria,
            existingCriteria.description,
            existingCriteria.threshold
          );
          updatedCriteriaId = updated.id;
        }

        // Create tool instances to call evaluate and calculate
        const evaluateTool = createEvaluateCertificateTool(sessionId);
        const calculateTool = createCalculateScoreTool(sessionId);

        // Perform new evaluation
        const evaluationResultStr = await evaluateTool.execute({
          criteriaId: updatedCriteriaId,
          criteria: JSON.stringify(mergedCriteria),
          documentId: documentId || null,
        });

        let evaluationResult;
        try {
          evaluationResult = JSON.parse(evaluationResultStr);
        } catch (parseError) {
          return JSON.stringify({
            success: false,
            error: `Failed to parse evaluation result: ${parseError.message}`,
          });
        }

        if (!evaluationResult.success) {
          return JSON.stringify({
            success: false,
            error: `Evaluation failed: ${evaluationResult.error}`,
          });
        }

        // Calculate score
        const scoreResultStr = await calculateTool.execute({
          evaluationResults: JSON.stringify(evaluationResult),
          criteriaId: updatedCriteriaId,
        });

        let scoreResult;
        try {
          scoreResult = JSON.parse(scoreResultStr);
        } catch (parseError) {
          return JSON.stringify({
            success: false,
            error: `Failed to parse score result: ${parseError.message}`,
          });
        }

        if (!scoreResult.success) {
          return JSON.stringify({
            success: false,
            error: `Score calculation failed: ${scoreResult.error}`,
          });
        }

        // Save new evaluation
        const newEvaluation = await saveEvaluation(
          sessionId,
          updatedCriteriaId,
          documentId || null,
          evaluationResult,
          scoreResult.overallScore,
          scoreResult.passed
        );

        // Build comparison response
        const response = {
          success: true,
          message: "Re-evaluation completed successfully",
          newEvaluation: {
            evaluationId: newEvaluation.id,
            score: scoreResult.overallScore,
            passed: scoreResult.passed,
            threshold: scoreResult.threshold,
            checks: evaluationResult.checks || [],
            evidence: evaluationResult.evidence || [],
          },
        };

        // Add comparison if previous evaluation exists
        if (previousEvaluation) {
          try {
            const comparison = await compareEvaluations(
              previousEvaluation.id,
              newEvaluation.id
            );

            response.comparison = {
              previous: {
                score: previousEvaluation.score,
                passed: previousEvaluation.passed,
                checks: previousEvaluation.result?.checks || [],
              },
              new: {
                score: scoreResult.overallScore,
                passed: scoreResult.passed,
                checks: evaluationResult.checks || [],
              },
              changes: {
                criteriaModified: comparison.changes.criteriaModified,
                scoreDelta: comparison.changes.scoreDelta,
                statusChanged: comparison.changes.statusChanged,
                checkChanges: comparison.changes.checkChanges,
              },
            };

            response.message = `Re-evaluation completed. Score changed from ${previousEvaluation.score || 0} to ${scoreResult.overallScore} (${comparison.changes.scoreDelta > 0 ? "+" : ""}${comparison.changes.scoreDelta}).`;
          } catch (compareError) {
            console.warn("Error comparing evaluations:", compareError);
            // Continue without comparison if comparison fails
          }
        } else {
          response.message = "Evaluation completed. No previous evaluation found for comparison.";
        }

        return JSON.stringify(response);
      } catch (error) {
        console.error("Error in reevaluate_certificate tool:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "An error occurred while re-evaluating the certificate",
        });
      }
    },
  });
}
