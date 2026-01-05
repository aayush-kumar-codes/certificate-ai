import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";

export async function reflectNode(state) {
  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = ChatPromptTemplate.fromTemplate(`
You are a certificate evaluation agent.

Use the context to answer.
If something is missing, say what is missing.
Explain your reasoning briefly.

Context:
{context}

Question:
{input}
  `);

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
