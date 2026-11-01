import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Only create a pool if DATABASE_URL is a non-empty string
export const pool = (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0)
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db = pool ? drizzle(pool, { schema }) : (null as any);
