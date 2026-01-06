import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { STATUS } from "../state.js";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

/**
 * Conversation node: Handles user conversation and extracts criteria
 */
export async function conversationNode(state) {
  const { status, criteria, criteriaDescription, uploadedDocument, messages } = state;

  // If no document uploaded, ask for upload
  if (!uploadedDocument) {
    return {
      ...state,
      status: STATUS.AWAITING_UPLOAD,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "Please upload a certificate document first before we can proceed with evaluation."
        }
      ]
    };
  }

  // Get the last user message
  const lastUserMessage = messages[messages.length - 1];
  if (!lastUserMessage || lastUserMessage.role !== "user") {
    // No user message, just return current state
    return state;
  }

  // If criteria already exists and status is ready_to_validate, don't process again
  if (criteria && status === STATUS.READY_TO_VALIDATE) {
    return state;
  }

  // Use LLM to extract criteria from user message
  const criteriaPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an assistant that extracts evaluation criteria from user messages.
The user wants to evaluate a certificate. Extract the criteria they mention.

The user can specify:
1. The TYPES of criteria to check (e.g., \"agency name\", \"expiry date\", or ANY other custom business rule)
2. The VALUES or CONDITIONS to validate against (e.g., \"agency name should be ABC Agency\", \"expiry date should be after 2025-12-31\", \"certificate should cover ISO 27001\", etc.)

Common criteria types:
You are NOT limited to pre-defined fields. Represent criteria in a flexible JSON structure.

Return a JSON object with:
- "structured": an object with any structured fields you can infer (like agencyName, expiryDate, standard, scope, etc.). Use keys that match the user’s intent.
- "description": a concise natural-language description of how the user wants the certificate to be validated.

Rules:
- If the user provides specific fields and values, include them in "structured".
- If the user only describes criteria in natural language, keep "structured" minimal and put the main explanation into "description".
- Never invent criteria that are not implied by the user message.

Examples:
User: "I want to validate based on agency name and expiry date"
→ {{
  "structured": {{"agencyName": true, "expiryDate": true}},
  "description": "Validate the certificate by confirming the issuing agency name and checking that the expiry date is correct."
}}

User: "Validate certificate based on agency name ABC Agency and expiry date 2025-12-31"
→ {{
  "structured": {{"agencyName": "ABC Agency", "expiryDate": "2025-12-31"}},
  "description": "Check that the certificate is issued by ABC Agency and that it expires on 2025-12-31."
}}

User: "Check if agency is XYZ Corp"
→ {{
  "structured": {{"agencyName": "XYZ Corp"}},
  "description": "Verify that the certificate's issuing agency is XYZ Corp."
}}

User: "Validate that this certificate covers ISO 27001 and is valid for my company until at least 2026."
→ {{
  "structured": {{"standard": "ISO 27001", "validUntilAtLeast": "2026-01-01"}},
  "description": "Confirm that the certificate covers ISO 27001 and that its validity extends to at least some time in 2026."
}}

Only return valid JSON, no other text.`
    ],
    ["human", "User message: {userMessage}"]
  ]);

  const criteriaChain = criteriaPrompt.pipe(llm);
  let extractedCriteria = null;
  
  try {
    const criteriaResponse = await criteriaChain.invoke({
      userMessage: lastUserMessage.content
    });
    
    // Parse the JSON response
    const criteriaText = criteriaResponse.content.trim();
    // Remove markdown code blocks if present
    const cleanedText = criteriaText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    extractedCriteria = JSON.parse(cleanedText);
  } catch (error) {
    console.error("Error extracting criteria:", error);
    // Fallback: simple keyword-based extraction so the user
    // doesn't get stuck being asked the same question repeatedly.
    const normalized = (lastUserMessage.content || "").toLowerCase();
    const simpleCriteria = {
      agencyName: null,
      expiryDate: null
    };

    // If the user mentions expiry-related words, assume they
    // want to validate based on expiry date.
    if (
      normalized.includes("expiry") ||
      normalized.includes("expiration") ||
      normalized.includes("expire") ||
      normalized.includes("valid till") ||
      normalized.includes("valid until")
    ) {
      simpleCriteria.expiryDate = true;
    }

    // If the user mentions agency, assume they want that too.
    if (normalized.includes("agency")) {
      simpleCriteria.agencyName = true;
    }

    const hasSimpleCriteria =
      (simpleCriteria.agencyName !== null && simpleCriteria.agencyName !== false) ||
      (simpleCriteria.expiryDate !== null && simpleCriteria.expiryDate !== false);

    if (hasSimpleCriteria) {
      const newStatus = STATUS.READY_TO_VALIDATE;

      return {
        ...state,
        criteria: simpleCriteria,
        criteriaDescription: criteriaDescription || "Validate the certificate using the mentioned expiry/agency-related criteria.",
        status: newStatus,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: `Got it! I'll evaluate your certificate based on: ${Object.entries(simpleCriteria)
              .filter(([_, value]) => value !== null)
              .map(([key, value]) => `${key}${value ? "" : ""}`)
              .join(", ")}. Let me proceed with the validation.`
          }
        ]
      };
    }

    // If we still couldn't infer anything, ask for clarification.
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "I need more information to proceed. Please specify how you want to evaluate your certificate. For example: 'I want to validate the certificate based on agency name, expiry date, or any other criteria you care about'."
        }
      ]
    };
  }

  // At this point, extractedCriteria should be an object with:
  // { structured: {...}, description: "..." }
  const structured = extractedCriteria?.structured || {};
  const description = extractedCriteria?.description || "";

  // Check if we have at least some structured criteria OR a non-empty description
  const hasStructuredKeys = structured && Object.keys(structured).length > 0;
  const hasDescription = typeof description === "string" && description.trim().length > 0;

  const hasCriteria = hasStructuredKeys || hasDescription;

  if (!hasCriteria) {
    // Ask for clarification
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "I need you to specify the evaluation criteria. For example, you can say: 'Validate that this certificate is still valid based on its expiry date', or 'Check if it covers ISO 27001 and is issued to my company'. What criteria would you like me to check?"
        }
      ]
    };
  }

  // Criteria extracted successfully
  const newStatus = STATUS.READY_TO_VALIDATE;
  
  return {
    ...state,
    criteria: structured,
    criteriaDescription: description,
    status: newStatus,
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: `Got it! I'll evaluate your certificate based on your criteria: ${description || "the criteria you described"}. Let me proceed with the validation.`
      }
    ]
  };
}

