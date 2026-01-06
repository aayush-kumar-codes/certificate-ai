import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { STATUS } from "../state.js";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7, // Increased for more natural conversation
});

/**
 * Conversation node: Handles user conversation, general questions, and extracts criteria
 * Maintains continuous conversation flow like a human would
 */
export async function conversationNode(state) {
  const { status, criteria, criteriaDescription, uploadedDocument, messages, thinking, validationResult } = state;

  // Get the last user message
  const lastUserMessage = messages[messages.length - 1];
  if (!lastUserMessage || lastUserMessage.role !== "user") {
    return state;
  }

  const userMessage = lastUserMessage.content.toLowerCase().trim();

  // Check if user wants to stop/end conversation
  const stopKeywords = ["stop", "end", "bye", "goodbye", "that's all", "that's it", "nothing else", "no more"];
  if (stopKeywords.some(keyword => userMessage.includes(keyword))) {
    return {
      ...state,
      shouldContinue: false,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "Understood! I'll stop here. Feel free to come back anytime if you need help with certificate validation. Have a great day! 👋"
        }
      ]
    };
  }

  // Handle general conversational questions (hi, hello, chat history, etc.)
  const isGeneralQuestion = 
    userMessage.startsWith("hi") || 
    userMessage.startsWith("hello") || 
    userMessage.startsWith("hey") ||
    userMessage.includes("how are you") ||
    userMessage.includes("what can you do") ||
    userMessage.includes("chat history") ||
    userMessage.includes("conversation history") ||
    userMessage.includes("what did we talk about") ||
    userMessage.includes("remember") ||
    userMessage.includes("do you remember");

  if (isGeneralQuestion) {
    const conversationPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a friendly and helpful AI assistant specializing in certificate validation. You maintain conversation history and can answer general questions naturally.

Current context:
- Document uploaded: ${uploadedDocument ? `Yes (${uploadedDocument.originalname || uploadedDocument.filename})` : "No"}
- Criteria set: ${criteria ? "Yes" : "No"}
- Validation completed: ${validationResult ? "Yes" : "No"}
- Status: ${status}

You have access to the full conversation history. Be conversational, helpful, and natural. If asked about chat history, summarize the key points of the conversation. Always maintain a friendly, professional tone.`
      ],
      [
        "human",
        `Conversation history:
{history}

User's question: {userMessage}

Provide a natural, conversational response. If this is about certificate validation, gently guide them back to that topic.`
      ]
    ]);

    const conversationChain = conversationPrompt.pipe(llm);
    
    try {
      const conversationHistory = messages
        .slice(-20) // Last 20 messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join("\n");

      const response = await conversationChain.invoke({
        history: conversationHistory,
        userMessage: lastUserMessage.content
      });

      // After answering, ask a follow-up question to continue the conversation
      const followUpPrompt = ChatPromptTemplate.fromMessages([
        [
          "system",
          `Based on the conversation, suggest a natural follow-up question to continue helping the user with certificate validation. Keep it brief (1 sentence max) and relevant. If they haven't uploaded a document, ask about that. If they have, ask about validation criteria.`
        ],
        [
          "human",
          `Context: ${uploadedDocument ? "Document uploaded" : "No document yet"}. ${criteria ? "Criteria set" : "No criteria yet"}. ${validationResult ? "Validation done" : "No validation yet"}.

Generate a brief, natural follow-up question (just the question, no explanation).`
        ]
      ]);

      const followUpChain = followUpPrompt.pipe(llm);
      const followUpResponse = await followUpChain.invoke({});
      const followUpQuestion = followUpResponse.content.trim();

      return {
        ...state,
        shouldContinue: true,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: `${response.content}\n\n${followUpQuestion}`
          }
        ]
      };
    } catch (error) {
      console.error("Error in general conversation:", error);
      return {
        ...state,
        shouldContinue: true,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: "I'm here to help! How can I assist you with certificate validation today?"
          }
        ]
      };
    }
  }

  // If no document uploaded, ask for upload
  if (!uploadedDocument) {
    return {
      ...state,
      status: STATUS.AWAITING_UPLOAD,
      shouldContinue: true,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "I'd be happy to help you validate a certificate! To get started, please upload a certificate document. Once you upload it, I'll help you set up the validation criteria. 📄"
        }
      ]
    };
  }

  // If validation is already done, handle follow-up questions about results
  if (validationResult && status === STATUS.VALIDATED) {
    // Check if user is asking about validation results or wants to do something else
    const isAboutValidation = 
      userMessage.includes("result") ||
      userMessage.includes("validation") ||
      userMessage.includes("pass") ||
      userMessage.includes("fail") ||
      userMessage.includes("check") ||
      userMessage.includes("validate again") ||
      userMessage.includes("new criteria");

    if (isAboutValidation) {
      // User wants to discuss validation or validate with new criteria
      // Reset criteria to allow new validation
      if (userMessage.includes("new criteria") || userMessage.includes("validate again") || userMessage.includes("different")) {
        return {
          ...state,
          criteria: null,
          criteriaDescription: "",
          validationResult: null,
          status: STATUS.AWAITING_CRITERIA,
          shouldContinue: true,
          messages: [
            ...state.messages,
            {
              role: "assistant",
              content: "Sure! Let's set up new validation criteria. What would you like to validate this time? For example, you could check the agency name, expiry date, or any other specific requirements you have."
            }
          ]
        };
      }
    }
  }

  // If criteria already exists and status is ready_to_validate, don't process again
  if (criteria && status === STATUS.READY_TO_VALIDATE && !userMessage.includes("new") && !userMessage.includes("change")) {
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
        shouldContinue: true,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: `Got it! I'll evaluate your certificate based on: ${Object.entries(simpleCriteria)
              .filter(([_, value]) => value !== null)
              .map(([key, value]) => `${key}${value ? "" : ""}`)
              .join(", ")}. Would you like me to proceed with the validation now?`
          }
        ]
      };
    }

    // If we still couldn't infer anything, ask for clarification with a follow-up.
    return {
      ...state,
      shouldContinue: true,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: "I need more information to proceed. Please specify how you want to evaluate your certificate. For example: 'I want to validate the certificate based on agency name, expiry date, or any other criteria you care about'. What specific criteria would you like me to check?"
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
      shouldContinue: true,
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
  
  // Generate a natural follow-up question to continue conversation
  const followUpPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `After confirming criteria extraction, ask a brief, natural follow-up question to continue the conversation. Examples:
- "Would you like me to proceed with validation now?"
- "Is there anything else you'd like me to check?"
- "Should I validate the certificate with these criteria?"

Keep it to 1 sentence, friendly and conversational.`
    ],
    [
      "human",
      `Criteria extracted: ${description || JSON.stringify(structured)}. Generate a brief follow-up question.`
    ]
  ]);

  let followUpQuestion = "Would you like me to proceed with validation now?";
  try {
    const followUpChain = followUpPrompt.pipe(llm);
    const followUpResponse = await followUpChain.invoke({});
    followUpQuestion = followUpResponse.content.trim();
  } catch (error) {
    console.error("Error generating follow-up:", error);
  }
  
  return {
    ...state,
    criteria: structured,
    criteriaDescription: description,
    status: newStatus,
    shouldContinue: true,
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: `Got it! I'll evaluate your certificate based on your criteria: ${description || "the criteria you described"}. ${followUpQuestion}`
      }
    ]
  };
}

