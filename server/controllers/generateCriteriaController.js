import { searchDocuments } from "../tools/searchDocs.js";
import { ChatOpenAI } from "@langchain/openai";
import { storeCriteria } from "../services/criteriaService.js";
import { hasDocumentsForSession } from "../utils/documentQuery.js";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

export async function generateCriteria(req, res) {
  try {
    const { sessionId, documentId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required",
      });
    }

    // Check if documents exist for this session
    const documentsExist = await hasDocumentsForSession(sessionId);
    if (!documentsExist) {
      return res.status(400).json({
        success: false,
        error: "No documents found for this session. Please upload documents first.",
      });
    }

    // Step 1: Search documents to extract key information
    const extractionQueries = [
      "expiry date expiration valid until",
      "issuing agency organization name",
      "certificate type standard ISO compliance",
      "certificate number serial number",
      "scope coverage domain",
      "requirements conditions",
    ];

    let allDocumentContent = "";
    const documentGroups = new Set();

    for (const query of extractionQueries) {
      const searchResult = await searchDocuments(query, {
        sessionId: documentId ? undefined : sessionId,
        documentId: documentId || undefined,
        topK: 5,
      });

      if (searchResult.results && searchResult.results.length > 0) {
        searchResult.results.forEach((result) => {
          if (result.metadata.document_id) {
            documentGroups.add(result.metadata.document_id);
          }
          allDocumentContent += result.pageContent + "\n\n";
        });
      }
    }

    if (!allDocumentContent.trim()) {
      return res.status(400).json({
        success: false,
        error: "No document content found. Please ensure documents are uploaded.",
      });
    }

    // Step 2: Use LLM to analyze and generate criteria
    const criteriaPrompt = `You are an expert at analyzing certificate documents and generating evaluation criteria.

CRITICAL: You MUST ONLY generate criteria that are EXPLICITLY mentioned or found in the document content below. Do NOT generate criteria that are not present in the document, even if they are common certificate validation points.

Analyze the following certificate document content and generate ONLY the evaluation criteria that are actually present in this document.

Document Content:
${allDocumentContent.substring(0, 8000)} ${allDocumentContent.length > 8000 ? "...(truncated)" : ""}

Rules for generating criteria:
1. ONLY include criteria that are explicitly mentioned or found in the document content above
2. If the document only mentions expiry date, generate ONLY expiry date criteria - do NOT add other criteria like agency name, certificate number, etc. unless they are also mentioned
3. If a criterion is not found in the document, DO NOT include it in the criteria object
4. Extract specific values from the document when available (e.g., if an expiry date is mentioned, include it as the value)
5. Weights should sum to ≤ 1.0 and be proportional to the importance of each criterion in the document
6. Mark criteria as "required": true only if the document indicates they are mandatory

Return ONLY a valid JSON object in this exact format:
{
  "criteria": {
    "criterionName1": {
      "weight": 0.3,
      "required": true,
      "value": "specific value or null"
    }
  },
  "description": "Natural language description of the criteria",
  "threshold": 70
}

Example 1 - Document only mentions expiry date:
{
  "criteria": {
    "expiryDate": {
      "weight": 1.0,
      "required": true,
      "value": "2025-12-31"
    }
  },
  "description": "Validate that the certificate expiry date is 2025-12-31.",
  "threshold": 70
}

Example 2 - Document mentions multiple criteria:
{
  "criteria": {
    "expiryDate": {
      "weight": 0.5,
      "required": true,
      "value": null
    },
    "agencyName": {
      "weight": 0.5,
      "required": true,
      "value": "ABC Certification Agency"
    }
  },
  "description": "Validate certificate expiry date and verify issuing agency is ABC Certification Agency.",
  "threshold": 70
}

IMPORTANT: If the document content is empty or contains no identifiable criteria, return an empty criteria object: {"criteria": {}, "description": "No criteria found in document", "threshold": 70}

Return ONLY the JSON, no other text.`;

    const llmResponse = await llm.invoke(criteriaPrompt);
    const responseText =
      typeof llmResponse.content === "string"
        ? llmResponse.content
        : String(llmResponse.content);

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/^```\n?/, "");
      jsonText = jsonText.replace(/\n?```$/, "");
    }
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    // Step 3: Store the generated criteria
    const stored = await storeCriteria(
      sessionId,
      parsed.criteria,
      parsed.description,
      parsed.threshold || 70
    );

    return res.json({
      success: true,
      criteriaId: stored.id,
      criteria: stored.criteria,
      description: stored.description,
      threshold: stored.threshold,
      message: "Criteria generated and stored successfully",
    });
  } catch (error) {
    console.error("Error generating criteria:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate criteria",
    });
  }
}
