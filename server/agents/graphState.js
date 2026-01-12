import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Graph state schema for the multi-agent system
 * Extends MessagesAnnotation to include routing and session information
 */
export const AgentGraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  sessionId: Annotation({
    reducer: (x, y) => y ?? x ?? null,
  }),
  routerDecision: Annotation({
    reducer: (x, y) => y ?? x ?? null,
  }), // "GENERAL" | "CERTIFICATE" | "AGENT_INFO"
  documentsExist: Annotation({
    reducer: (x, y) => y ?? x ?? false,
  }),
});
