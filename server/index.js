import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/routes.js";
import { connectDB } from "./utils/prisma.js";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors( {
  origin: ["http://116.202.210.102:6002","http://localhost:1597","http://116.202.210.102:1597"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
  credentials: true,
}));
app.get("/", (req, res) => {
  res.send("Hello World");
});
app.use("/api", routes);


const PORT = process.env.PORT;

connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`)
  })
}).catch((error) => {
  console.error('Failed to start server due to database connection error:', error);
  process.exit(1);
});