import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentGraphState } from "./graphState.js";
import { routerNode } from "./routerAgent.js";
import { createGeneralAgentNode } from "./generalAgent.js";
import { createCertificateValidationAgentNode } from "./certificateAgent.js";
import { hasDocumentsForSession } from "../utils/documentQuery.js";

/**
 * Conditional edge function to route from router to appropriate agent
 */
function routeFromRouter(state) {
  const { routerDecision, documentsExist, sessionId } = state;
  
  // Handle AGENT_INFO special case: route to certificate if documents exist, else general
  if (routerDecision === "AGENT_INFO") {
    // We need to check documentsExist, but it might not be set yet
    // So we'll handle this in the graph by checking it dynamically
    // For now, return a special route that will be handled by another conditional
    return "agent_info_handler";
  }
  
  if (routerDecision === "GENERAL") {
    return "general";
  }
  
  if (routerDecision === "CERTIFICATE") {
    return "certificate";
  }
  
  // Default fallback
  return "general";
}

/**
 * Handler for AGENT_INFO routing - checks documentsExist and routes accordingly
 */
async function agentInfoHandlerNode(state) {
  const { sessionId } = state;
  
  // Check if documents exist for this session
  const documentsExist = await hasDocumentsForSession(sessionId);
  
  return {
    documentsExist,
  };
}

/**
 * Conditional edge from agent_info_handler
 */
function routeFromAgentInfoHandler(state) {
  const { documentsExist } = state;
  
  if (documentsExist) {
    return "certificate";
  } else {
    return "general";
  }
}

/**
 * Create the main agent graph
 * @param {string} sessionId - Session ID for tool filtering
 * @returns {CompiledGraph} Compiled LangGraph
 */
export function createAgentGraph(sessionId) {
  // Create agent nodes with session-specific tools
  const generalAgent = createGeneralAgentNode(sessionId);
  const certificateAgent = createCertificateValidationAgentNode(sessionId);
  
  // Build the graph
  const graph = new StateGraph(AgentGraphState)
    // Router node
    .addNode("router", routerNode)
    
    // Agent info handler node
    .addNode("agent_info_handler", agentInfoHandlerNode)
    
    // General agent nodes
    .addNode("general_agent", generalAgent.callModel)
    .addNode("general_tools", generalAgent.toolNode)
    
    // Certificate agent nodes
    .addNode("certificate_agent", certificateAgent.callModel)
    .addNode("certificate_tools", certificateAgent.toolNode)
    
    // Entry point
    .addEdge(START, "router")
    
    // Router conditional edges
    .addConditionalEdges("router", routeFromRouter, {
      general: "general_agent",
      certificate: "certificate_agent",
      agent_info_handler: "agent_info_handler",
    })
    
    // Agent info handler conditional edges
    .addConditionalEdges("agent_info_handler", routeFromAgentInfoHandler, {
      general: "general_agent",
      certificate: "certificate_agent",
    })
    
    // General agent conditional edges
    .addConditionalEdges("general_agent", generalAgent.shouldContinue, {
      tools: "general_tools",
      __end__: END,
    })
    .addEdge("general_tools", "general_agent")
    
    // Certificate agent conditional edges
    .addConditionalEdges("certificate_agent", certificateAgent.shouldContinue, {
      tools: "certificate_tools",
      __end__: END,
    })
    .addEdge("certificate_tools", "certificate_agent");
  
  return graph;
}
