/**
 * Tiny helper for local migration runs.
 *
 * Why this exists:
 *   - The Shell session where db checks happen isn't always logged into the
 *     Supabase dashboard, so `$DATABASE_URL` is often unset.
 *   - We want to call `psql $DATABASE_URL -f supabase/migrations/<X>.sql`
 *     without leaking the password in plaintext through command-line
 *     history. This script reads DATABASE_URL from .env (or process
 *     env), runs the statement(s), and prints a small migration banner.
 *
 * Usage:
 *   bun db:check
 *   bun db:psql --file supabase/migrations/20260613_username_avatars_v1.sql
 *   FILE=supabase/migrations/20260613_username_avatars_v1.sql bun db:psql
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function loadEnv() {
  try {
    // Lazy minimal env loader — we don't want to pull dotenv at build time.
    const text = require("node:fs").readFileSync(".env", "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* no .env — fall back to process.env */
  }
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set in .env or process.env.");
    process.exit(2);
  }

  const argFile = process.argv.find((a) => a === "--file" || a === "-f");
  const cliFile =
    argFile !== undefined
      ? process.argv[process.argv.indexOf(argFile) + 1]
      : undefined;
  const file = cliFile ?? process.env.FILE;

  // Lazy-import so the import doesn't fire if the script is just being typed-tested.
  const pg = await import("pg");

  const client = new pg.default.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (e) {
    console.error("ERROR: connection failed →", e instanceof Error ? e.message : e);
    process.exit(2);
  }

  if (process.argv.includes("--check")) {
    const { rows } = await client.query(
      "SELECT now() AS now, current_database() AS db, version() AS ver",
    );
    const r = rows[0];
    console.log("✔ Connected.");
    console.log("  database:", r.db);
    console.log("  now:     ", r.now);
    console.log("  version: ", String(r.ver).split(" ").slice(0, 2).join(" "));
    await client.end();
    return;
  }

  if (!file) {
    console.error("ERROR: pass --file <path> (or set FILE env).");
    await client.end();
    process.exit(2);
  }

  const sqlPath = resolve(file);
  const sql = await readFile(sqlPath, "utf8");
  console.log(`▶ Applying ${sqlPath}`);

  // Use a transaction so any failure rolls back cleanly.
  try {
    await client.query("BEGIN");
    // Single-statement migration — easier than parsing. If the file has
    // multiple statements, pg's `query` will execute them all.
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✔ Migration applied.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("ERROR: migration failed →", e instanceof Error ? e.message : e);
    await client.end();
    process.exit(1);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});