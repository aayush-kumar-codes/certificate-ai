import { tool } from "@openai/agents";
import { z } from "zod";
import {
  storeCriteria,
  getCriteria,
  getCriteriaById,
  updateCriteria,
  deleteCriteria,
  getAllCriteriaForSession,
} from "../services/criteriaService.js";

/**
 * Create a manage criteria tool with sessionId injected from context
 * This factory function allows us to inject sessionId without making it a tool parameter
 */
export function createManageCriteriaTool(sessionId) {
  return tool({
    name: "manage_criteria",
    description:
      "Store, retrieve, update, or delete evaluation criteria for certificate validation. Supports weighted criteria with pass/fail thresholds. Use this tool when the user specifies validation criteria, wants to modify existing criteria (including weights), or needs to retrieve stored criteria.",
    parameters: z.object({
      action: z.enum(["store", "retrieve", "update", "delete", "list"], {
        description:
          "Action to perform: 'store' to save new criteria, 'retrieve' to get latest criteria, 'update' to modify existing criteria, 'delete' to remove criteria, 'list' to get all criteria versions",
      }),
      criteria: z.string().nullable().optional().describe(
        "Criteria object as JSON string (required for 'store' and 'update' actions). Structure with weights: '{\"criterionName\": {\"weight\": 0.3, \"required\": true, \"value\": \"...\"}, ...}'. Weights should sum to ≤ 1.0. Example: {\"expiryDate\": {\"weight\": 0.4, \"required\": true, \"value\": \"2025-12-31\"}, \"agencyName\": {\"weight\": 0.3, \"required\": true, \"value\": \"ABC Agency\"}}"
      ),
      description: z.string().nullable().optional().describe(
        "Natural language description of the criteria (optional, useful for 'store' and 'update' actions)"
      ),
      threshold: z.number().nullable().optional().describe(
        "Pass/fail threshold (0-100) for scoring. Defaults to 70 if not provided. Used with calculate_score tool."
      ),
      criteriaId: z.string().nullable().optional().describe(
        "ID of the criteria to update or delete (required for 'update' and 'delete' actions)"
      ),
    }),
    execute: async ({ action, criteria, description, threshold, criteriaId }) => {
      try {
        switch (action) {
          case "store":
            if (!criteria) {
              return JSON.stringify({
                success: false,
                error: "Criteria object is required for 'store' action",
              });
            }
            // Parse criteria from JSON string
            let parsedCriteria;
            try {
              parsedCriteria = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;
            } catch (parseError) {
              return JSON.stringify({
                success: false,
                error: `Invalid JSON in criteria: ${parseError.message}`,
              });
            }
            const stored = await storeCriteria(sessionId, parsedCriteria, description, threshold);
            return JSON.stringify({
              success: true,
              action: "stored",
              criteriaId: stored.id,
              criteria: stored.criteria,
              description: stored.description,
              threshold: stored.threshold,
              createdAt: stored.createdAt.toISOString(),
              message: "Criteria stored successfully",
            });

          case "retrieve":
            const retrieved = await getCriteria(sessionId);
            if (!retrieved) {
              return JSON.stringify({
                success: true,
                action: "retrieved",
                criteria: null,
                message: "No criteria found for this session",
              });
            }
            return JSON.stringify({
              success: true,
              action: "retrieved",
              criteriaId: retrieved.id,
              criteria: retrieved.criteria,
              description: retrieved.description,
              threshold: retrieved.threshold,
              createdAt: retrieved.createdAt.toISOString(),
              updatedAt: retrieved.updatedAt.toISOString(),
            });

          case "update":
            if (!criteriaId) {
              return JSON.stringify({
                success: false,
                error: "criteriaId is required for 'update' action",
              });
            }
            if (!criteria) {
              return JSON.stringify({
                success: false,
                error: "Criteria object is required for 'update' action",
              });
            }
            // Parse criteria from JSON string
            let parsedUpdateCriteria;
            try {
              parsedUpdateCriteria = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;
            } catch (parseError) {
              return JSON.stringify({
                success: false,
                error: `Invalid JSON in criteria: ${parseError.message}`,
              });
            }
            const updated = await updateCriteria(
              criteriaId,
              parsedUpdateCriteria,
              description,
              threshold
            );
            return JSON.stringify({
              success: true,
              action: "updated",
              criteriaId: updated.id,
              criteria: updated.criteria,
              description: updated.description,
              threshold: updated.threshold,
              updatedAt: updated.updatedAt.toISOString(),
              message: "Criteria updated successfully",
            });

          case "delete":
            if (!criteriaId) {
              return JSON.stringify({
                success: false,
                error: "criteriaId is required for 'delete' action",
              });
            }
            const deleted = await deleteCriteria(criteriaId);
            return JSON.stringify({
              success: true,
              action: "deleted",
              criteriaId: deleted.id,
              message: "Criteria deleted successfully",
            });

          case "list":
            const allCriteria = await getAllCriteriaForSession(sessionId);
            return JSON.stringify({
              success: true,
              action: "listed",
              count: allCriteria.length,
              criteria: allCriteria.map((c) => ({
                id: c.id,
                criteria: c.criteria,
                description: c.description,
                threshold: c.threshold,
                createdAt: c.createdAt.toISOString(),
                updatedAt: c.updatedAt.toISOString(),
              })),
            });

          default:
            return JSON.stringify({
              success: false,
              error: `Unknown action: ${action}`,
            });
        }
      } catch (error) {
        console.error("Error in manage_criteria tool:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "An error occurred while managing criteria",
        });
      }
    },
  });
}
