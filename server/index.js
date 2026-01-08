import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/routes.js";
import { connectDB } from "./utils/prisma.js";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors( {
  origin: "http://116.202.210.102:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use("/api", routes);


const PORT = process.env.PORT;

connectDB().then(() => {
  app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
  })
}).catch((error) => {
  console.error('Failed to start server due to database connection error:', error);
  process.exit(1);
});