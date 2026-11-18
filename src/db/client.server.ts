// Portable Postgres client using the `postgres` driver against Supabase's
// connection pooler (session mode, port 5432).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

function ensureEnvLoaded() {
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) return;
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {}
}

function resolveConnectionString(): string {
  ensureEnvLoaded();
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "No database connection string. Set DATABASE_URL or SUPABASE_DB_URL.",
    );
  }
  return url;
}

const globalForDb = globalThis as unknown as {
  _postgresClient?: postgres.Sql;
  _drizzleDb?: ReturnType<typeof drizzle>;
};

function createDb() {
  if (!globalForDb._drizzleDb) {
    const connectionString = resolveConnectionString();
    globalForDb._postgresClient = postgres(connectionString, {
      prepare: false,
      max: 2,
      idle_timeout: 5,
      connect_timeout: 10,
    });
    globalForDb._drizzleDb = drizzle(globalForDb._postgresClient, { schema });
  }
  return globalForDb._drizzleDb;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    const target = createDb();
    return Reflect.get(target, prop, receiver);
  },
});

export { schema };