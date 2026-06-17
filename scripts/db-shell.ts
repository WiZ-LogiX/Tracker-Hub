/**
 * Tiny helper for local migration runs.
 *
 * Why this exists:
 *   - The Shell session where db checks happen isn't always logged into the
 *     Supabase dashboard, so `$DATABASE_URL` is often unset.
 *   - `psql $DATABASE_URL` won't auto-read a `.env` file. The shell expands
 *     `$DATABASE_URL` before psql runs, and the variable that's in `.env`
 *     never makes it to the environment. So we have to load `.env` first,
 *     then drive `pg` from Node directly.
 *   - The user explicitly added DATABASE_URL to .env already, so this
 *     becomes the no-paste path forward.
 *
 * Usage:
 *   bun db:check
 *   bun db:psql --file supabase/migrations/20260613_username_avatars_v1.sql
 *   FILE=supabase/migrations/20260613_username_avatars_v1.sql bun db:psql
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function loadEnv() {
  // Lazy .env loader — no dotenv import to keep the dev dep count low.
  try {
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

  const argFile = process.argv.find((a: string) => a === "--file" || a === "-f");
  const cliFile =
    argFile !== undefined
      ? process.argv[process.argv.indexOf(argFile) + 1]
      : undefined;
  const file = cliFile ?? process.env.FILE;

  // Lazy-import so we don't open a TCP socket during type-check.
  const pg = await import("pg");

  const client = new pg.default.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (e) {
    console.error("ERROR: connection failed →", e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  if (process.argv.includes("--check")) {
    const { rows } = await client.query(
      "SELECT now() AS now, current_database() AS db, version() AS ver",
    );
    const r = rows[0] as { now: string; db: string; ver: string };
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

  // Single transaction so any failure rolls back cleanly.
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✔ Migration applied.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("ERROR: migration failed →", e instanceof Error ? e.message : String(e));
    await client.end();
    process.exit(1);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});