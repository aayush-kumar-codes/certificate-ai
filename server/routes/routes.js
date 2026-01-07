
import express from "express";
import multer from "multer";
import { uploadPdf } from "../controllers/uploadController.js";
import { chat } from "../controllers/chatController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("pdf"), uploadPdf);
router.post("/chat", chat);

export default router;
