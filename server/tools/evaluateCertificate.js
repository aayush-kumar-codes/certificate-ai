import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCriteria, getCriteriaById } from "../services/criteriaService.js";
import { searchDocuments } from "./searchDocs.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

/**
 * Create an evaluate certificate tool with sessionId injected from context
 * This tool performs validation checks against criteria and returns structured results
 */
export function createEvaluateCertificateTool(sessionId) {
  return tool(
    async ({ criteriaId, criteria, documentId }) => {
      try {
        // Retrieve criteria
        let criteriaObj = null;
        if (criteriaId) {
          const storedCriteria = await getCriteriaById(criteriaId);
          if (!storedCriteria) {
            return JSON.stringify({
              success: false,
              error: `Criteria with ID ${criteriaId} not found`,
            });
          }
          criteriaObj = storedCriteria.criteria;
        } else if (criteria) {
          try {
            criteriaObj = typeof criteria === "string" ? JSON.parse(criteria) : criteria;
          } catch (parseError) {
            return JSON.stringify({
              success: false,
              error: `Invalid JSON in criteria: ${parseError.message}`,
            });
          }
        } else {
          // Try to get latest criteria for session
          const latestCriteria = await getCriteria(sessionId);
          if (!latestCriteria) {
            return JSON.stringify({
              success: false,
              error: "No criteria found. Please provide criteriaId or criteria parameter, or store criteria first.",
            });
          }
          criteriaObj = latestCriteria.criteria;
        }

        if (!criteriaObj || typeof criteriaObj !== "object") {
          return JSON.stringify({
            success: false,
            error: "Invalid criteria format. Criteria must be an object.",
          });
        }

        // Get criteria entries
        const criteriaEntries = Object.entries(criteriaObj);
        if (criteriaEntries.length === 0) {
          return JSON.stringify({
            success: false,
            error: "Criteria object is empty. Please provide at least one criterion.",
          });
        }

        // Search documents
        const searchQueries = criteriaEntries.map(([criterionName, criterionData]) => {
          const value = criterionData?.value || criterionData;
          return `Find information about ${criterionName}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
        });

        // Combine queries for comprehensive search
        const combinedQuery = searchQueries.join(" ");
        const searchResults = await searchDocuments(combinedQuery, {
          sessionId,
          documentId,
          topK: 10,
        });

        if (!searchResults.results || searchResults.results.length === 0) {
          return JSON.stringify({
            success: true,
            passed: false,
            checks: criteriaEntries.map(([criterionName, criterionData]) => ({
              criterion: criterionName,
              expected: criterionData?.value || criterionData,
              found: null,
              passed: false,
              weight: criterionData?.weight || 0,
              confidence: 0,
              reason: "No relevant information found in documents",
            })),
            evidence: [],
            message: "No relevant certificate data found in documents.",
          });
        }

        // Build context from search results
        const context = searchResults.results
          .map((r) => r.pageContent)
          .join("\n\n");

        // Prepare criteria description for LLM
        const criteriaDescription = criteriaEntries
          .map(([name, data]) => {
            const value = data?.value || data;
            const required = data?.required !== false;
            return `- ${name}: ${typeof value === "string" ? value : JSON.stringify(value)} (${required ? "required" : "optional"})`;
          })
          .join("\n");

        // Use LLM to perform validation
        const validationPrompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            `You are an advanced Certificate Validation Agent.

You receive:
- Retrieved certificate content chunks from a vector database
- A structured JSON object of evaluation criteria with weights

Your job:
- Carefully read the provided certificate content (context)
- For each criterion, check if it is satisfied
- Return structured validation results

Output format:
Return ONLY valid JSON with the following shape:
{{
  "checks": [
    {{
      "criterion": string,
      "expected": string or object,
      "found": string or object,
      "passed": boolean,
      "confidence": number (0-1),
      "reason": string
    }}
  ],
  "evidence": array of strings (relevant excerpts from documents)
}}

Guidelines:
- Be honest about uncertainty – if information is missing, mark passed=false and explain in "found" and "reason"
- Confidence should reflect how certain you are about the check (0.0 = uncertain, 1.0 = certain)
- Extract relevant evidence excerpts from the context
- Do NOT use external knowledge; rely only on the provided context`,
          ],
          [
            "human",
            `Certificate context (from vector DB):
{context}

Criteria to validate:
{criteriaDescription}

For each criterion, determine if it passes or fails based on the certificate content.`,
          ],
        ]);

        const chain = validationPrompt.pipe(llm);
        const validationResponse = await chain.invoke({
          context,
          criteriaDescription,
        });

        // Parse LLM response
        let validationJson;
        try {
          const content = validationResponse.content;
          // Extract JSON from markdown code blocks if present
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || content.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            validationJson = JSON.parse(jsonMatch[1]);
          } else {
            validationJson = JSON.parse(content);
          }
        } catch (parseError) {
          return JSON.stringify({
            success: false,
            error: `Failed to parse validation response: ${parseError.message}. Response: ${validationResponse.content}`,
          });
        }

        // Add weights to checks
        const checksWithWeights = validationJson.checks.map((check) => {
          const criterionData = criteriaObj[check.criterion];
          return {
            ...check,
            weight: criterionData?.weight || 0,
            required: criterionData?.required !== false,
          };
        });

        // Determine overall pass status (all required criteria must pass)
        const requiredChecks = checksWithWeights.filter((c) => c.required);
        const allRequiredPassed = requiredChecks.length === 0 || requiredChecks.every((c) => c.passed);

        return JSON.stringify({
          success: true,
          passed: allRequiredPassed,
          checks: checksWithWeights,
          evidence: validationJson.evidence || [],
          documents: searchResults.groupedByDocument || [],
          message: allRequiredPassed
            ? "Certificate evaluation completed. All required criteria passed."
            : "Certificate evaluation completed. Some required criteria failed.",
        });
      } catch (error) {
        console.error("Error in evaluate_certificate tool:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "An error occurred while evaluating the certificate",
        });
      }
    },
    {
      name: "evaluate_certificate",
      description:
        "Evaluate a certificate against stored or provided criteria. This tool searches the certificate documents, performs validation checks for each criterion, and returns structured results with pass/fail status, evidence, and confidence scores. Use this before calculate_score to get evaluation results.",
      schema: z.object({
        criteriaId: z.string().nullable().optional().describe(
          "ID of the stored criteria to use for evaluation (optional if criteria is provided)"
        ),
        criteria: z.string().nullable().optional().describe(
          "Criteria object as JSON string (optional if criteriaId is provided). Structure: JSON string with weights like '{\"criterionName\": {\"weight\": 0.3, \"required\": true, \"value\": \"...\"}, ...}'"
        ),
        documentId: z.string().nullable().optional().describe(
          "Optional document ID to evaluate a specific document. If not provided, evaluates all documents in the session."
        ),
      })
    }
  );
}
