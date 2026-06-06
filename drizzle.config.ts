import type { Config } from "drizzle-kit";

// Drizzle Kit config — used only locally for `drizzle-kit pull` / `generate`.
// Runtime connection lives in src/db/client.server.ts.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "",
  },
} satisfies Config;
