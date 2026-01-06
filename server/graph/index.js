import { StateGraph, END } from "@langchain/langgraph";
import { CertificateEvaluationState, STATUS } from "./state.js";
import { uploadNode } from "./nodes/uploadNode.js";
import { conversationNode } from "./nodes/conversationNode.js";
import { validationNode } from "./nodes/validationNode.js";
import { responseNode } from "./nodes/responseNode.js";
import { thinkingNode } from "./nodes/thinkingNode.js";

// Conditional edge function: route in conversation
function routeConversation(state) {
  const { status, criteria, shouldContinue, messages } = state;
  
  // If user wants to stop, end conversation
  if (shouldContinue === false) {
    return END;
  }
  
  // Check if there's a new user message (conversation node just processed it)
  const lastMessage = messages[messages.length - 1];
  const hasNewUserMessage = lastMessage && lastMessage.role === "user";
  
  // If we have criteria and are ready, and there's a new user message requesting validation, go to validation
  if (status === STATUS.READY_TO_VALIDATE && criteria && hasNewUserMessage) {
    const hasCriteria = (
      (criteria.agencyName !== null && criteria.agencyName !== false) ||
      (criteria.expiryDate !== null && criteria.expiryDate !== false) ||
      (criteria && Object.keys(criteria).length > 0)
    );
    if (hasCriteria) {
      return "validate";
    }
  }
  
  // If validated and there's a new user message, check if they want to validate again
  // Otherwise, we've already responded, so wait for next user input
  if (status === STATUS.VALIDATED) {
    // If there's a new user message, process it in conversation (already done)
    // The conversation node will handle whether to reset criteria or continue
    // Just end here and wait for next user input
    return END;
  }
  
  // If still awaiting criteria or in conversation, continue waiting for user input
  // The next user message will trigger the graph again via router
  return END;
}

// Router node: Determines which node to execute based on state
async function routerNode(state) {
  const { status, uploadedDocument, criteria, messages } = state;
  
  // Check if there's a new user message
  const lastMessage = messages[messages.length - 1];
  const hasNewUserMessage = lastMessage && lastMessage.role === "user";
  
  // If no document, we're at upload stage
  if (!uploadedDocument || status === STATUS.AWAITING_UPLOAD) {
    return state; // Will route to upload
  }
  
  // If validated and there's a new user message, go to conversation to handle it
  if (status === STATUS.VALIDATED && hasNewUserMessage) {
    return state; // Will route to conversation
  }
  
  // If we have criteria and are ready, go to validation
  if (status === STATUS.READY_TO_VALIDATE && criteria) {
    return state; // Will route to validate
  }
  
  // If validated but no new user message, we've already responded
  if (status === STATUS.VALIDATED) {
    return state; // Will route to response (but response already sent, so will end)
  }
  
  // Default to conversation for all other cases
  return state;
}

// Conditional edge from router
function routeFromState(state) {
  const { status, uploadedDocument, criteria, messages } = state;
  
  // Check if we need to handle upload
  if (!uploadedDocument || status === STATUS.AWAITING_UPLOAD) {
    return "upload";
  }
  
  // Check if we need validation (only if we have criteria and are ready)
  if (status === STATUS.READY_TO_VALIDATE && criteria) {
    const hasCriteria = (
      (criteria.agencyName !== null && criteria.agencyName !== false) ||
      (criteria.expiryDate !== null && criteria.expiryDate !== false) ||
      (criteria && Object.keys(criteria).length > 0)
    );
    if (hasCriteria) {
      return "validate";
    }
  }
  
  // If validated and there's a new user message, go to conversation to handle it
  const lastMessage = messages[messages.length - 1];
  if (status === STATUS.VALIDATED && lastMessage && lastMessage.role === "user") {
    return "conversation";
  }
  
  // If validated but no new user message, response was already sent
  if (status === STATUS.VALIDATED) {
    return "response";
  }
  
  // Default to conversation (for awaiting criteria, general questions, etc.)
  return "conversation";
}

// Conditional edge from response: continue conversation or end
function routeFromResponse(state) {
  const { shouldContinue } = state;
  
  // If shouldContinue is false, end conversation
  if (shouldContinue === false) {
    return END;
  }
  
  // After response, we've sent a message with follow-up question
  // End here and wait for the next user input (which will trigger the graph again)
  return END;
}

// Build the graph
const graph = new StateGraph(CertificateEvaluationState);

// Add nodes
graph.addNode("think", thinkingNode);
graph.addNode("router", routerNode);
graph.addNode("upload", uploadNode);
graph.addNode("conversation", conversationNode);
graph.addNode("validate", validationNode);
graph.addNode("response", responseNode);

// Add edges
graph.setEntryPoint("think");
graph.addEdge("think", "router");
graph.addConditionalEdges("router", routeFromState, {
  upload: "upload",
  conversation: "conversation",
  validate: "validate",
  response: "response"
});

graph.addEdge("upload", "conversation");
graph.addConditionalEdges("conversation", routeConversation, {
  validate: "validate",
  response: "response",
  [END]: END
});
graph.addEdge("validate", "response");
graph.addConditionalEdges("response", routeFromResponse, {
  conversation: "conversation",
  [END]: END
});

// Compile the graph
export const certificateEvaluationGraph = graph.compile();

