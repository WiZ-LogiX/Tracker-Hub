// Portable Postgres client using the `postgres` driver against Supabase's
// connection pooler (session mode, port 5432).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "No database connection string. Set DATABASE_URL or SUPABASE_DB_URL.",
    );
  }
  return url;
}

let _db: ReturnType<typeof createDb> | undefined;

function createDb() {
  const connectionString = resolveConnectionString();
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };