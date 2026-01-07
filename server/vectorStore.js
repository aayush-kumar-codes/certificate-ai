import { openai } from "./client.js";
const VECTOR_STORE = [];

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

export async function embedAndStore(text) {
  const chunks = text.match(/(.|[\r\n]){1,1000}/g) || [];

  for (const chunk of chunks) {
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: chunk
    });

    VECTOR_STORE.push({
      text: chunk,
      embedding: embeddingRes.data[0].embedding
    });
  }
}

export async function searchVector(query) {
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: query
  });

  const queryEmbedding = embeddingRes.data[0].embedding;

  const scored = VECTOR_STORE.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map(i => i.text).join("\n");
}

export function hasDocuments() {
  return VECTOR_STORE.length > 0;
}
