import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { pinecone } from "./utils/pineconedb.js";

// Use `@langchain/classic` for legacy chains
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 1024,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

async function askQuestion(query) {
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  const queryEmbedding = await embeddings.embedQuery(query);

  const searchResults = await index.query({
    vector: queryEmbedding,
    topK: 5,
    includeValues: false,
    includeMetadata: true,
  });

  const docs = searchResults.matches.map(match => ({
    pageContent: match.metadata.text || match.metadata.chunk_text || "",
    metadata: match.metadata,
  }));

  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
  });

  const prompt = ChatPromptTemplate.fromTemplate(`
    Answer the following question based on the provided context.
    If you don't know the answer, just say you don't know.
    
    Context: {context}
    
    Question: {input}
  `);

  const documentChain = await createStuffDocumentsChain({
    llm,
    prompt,
  });

  const result = await documentChain.invoke({
    input: query,
    context: docs,
  });

  return result;
}

export { askQuestion };
