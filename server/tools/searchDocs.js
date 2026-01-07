import { OpenAIEmbeddings } from "@langchain/openai";
import { pinecone } from "../utils/pineconedb.js";
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 1024,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export async function searchDocuments(query) {
  const index = pinecone.Index(process.env.PINECONE_INDEX);

  const queryEmbedding = await embeddings.embedQuery(query);

  const searchResults = await index.query({
    vector: queryEmbedding,
    topK: 5,
    includeMetadata: true,
  });

  return searchResults.matches.map(match => ({
    pageContent: match.metadata.text || match.metadata.chunk_text || "",
    metadata: match.metadata,
  }));
}
