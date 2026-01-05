import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  lastQuestion: Annotation({
    default: () => null
  }),
  retrievedDocs: Annotation({
    default: () => []
  }),
  decisionLog: Annotation({
    default: () => null
  })
});
  