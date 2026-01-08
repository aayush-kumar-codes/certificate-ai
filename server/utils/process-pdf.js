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

async function embedPdfToPinecone(pdfPath, metadata = {}) {
  const {
    documentId,
    sessionId,
    documentIndex,
    documentName = "document.pdf"
  } = metadata;

  if (!documentId || !sessionId) {
    throw new Error("documentId and sessionId are required in metadata");
  }

  const index = pinecone.Index(process.env.PINECONE_INDEX);
  
  // No longer clearing existing vectors - append instead of replace
  console.log(`📄 Processing PDF: ${documentName} (document ${documentIndex})`);

  const dataBuffer = fs.readFileSync(pdfPath);

  // ✅ This will NOT trigger the test file read
  const pdfData = await pdf(dataBuffer);

  const rawText = pdfData.text;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splitDocs = await splitter.createDocuments([rawText]);
  const totalChunks = splitDocs.length;
  const uploadTimestamp = new Date().toISOString();

  const docs = splitDocs.map((doc, i) => {
    const vectorId = `${documentId}:chunk-${i}`;
    return new Document({
      pageContent: doc.pageContent,
      metadata: {
        document_id: documentId,
        session_id: sessionId,
        document_index: documentIndex,
        document_name: documentName,
        document_type: "pdf",
        chunk_index: i,
        total_chunks: totalChunks,
        upload_timestamp: uploadTimestamp,
        text: doc.pageContent, // Store text in metadata for retrieval
      },
    });
  });

  // Use addDocuments with custom IDs for better control
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
  });

  // Generate custom IDs for each document
  const ids = docs.map((doc, i) => `${documentId}:chunk-${i}`);
  
  await vectorStore.addDocuments(docs, { ids });

  console.log(`✅ PDF content embedded into Pinecone (${docs.length} chunks) for document ${documentIndex} (${documentName}).`);
  
  // Verify the embedding was successful by querying with metadata filter
  try {
    // Wait a moment for Pinecone to process the vectors
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Query with metadata filter to verify this specific document
    if (docs.length > 0 && docs[0].pageContent) {
      const testQuery = docs[0].pageContent.substring(0, 100);
      const testEmbedding = await embeddings.embedQuery(testQuery);
      
      const queryResult = await index.query({
        vector: testEmbedding,
        filter: {
          document_id: { $eq: documentId },
          session_id: { $eq: sessionId }
        },
        topK: 1,
        includeMetadata: true,
      });
      
      if (queryResult.matches && queryResult.matches.length > 0) {
        console.log(`✅ Verification successful - Found ${queryResult.matches.length} vector(s) for document ${documentIndex}`);
      } else {
        console.warn(`⚠️ Warning: Query verification found no vectors for document ${documentIndex}. May have eventual consistency delay.`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Could not verify embedding via query for document ${documentIndex}:`, error.message);
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
