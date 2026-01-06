import express from "express";
import dotenv from "dotenv";
import { upload } from "./utils/upload.js";
import { askQuestion } from "./askQuestion.js";
import { embedPdfToPinecone } from "./utils/process-pdf.js";
import { embedImageToPinecone } from "./utils/process-image.js";
import cors from "cors";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors( {
  origin: "http://116.202.210.102:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const path = file.path;
    const mimetype = file.mimetype || "";

    if (mimetype === "application/pdf") {
      await embedPdfToPinecone(path);
      return res.json({ message: "PDF embedded successfully" });
    }

    if (mimetype.startsWith("image/")) {
      await embedImageToPinecone(path);
      return res.json({ message: "Image embedded successfully" });
    }

    return res.status(400).json({ error: "Unsupported file type" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process file" });
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