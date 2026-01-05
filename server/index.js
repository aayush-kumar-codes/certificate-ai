import express from "express";
import dotenv from "dotenv";
import { upload } from "./utils/upload.js";
import { askQuestion } from "./askQuestion.js";
import { embedPdfToPinecone } from "./utils/process-pdf.js";
import cors from "cors";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors( {
  origin: "http://localhost:3001",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
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
  const { question, chatHistory = [] } = req.body;
  try {
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }
    const result = await askQuestion(question, chatHistory);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate answer" });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));