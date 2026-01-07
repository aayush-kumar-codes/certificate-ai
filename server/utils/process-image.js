import Tesseract from "tesseract.js";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { pinecone } from "./pineconedb.js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  dimensions: 1024,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

async function embedImageToPinecone(imagePath) {
  console.log("🖼️ Starting image OCR and embedding for:", imagePath);

  const index = pinecone.Index(process.env.PINECONE_INDEX);
  
  // Clear existing vectors before adding new ones
  try {
    console.log("🗑️ Clearing existing vectors from Pinecone index...");
    await index.deleteAll();
  } catch (error) {
    // Index might be empty, which is fine - continue with embedding
    if (error.name === "PineconeNotFoundError" || error.status === 404) {
      console.log("ℹ️ Index is empty or already cleared, proceeding with new upload...");
    } else {
      throw error;
    }
  }

  const {
    data: { text },
  } = await Tesseract.recognize(imagePath, "eng");

  const rawText = text || "";

  if (!rawText.trim()) {
    console.warn("No text detected in image:", imagePath);
    return;
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splitDocs = await splitter.createDocuments([rawText]);

  const docs = splitDocs.map(
    (doc, i) =>
      new Document({
        pageContent: doc.pageContent,
        metadata: { id: `image-chunk-${i}` },
      })
  );

  const vectorStore = await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
  });

  console.log(`✅ Image content embedded into Pinecone (${docs.length} chunks).`);
  
  // Verify the embedding was successful by querying the index
  // This is more reliable than stats which may have eventual consistency delays
  try {
    // Wait a moment for Pinecone to process the vectors
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to query the index to verify vectors exist
    // Use a simple test query with one of the document chunks
    if (docs.length > 0 && docs[0].pageContent) {
      const testQuery = docs[0].pageContent.substring(0, 100); // Use first 100 chars as test
      const testEmbedding = await embeddings.embedQuery(testQuery);
      
      const queryResult = await index.query({
        vector: testEmbedding,
        topK: 1,
        includeMetadata: true,
      });
      
      if (queryResult.matches && queryResult.matches.length > 0) {
        console.log(`✅ Verification successful - Found ${queryResult.matches.length} vector(s) via query`);
      } else {
        console.warn("⚠️ Warning: Query verification found no vectors. Stats check may show eventual consistency delay.");
        // Fallback to stats check
        const stats = await index.describeIndexStats();
        const vectorCount = stats.totalVectorCount || 0;
        console.log(`📊 Stats check - Total vectors: ${vectorCount}`);
      }
    }
  } catch (error) {
    console.warn("⚠️ Could not verify embedding via query:", error.message);
    // Fallback to stats check
    try {
      const stats = await index.describeIndexStats();
      const vectorCount = stats.totalVectorCount || 0;
      console.log(`📊 Fallback stats check - Total vectors: ${vectorCount}`);
    } catch (statsError) {
      console.warn("⚠️ Could not verify embedding stats either:", statsError.message);
    }
  }
}

export { embedImageToPinecone };


