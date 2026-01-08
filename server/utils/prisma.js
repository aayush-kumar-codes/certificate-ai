import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { PrismaClient } = pkg;
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

export default prisma;

export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log("✅ Prisma connected to database");
  } catch (error) {
    console.error("❌ Prisma connection error:", error);
    process.exit(1);
  }
};
