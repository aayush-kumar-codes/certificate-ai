import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js"; // ✅ FIX
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

async function embedPdfToPinecone(pdfPath) {
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

  const dataBuffer = fs.readFileSync(pdfPath);

  // ✅ This will NOT trigger the test file read
  const pdfData = await pdf(dataBuffer);

  const rawText = pdfData.text;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splitDocs = await splitter.createDocuments([rawText]);

  const docs = splitDocs.map((doc, i) => new Document({
    pageContent: doc.pageContent,
    metadata: { id: `pdf-chunk-${i}` },
  }));

  const vectorStore = await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
  });

  console.log(`✅ PDF content embedded into Pinecone (${docs.length} chunks).`);
  
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

async function hasDocuments(retries = 3) {
  const index = pinecone.Index(process.env.PINECONE_INDEX);
  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-large",
    dimensions: 1024,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Method 1: Try querying the index (more reliable than stats)
      // Use a generic query to see if any vectors exist
      const testQuery = "certificate document validation";
      const testEmbedding = await embeddings.embedQuery(testQuery);
      
      const queryResult = await index.query({
        vector: testEmbedding,
        topK: 1,
        includeMetadata: false,
      });
      
      if (queryResult.matches && queryResult.matches.length > 0) {
        console.log(`✅ Documents found in Pinecone via query (attempt ${attempt + 1})`);
        return true;
      }
      
      // Method 2: Fallback to stats check
      const stats = await index.describeIndexStats();
      const vectorCount = stats.totalVectorCount || 0;
      console.log(`📊 Pinecone index stats (attempt ${attempt + 1}/${retries + 1}) - Total vectors: ${vectorCount}`);
      
      if (vectorCount > 0) {
        console.log("✅ Documents found in Pinecone via stats");
        return true;
      }
      
      // If no vectors found and we have retries left, wait a bit and retry
      // (Pinecone might have eventual consistency)
      if (attempt < retries) {
        const delayMs = (attempt + 1) * 1000; // Increasing delay: 1s, 2s, 3s
        console.log(`⏳ No vectors found yet, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      console.log("⚠️ No documents found in Pinecone after all retries");
      return false;
    } catch (error) {
      console.error(`❌ Error checking Pinecone documents (attempt ${attempt + 1}):`, error.message);
      
      // If it's the last attempt, return false
      if (attempt === retries) {
        console.error("❌ Failed to check Pinecone documents after all retries");
        return false;
      }
      
      // Wait before retrying on error
      const delayMs = (attempt + 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return false;
}

export { embedPdfToPinecone, hasDocuments };
