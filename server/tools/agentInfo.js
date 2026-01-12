import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Agent information data structure
 */
const AGENT_INFO_DATA = {
    general: {
        name: "General Knowledge Assistant",
        identity: "Internal handler for general conversation and non-certificate queries. Must always respond as the Certificate AI Assistant.",
        capabilities: [
          "Answer general questions",
          "Handle greetings and small talk",
          "Provide platform guidance",
          "Redirect users to certificate features when needed"
        ],
        limitations: [
          "Must not mention being a separate agent",
          "Must not expose internal routing",
          "Must not claim certificate validation actions"
        ]
      },
  certificate: {
    name: "CertificateValidationAgent",
    identity: "I am a certificate validation expert assistant designed to help users validate certificates based on custom criteria.",
    capabilities: [
      "Validate certificates based on custom criteria (expiry dates, agency names, ISO standards, etc.)",
      "Manage validation criteria with configurable weights",
      "Search and analyze uploaded certificate documents",
      "Calculate weighted scores (0-100) for certificate validation",
      "Evaluate multiple certificates in a single session",
      "Store, retrieve, update, and delete validation criteria",
      "Provide detailed validation results with pass/fail status"
    ],
    tools: [
      "search_document - Search uploaded certificate documents (automatically filtered by session)",
      "manage_criteria - Store, retrieve, update, or delete validation criteria with weights",
      "evaluate_certificate - Perform validation checks against stored criteria",
      "calculate_score - Compute weighted scores based on criteria weights",
      "agent_info - Get detailed information about agent capabilities"
    ],
    useCases: [
      "Validating certificate expiry dates",
      "Checking if certificates meet specific agency requirements",
      "Verifying ISO compliance (e.g., ISO 27001)",
      "Validating multiple certificates with custom criteria",
      "Scoring certificates based on weighted criteria",
      "Managing validation criteria throughout a conversation"
    ],
    limitations: [
      "Requires documents to be uploaded before validation",
      "Can only analyze documents uploaded in the current session",
      "Validation is based on extracted text from documents (OCR/PDF parsing)",
      "Cannot verify certificates against external databases",
      "Scoring requires criteria weights to be properly configured"
    ],
    purpose: "To help users validate certificates by analyzing uploaded documents against custom criteria, calculating weighted scores, and providing detailed validation results."
  }
};

/**
 * Create an agent info tool with agentType injected from context
 * This factory function allows us to inject agentType without making it a tool parameter
 */
export function createAgentInfoTool(agentType, sessionId) {
  return tool({
    name: "agent_info",
    description: "Get detailed information about this agent's capabilities, tools, use cases, and limitations. Use this tool when users ask detailed questions about what the agent can do, how it works, or what its capabilities are.",
    parameters: z.object({}),
    execute: async () => {
      try {
        const agentData = AGENT_INFO_DATA[agentType];
        
        if (!agentData) {
          return JSON.stringify({
            success: false,
            error: `Unknown agent type: ${agentType}`,
          });
        }

        // Return all information
        return JSON.stringify({
          name: agentData.name,
          identity: agentData.identity,
          purpose: agentData.purpose,
          capabilities: agentData.capabilities,
          tools: agentData.tools,
          useCases: agentData.useCases,
          limitations: agentData.limitations,
        }, null, 2);
      } catch (error) {
        console.error("Error in agent_info tool:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "An error occurred while retrieving agent information",
        });
      }
    },
  });
}
