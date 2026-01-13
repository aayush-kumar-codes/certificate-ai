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

Analyze the following certificate document content and generate appropriate evaluation criteria with weights.

Document Content:
${allDocumentContent.substring(0, 8000)} ${allDocumentContent.length > 8000 ? "...(truncated)" : ""}

Generate criteria that:
1. Are relevant to the certificate type and content
2. Include common certificate validation points (expiry dates, issuing agency, certificate numbers, standards, scope, etc.)
3. Have appropriate weights that sum to ≤ 1.0
4. Include specific values found in the document when applicable

Return ONLY a valid JSON object in this exact format:
{
  "criteria": {
    "criterionName1": {
      "weight": 0.3,
      "required": true,
      "value": "specific value or null"
    },
    "criterionName2": {
      "weight": 0.2,
      "required": true,
      "value": null
    }
  },
  "description": "Natural language description of the criteria",
  "threshold": 70
}

Example:
{
  "criteria": {
    "expiryDate": {
      "weight": 0.4,
      "required": true,
      "value": null
    },
    "agencyName": {
      "weight": 0.3,
      "required": true,
      "value": "ABC Certification Agency"
    },
    "certificateNumber": {
      "weight": 0.2,
      "required": false,
      "value": null
    },
    "standardCompliance": {
      "weight": 0.1,
      "required": false,
      "value": "ISO 27001"
    }
  },
  "description": "Validate certificate expiry date, verify issuing agency is ABC Certification Agency, check certificate number format, and confirm ISO 27001 compliance.",
  "threshold": 70
}

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
