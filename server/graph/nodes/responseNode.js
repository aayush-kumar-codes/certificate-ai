import { STATUS } from "../state.js";

/**
 * Response node: Formats validation result into a human-friendly message
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

  return {
    ...state,
    messages: [
      ...state.messages,
      {
        role: "assistant",
        content: responseMessage
      }
    ]
  };
}

