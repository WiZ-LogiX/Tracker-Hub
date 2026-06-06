// Portable Postgres client (provider-agnostic).
// Works today against Supabase's pooled connection (SUPABASE_DB_URL).
// To switch providers (Neon, RDS, Railway, self-hosted...), set DATABASE_URL
// to the new connection string. No other code changes required.
//
// SERVER-ONLY: never import this from client code.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "No database connection string. Set DATABASE_URL (preferred) or SUPABASE_DB_URL.",
    );
  }
  return url;
}

function createDb() {
  const connectionString = resolveConnectionString();
  // `prepare: false` is required when talking to a pgbouncer transaction-mode
  // pooler (Supabase pooler URL on port 6543, and most managed Postgres poolers).
  // Safe to keep on for direct connections as well.
  const client = postgres(connectionString, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

// Import like: import { db } from "@/db/client.server";
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };
