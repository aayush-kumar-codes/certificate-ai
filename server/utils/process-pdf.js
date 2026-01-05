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

  const index = pinecone.Index(process.env.PINECONE_INDEX);

  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
  });

  console.log("✅ PDF content embedded into Pinecone.");
}

export { embedPdfToPinecone };
