/**
 * Tiny helper for local migration runs.
 *
 * Why this exists:
 *   - The Shell session where db checks happen isn't always logged into the
 *     Supabase dashboard, so `$DATABASE_URL` is often unset.
 *   - `psql $DATABASE_URL` won't auto-read a `.env` file. The shell expands
 *     `$DATABASE_URL` before psql runs, and the variable that's in `.env`
 *     never makes it to the environment. So this script loads `.env` first,
 *     then drives `pg` from Node directly.
 *   - Supabase's dashboard hands out `postgresql://...` URIs. The node `pg`
 *     driver accepts `postgres://...` but **not** `postgresql://...` --
 *     it throws "Error: Invalid scheme on connection string" and looks at
 *     first glance like the URL wasn't set. We normalise the scheme here
 *     so the dashboard URL works without retyping it.
 *
 * Usage:
 *   bun db:check
 *   bun db:psql --file supabase/migrations/20260613_username_avatars_v1.sql
 *   FILE=supabase/migrations/20260613_username_avatars_v1.sql bun db:psql
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function loadEnv() {
  // Lazy minimal .env loader — no dotenv import to keep the dev dep count
  // low. Handles BOM, CRLF, optional double quotes around the value, and
  // ignores inline `# comments` after a non-quoted value.
  try {
    const raw = require("node:fs").readFileSync(".env", "utf8");
    const text = raw.replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      // Strip matching surrounding quotes (single or double).
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      // Only set if not already provided by the parent process.
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* no .env — fall back to process.env */
  }
}

function normaliseUrl(url: string): { url: string; swapped: boolean } {
  // pg.js wants `postgres://`. Dashboard URL is `postgresql://`. Swap.
  if (url.startsWith("postgresql://")) {
    return {
      url: "postgres://" + url.slice("postgresql://".length),
      swapped: true,
    };
  }
  return { url, swapped: false };
}

async function main() {
  loadEnv();
  const rawUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!rawUrl) {
    console.error("ERROR: DATABASE_URL is not set in .env or process.env.");
    console.error("       (Tip: even though it's in your .env, make sure it is");
    console.error("        not commented out with a '#' at the start of the line.)");
    process.exit(2);
  }
  const { url, swapped } = normaliseUrl(rawUrl);
  if (swapped) {
    console.log(`ℹ Normalised postgresql:// → postgres:// for the pg driver`);
    process.env.DATABASE_URL = url;
  }

  const argFile = process.argv.find((a: string) => a === "--file" || a === "-f");
  const cliFile =
    argFile !== undefined
      ? process.argv[process.argv.indexOf(argFile) + 1]
      : undefined;
  const file = cliFile ?? process.env.FILE;

  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ERROR: connection failed →", msg);
    console.error("       (Common causes:");
    console.error("        - port :6543 is the Pooler; DDL needs port :5432 (Direct).");
    console.error("        - check IP allow-list in Supabase → Settings → Database.");
    console.error("        - confirm DATABASE_URL is for THIS project's <ref>.)");
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
    console.error(
      "ERROR: migration failed →",
      e instanceof Error ? e.message : String(e),
    );
    await client.end();
    process.exit(1);
  }

  await client.end();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});