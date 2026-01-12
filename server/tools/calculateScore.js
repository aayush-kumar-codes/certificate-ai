import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCriteria, getCriteriaById } from "../services/criteriaService.js";
import { saveEvaluation } from "../services/evaluationService.js";

/**
 * Create a calculate score tool with sessionId injected from context
 * This tool calculates weighted scores from evaluation results
 */
export function createCalculateScoreTool(sessionId) {
  return tool(
    async ({ evaluationResults, criteriaId, documentId, threshold, saveToDatabase = true }) => {
      try {
        // Parse evaluation results
        let results;
        try {
          results = typeof evaluationResults === "string" ? JSON.parse(evaluationResults) : evaluationResults;
        } catch (parseError) {
          return JSON.stringify({
            success: false,
            error: `Invalid JSON in evaluationResults: ${parseError.message}`,
          });
        }

        if (!results.checks || !Array.isArray(results.checks)) {
          return JSON.stringify({
            success: false,
            error: "evaluationResults must contain a 'checks' array",
          });
        }

        // Get threshold and weights from criteria if criteriaId provided
        let thresholdValue = threshold || 70; // Default threshold
        let criteriaObj = null;

        if (criteriaId) {
          const storedCriteria = await getCriteriaById(criteriaId);
          if (storedCriteria) {
            criteriaObj = storedCriteria.criteria;
            thresholdValue = storedCriteria.threshold || threshold || 70;
          }
        } else {
          // Try to get latest criteria for session to get threshold
          const latestCriteria = await getCriteria(sessionId);
          if (latestCriteria) {
            thresholdValue = latestCriteria.threshold || threshold || 70;
          }
        }

        // Extract checks with weights
        const checks = results.checks;
        
        // Validate that checks have weights
        const checksWithWeights = checks.map((check) => {
          // Get weight from check or from criteria
          let weight = check.weight;
          if (weight === undefined && criteriaObj && criteriaObj[check.criterion]) {
            weight = criteriaObj[check.criterion].weight || 0;
          }
          if (weight === undefined) {
            weight = 0;
          }
          return {
            criterion: check.criterion,
            passed: check.passed === true,
            weight: weight,
            required: check.required !== false,
          };
        });

        // Validate weights sum (should be ≤ 1.0, but allow flexibility)
        const totalWeight = checksWithWeights.reduce((sum, check) => sum + check.weight, 0);
        const normalizedWeights = totalWeight > 0 && totalWeight <= 1.0;

        // Calculate weighted score
        // Score = Σ(weight × pass_status) where pass_status is 1 if passed, 0 if failed
        let weightedScore = 0;
        const breakdown = [];

        for (const check of checksWithWeights) {
          const contribution = check.weight * (check.passed ? 1 : 0);
          weightedScore += contribution;
          
          breakdown.push({
            criterion: check.criterion,
            weight: check.weight,
            passed: check.passed,
            contribution: contribution,
            score: check.passed ? check.weight * 100 : 0, // Individual score out of 100
          });
        }

        // Normalize to 0-100 scale if weights don't sum to 1
        let overallScore = weightedScore;
        if (!normalizedWeights && totalWeight > 0) {
          // If weights don't sum to 1, normalize by total weight
          overallScore = (weightedScore / totalWeight) * 100;
        } else if (normalizedWeights) {
          // If weights sum to 1, multiply by 100 to get 0-100 scale
          overallScore = weightedScore * 100;
        } else {
          // If no weights or all zero, use simple pass/fail ratio
          const passedCount = checksWithWeights.filter((c) => c.passed).length;
          overallScore = checksWithWeights.length > 0 ? (passedCount / checksWithWeights.length) * 100 : 0;
        }

        // Ensure score is between 0 and 100
        overallScore = Math.max(0, Math.min(100, overallScore));

        // Determine pass/fail
        const passed = overallScore >= thresholdValue;

        // Check if any required criteria failed (override score-based pass)
        const requiredChecks = checksWithWeights.filter((c) => c.required);
        const allRequiredPassed = requiredChecks.length === 0 || requiredChecks.every((c) => c.passed);
        const finalPassed = passed && allRequiredPassed;

        // Generate human-readable message
        const passedCount = checksWithWeights.filter((c) => c.passed).length;
        const totalCount = checksWithWeights.length;
        const message = `Overall Score: ${overallScore.toFixed(2)}/100 (Threshold: ${thresholdValue})
${passedCount} of ${totalCount} criteria passed
${finalPassed ? "✅ Certificate PASSED" : "❌ Certificate FAILED"}
${!allRequiredPassed ? "Note: Some required criteria failed." : ""}`;

        // Extract documentId from evaluationResults if not provided
        let finalDocumentId = documentId;
        if (!finalDocumentId && results.documents && Array.isArray(results.documents) && results.documents.length > 0) {
          // Get the first document ID from the documents array
          // documents array structure: [{ documentId, documentName, documentIndex, chunks: [...] }]
          finalDocumentId = results.documents[0]?.documentId || null;
        }

        // Save evaluation to database if criteriaId is provided and saveToDatabase is true
        let savedEvaluationId = null;
        if (criteriaId && saveToDatabase) {
          try {
            const savedEvaluation = await saveEvaluation(
              sessionId,
              criteriaId,
              finalDocumentId,
              results, // Full evaluation result with checks, evidence, etc.
              Math.round(overallScore * 100) / 100,
              finalPassed
            );
            savedEvaluationId = savedEvaluation.id;
            console.log(`✅ Evaluation saved with ID: ${savedEvaluationId}`);
          } catch (saveError) {
            console.error("Error saving evaluation:", saveError);
            // Don't fail the entire operation if saving fails
          }
        }

        return JSON.stringify({
          success: true,
          overallScore: Math.round(overallScore * 100) / 100, // Round to 2 decimal places
          passed: finalPassed,
          threshold: thresholdValue,
          breakdown: breakdown,
          summary: {
            totalCriteria: totalCount,
            passedCriteria: passedCount,
            failedCriteria: totalCount - passedCount,
            totalWeight: totalWeight,
            weightedScore: weightedScore,
          },
          message: message,
          evaluationId: savedEvaluationId, // Include saved evaluation ID if saved
        });
      } catch (error) {
        console.error("Error in calculate_score tool:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "An error occurred while calculating the score",
        });
      }
    },
    {
      name: "calculate_score",
      description:
        "Calculate a weighted score (0-100) from evaluation results. Takes evaluation results with per-criterion pass/fail status and criteria with weights, then computes an overall score. Returns pass/fail based on threshold. Use this after evaluate_certificate to get a numerical score.",
      schema: z.object({
        evaluationResults: z.string().describe(
          "Evaluation results as JSON string from evaluate_certificate tool. Must contain 'checks' array with 'criterion', 'passed', and 'weight' fields."
        ),
        criteriaId: z.string().nullable().optional().describe(
          "Optional criteria ID to retrieve weights and threshold. If not provided, weights should be in evaluationResults. If provided, evaluation will be saved to database."
        ),
        documentId: z.string().nullable().optional().describe(
          "Optional document ID. If not provided, will try to extract from evaluationResults.documents. Used for saving evaluation."
        ),
        threshold: z.number().nullable().optional().describe(
          "Optional pass/fail threshold (0-100). Defaults to 70 if not provided and not found in criteria."
        ),
        saveToDatabase: z.boolean().nullable().optional().default(true).describe(
          "Whether to save the evaluation to database. Defaults to true if criteriaId is provided."
        ),
      })
    }
  );
}
