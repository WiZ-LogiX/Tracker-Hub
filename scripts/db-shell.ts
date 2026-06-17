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
 *   - Lovable Cloud mounts `.env` as a *virtual* file via a symlink or a
 *     `.dyad/` shim. A naive `readFileSync('.env')` occasionally fails on
 *     broken symlinks or unreachable virtual paths. We try several candidate
 *     paths and follow symlinks defensively. If every candidate fails we
 *     print what we tried so you can spot the missing file immediately.
 *
 * Usage:
 *   bun db:check
 *   bun db:psql --file supabase/migrations/20260613_username_avatars_v1.sql
 *   FILE=supabase/migrations/20260613_username_avatars_v1.sql bun db:psql
 *   bun db:config     # prints the resolved config without connecting
 */
import { readFile, stat, realpath } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadEnv(logger: (msg: string) => void = () => {}) {
  // Candidate locations, in priority order. The first existing regular file
  // (or resolvable symlink) wins. The script file itself anchors the search
  // so it works if you invoke it from a different cwd.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const here = process.cwd();
  const candidates = [
    resolve(here, ".env"),
    resolve(here, "..", ".env"),
    resolve(here, "..", "..", ".env"),
    resolve(scriptDir, "..", ".env"),
    resolve(scriptDir, "..", "..", ".env"),
    resolve(here, ".dyad", "env"),
    resolve(here, ".lovable", "env"),
    resolve(here, ".envrc"),
    resolve(here, ".env.local"),
  ];

  let chosen: string | null = null;
  for (const c of candidates) {
    try {
      const s = existsSync(c) ? await stat(c) : null;
      if (!s) continue;
      // Follow symlinks if needed. If realpath throws, the symlink target
      // is missing — we surface that as a diagnostic.
      const target = await realpath(c).catch(() => null);
      if (!target) {
        logger(`  ${c}: dangling symlink (target missing)`);
        continue;
      }
      if (!s.isFile() && !s.isSymbolicLink()) {
        logger(`  ${c}: skipped (not a regular file: mode=${s.mode})`);
        continue;
      }
      chosen = target;
      logger(`  ${c} -> ${target} (${s.size} bytes)`);
      break;
    } catch (e: any) {
      logger(`  ${c}: ${e?.code ?? e?.message ?? "unknown"}`);
    }
  }

  if (!chosen) {
    logger("✗ No .env file found in any candidate path.");
    logger("  Tried:");
    for (const c of candidates) logger(`    ${c}`);
    return false;
  }

  let raw: string;
  try {
    raw = await readFile(chosen, "utf8");
  } catch (e: any) {
    logger(`✗ Could not read ${chosen}: ${e?.code ?? e?.message ?? "unknown"}`);
    return false;
  }

  let loaded = 0;
  const text = raw.replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    // Strip BOM is unnecessary now since we removed it above; the line can
    // still carry it if a different shim re-added it. Just trim.
    const trimmed = line.replace(/^\uFEFF/, "").trim();
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
    } else {
      // Inline `#` comment after an unquoted value.
      const hashIdx = v.indexOf(" #");
      if (hashIdx >= 0) v = v.slice(0, hashIdx).trim();
    }
    // Only set if not already provided by the parent process; existing env
    // wins on purpose so calling code can override.
    if (!(k in process.env)) process.env[k] = v;
    loaded++;
  }
  logger(`✓ Loaded ${loaded} variable(s) from ${chosen}`);
  return true;
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

async function resolveUrl(): Promise<{ url: string; swapped: boolean; source: string }> {
  const candidates: Array<[string, () => string | undefined]> = [
    ["env: process.env.DATABASE_URL", () => process.env.DATABASE_URL],
    ["env: process.env.SUPABASE_DB_URL", () => process.env.SUPABASE_DB_URL],
    [
      "env: SUPABASE_URL (Project URL)",
      () => {
        const u = process.env.SUPABASE_URL;
        return u
          ? u
              .replace(/^https?:\/\//, "postgres://")
              .replace(/$/, ":5432/postgres")
          : undefined;
      },
    ],
  ];

  for (const [label, fn] of candidates) {
    const v = fn();
    if (v && v.length > 8) {
      const { url, swapped } = normaliseUrl(v);
      return { url, swapped, source: label };
    }
  }

  // Last-ditch: read the file directly.
  const fs = await import("node:fs/promises");
  for (const p of [".env", ".env.local"]) {
    try {
      const txt = await fs.readFile(p, "utf8");
      const m = txt.match(/^(?:DATABASE_URL|SUPABASE_DB_URL)=["']?([^"'\n]+)["']?/m);
      if (m && m[1]) {
        const { url, swapped } = normaliseUrl(m[1]);
        return { url, swapped, source: `file: ${p}` };
      }
    } catch {
      /* keep looking */
    }
  }

  throw new Error(
    "No DATABASE_URL found in process.env, in .env, or via SUPABASE_URL.",
  );
}

async function main() {
  const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
  const log = (m: string) => {
    if (verbose) console.error(`[env] ${m}`);
  };

  log("Searching for .env...");
  await loadEnv(log);

  const wantConfigPrint =
    process.argv.includes("--print-config") || process.argv.includes("--config");

  let url: string;
  let swapped = false;
  let source = "";
  try {
    const r = await resolveUrl();
    url = r.url;
    swapped = r.swapped;
    source = r.source;
  } catch (e: any) {
    console.error(`ERROR: ${e?.message ?? String(e)}`);
    console.error("       Set DATABASE_URL or SUPABASE_DB_URL in your shell or in .env.");
    process.exit(2);
  }

  if (swapped) {
    console.log(`ℹ Normalised postgresql:// → postgres:// for the pg driver`);
    process.env.DATABASE_URL = url;
  }

  if (wantConfigPrint) {
    console.log("--- Resolved config ---");
    console.log("URL source:    ", source);
    console.log("URL host:      ", safeHost(url));
    console.log("URL scheme:    ", url.split("://", 1)[0]);
    console.log("URL db:        ", safeDb(url));
    console.log("URL password:  ", "***redacted (len=" + safePwLen(url) + ")");
    return;
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

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "(could not parse)";
  }
}
function safeDb(u: string): string {
  try {
    return new URL(u).pathname.replace(/^\//, "") || "(none)";
  } catch {
    return "(could not parse)";
  }
}
function safePwLen(u: string): number {
  try {
    return new URL(u).password.length;
  } catch {
    return 0;
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});