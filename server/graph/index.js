import { StateGraph, END } from "@langchain/langgraph";
import { CertificateEvaluationState, STATUS } from "./state.js";
import { uploadNode } from "./nodes/uploadNode.js";
import { conversationNode } from "./nodes/conversationNode.js";
import { validationNode } from "./nodes/validationNode.js";
import { responseNode } from "./nodes/responseNode.js";

// Conditional edge function: route in conversation
function routeConversation(state) {
  const { status, criteria } = state;
  
  // If we have criteria and are ready, go to validation
  if (status === STATUS.READY_TO_VALIDATE && criteria) {
    const hasCriteria = (
      (criteria.agencyName !== null && criteria.agencyName !== false) ||
      (criteria.expiryDate !== null && criteria.expiryDate !== false)
    );
    if (hasCriteria) {
      return "validate";
    }
  }
  
  // If validated, go to response
  if (status === STATUS.VALIDATED) {
    return "response";
  }
  
  // If still awaiting criteria, we need more user input - end here
  // The next user message will trigger the graph again via router
  return END;
}

// Router node: Determines which node to execute based on state
async function routerNode(state) {
  const { status, uploadedDocument, criteria } = state;
  
  // If no document, we're at upload stage
  if (!uploadedDocument || status === STATUS.AWAITING_UPLOAD) {
    return state; // Will route to upload
  }
  
  // If we have document but no criteria, we're in conversation
  if (status === STATUS.AWAITING_CRITERIA || !criteria) {
    return state; // Will route to conversation
  }
  
  // If we have criteria and are ready, go to validation
  if (status === STATUS.READY_TO_VALIDATE) {
    return state; // Will route to validate
  }
  
  // If validated, go to response
  if (status === STATUS.VALIDATED) {
    return state; // Will route to response
  }
  
  return state;
}

// Conditional edge from router
function routeFromState(state) {
  const { status, uploadedDocument, criteria } = state;
  
  // Check if we need to handle upload
  if (!uploadedDocument || status === STATUS.AWAITING_UPLOAD) {
    return "upload";
  }
  
  // Check if we need validation
  if (status === STATUS.READY_TO_VALIDATE && criteria) {
    const hasCriteria = (
      (criteria.agencyName !== null && criteria.agencyName !== false) ||
      (criteria.expiryDate !== null && criteria.expiryDate !== false)
    );
    if (hasCriteria) {
      return "validate";
    }
  }
  
  // Check if we need response
  if (status === STATUS.VALIDATED) {
    return "response";
  }
  
  // Default to conversation
  return "conversation";
}

// Build the graph
const graph = new StateGraph(CertificateEvaluationState);

// Add nodes
graph.addNode("router", routerNode);
graph.addNode("upload", uploadNode);
graph.addNode("conversation", conversationNode);
graph.addNode("validate", validationNode);
graph.addNode("response", responseNode);

// Add edges
graph.setEntryPoint("router");
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
graph.addEdge("response", END);

// Compile the graph
export const certificateEvaluationGraph = graph.compile();

