import { Annotation } from "@langchain/langgraph";

// Status constants
export const STATUS = {
  AWAITING_UPLOAD: "awaiting_upload",
  AWAITING_CRITERIA: "awaiting_criteria",
  READY_TO_VALIDATE: "ready_to_validate",
  VALIDATED: "validated"
};

// GraphState for certificate evaluation flow
export const CertificateEvaluationState = Annotation.Root({
  // Conversation messages for memory
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  
  // Uploaded document information
  uploadedDocument: Annotation({
    default: () => null
  }),
  
  // User-provided evaluation criteria
  criteria: Annotation({
    default: () => null
  }),
  
  // Free-form, user-provided description of how the certificate
  // should be validated (not limited to specific fields).
  criteriaDescription: Annotation({
    default: () => ""
  }),
  
  // Fields extracted from the certificate by LLM
  extractedFields: Annotation({
    default: () => null
  }),
  
  // Validation result
  validationResult: Annotation({
    default: () => null
  }),
  
  // Current flow status
  status: Annotation({
    default: () => STATUS.AWAITING_UPLOAD
  }),
  
  // Thread/session ID for state persistence
  threadId: Annotation({
    default: () => null
  })
});

