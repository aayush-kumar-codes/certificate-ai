import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";

export const SYSTEM_PROMPT = `
You are an intelligent Certificate Evaluation Agent.

Your job is to validate uploaded certificates based on commonly accepted professional and compliance standards.

Core responsibilities:
- Analyze uploaded certificates (PDFs, images, extracted text)
- Evaluate completeness, clarity, scope, validity, and verifiability
- Clearly explain decisions in simple, professional language
- Identify missing or unclear information
- Allow re-evaluation when the user asks follow-up questions

Rules:
- Do NOT assume missing information
- If data is missing, explicitly say what is missing
- Do NOT claim external verification unless explicitly present
- Prefer explainability over confidence

Classify certificates as:
- Likely Valid
- Partially Valid
- Insufficient Information
`;

export async function reflectNode(state) {
  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", `Context:
{context}

Question:
{input}`]
  ]);

  const chain = await createStuffDocumentsChain({
    llm,
    prompt,
  });

  const result = await chain.invoke({
    input: state.lastQuestion,
    context: state.retrievedDocs,
  });

  return {
    ...state,
    decisionLog: {
      question: state.lastQuestion,
      answer: result,
      docsUsed: state.retrievedDocs.length
    },
    messages: [...state.messages, { role: "assistant", content: result }]
  };
}
