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

async function embedImageToPinecone(imagePath, metadata = {}) {
  const {
    documentId,
    sessionId,
    documentIndex,
    documentName = "image.jpg"
  } = metadata;

  if (!documentId || !sessionId) {
    throw new Error("documentId and sessionId are required in metadata");
  }

  const index = pinecone.Index(process.env.PINECONE_INDEX);
  
  // No longer clearing existing vectors - append instead of replace
  console.log(`🖼️ Processing image: ${documentName} (document ${documentIndex})`);

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
  const totalChunks = splitDocs.length;
  const uploadTimestamp = new Date().toISOString();

  const docs = splitDocs.map((doc, i) => {
    return new Document({
      pageContent: doc.pageContent,
      metadata: {
        document_id: documentId,
        session_id: sessionId,
        document_index: documentIndex,
        document_name: documentName,
        document_type: "image",
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

  console.log(`✅ Image content embedded into Pinecone (${docs.length} chunks) for document ${documentIndex} (${documentName}).`);
  
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

export { embedImageToPinecone };


