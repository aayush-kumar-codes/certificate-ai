import { STATUS } from "../state.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7,
});

/**
 * Response node: Formats validation result into a human-friendly message
 * and asks follow-up questions to continue the conversation
 */
export async function responseNode(state) {
  const { validationResult, criteria, criteriaDescription, extractedFields, status } = state;

  if (status !== STATUS.VALIDATED || !validationResult) {
    return state;
  }

  // Build a friendly response message
  let responseMessage = "## Certificate Validation Results\n\n";

  if (validationResult.passed) {
    responseMessage += "✅ **Certificate validation PASSED**\n\n";
  } else {
    responseMessage += "❌ **Certificate validation FAILED**\n\n";
  }

  if (validationResult.summary) {
    responseMessage += `${validationResult.summary}\n\n`;
  }

  responseMessage += "### Evaluation Criteria:\n";
  if (criteriaDescription) {
    responseMessage += `- **Description**: ${criteriaDescription}\n`;
  }
  if (criteria && Object.keys(criteria).length > 0) {
    Object.entries(criteria).forEach(([key, value]) => {
      responseMessage += `- **${key}**: ${typeof value === "string" ? value : JSON.stringify(value)}\n`;
    });
  }

  responseMessage += "\n### Validation Details:\n";
  if (Array.isArray(validationResult.checks)) {
    validationResult.checks.forEach((check) => {
      const icon = check.passed ? "✅" : "❌";
      responseMessage += `${icon} **${check.criterion}**: `;
      if (check.passed) {
        responseMessage += `Passed (Expected: ${check.expected}, Found: ${check.found})\n`;
      } else {
        responseMessage += `Failed (Expected: ${check.expected}, Found: ${check.found || "Not found"})\n`;
      }
    });
  }

  // Generate a natural follow-up question to continue conversation
  const followUpPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `After providing validation results, ask a natural follow-up question to continue helping the user. Examples:
- "Would you like to validate with different criteria?"
- "Is there anything else you'd like me to check about this certificate?"
- "Do you have any questions about the validation results?"

Keep it brief (1 sentence), friendly, and relevant. Consider the validation result (passed/failed) when crafting the question.`
    ],
    [
      "human",
      `Validation result: ${validationResult.passed ? "PASSED" : "FAILED"}. Generate a brief, natural follow-up question.`
    ]
  ]);

  let followUpQuestion = "Is there anything else you'd like me to help you with regarding this certificate?";
  try {
    const followUpChain = followUpPrompt.pipe(llm);
    const followUpResponse = await followUpChain.invoke({});
    followUpQuestion = followUpResponse.content.trim();
  } catch (error) {
    console.error("Error generating follow-up:", error);
  }

  return {
    ...state,
    shouldContinue: true,
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: `${responseMessage}\n\n${followUpQuestion}`
      }
    ]
  };
}

