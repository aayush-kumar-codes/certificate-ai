import express from "express";
import dotenv from "dotenv";
import { upload } from "./utils/upload.js";
import { askQuestion } from "./rag.js";
import { embedPdfToPinecone } from "./utils/process-pdf.js";
dotenv.config();

const app = express();
app.use(express.json());

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    const path = req.file.path;
    await embedPdfToPinecone(path);
    res.json({ message: "PDF embedded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process PDF" });
  }
});

app.post("/ask", async (req, res) => {
  const { question } = req.body;
  try {
    const answer = await askQuestion(question);
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate answer" });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));