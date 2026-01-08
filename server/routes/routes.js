
import express from "express";
import multer from "multer";
import { uploadPdf } from "../controllers/uploadController.js";
import { chat } from "../controllers/chatController.js";
import { submitFeedback } from "../controllers/feedbackController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Support both single and multiple file uploads
router.post("/upload", upload.array("pdf", 10), uploadPdf);
router.post("/chat", chat);
router.post("/feedback", submitFeedback);

export default router;
