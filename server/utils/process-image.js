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

  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
  });

  console.log("✅ Image content embedded into Pinecone.");
}

export { embedImageToPinecone };


