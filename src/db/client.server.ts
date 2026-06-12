// Portable Postgres client using Neon HTTP driver.
// Works on Cloudflare Workers without persistent TCP connections.
// To switch providers, just change the DATABASE_URL.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
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

let _db: ReturnType<typeof createDb> | undefined;

function createDb() {
  const connectionString = resolveConnectionString();
  const client = neon(connectionString);
  return drizzle(client, { schema });
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };