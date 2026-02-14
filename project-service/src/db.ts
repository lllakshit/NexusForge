import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? "nexusforge",
  user: process.env.POSTGRES_USER ?? "nexusforge",
  password: process.env.POSTGRES_PASSWORD ?? "nexusforgepass"
});

export const getDb = (): Pool => pool;
