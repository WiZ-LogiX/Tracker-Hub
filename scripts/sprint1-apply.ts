/**
 * Sprint 1 — safe migration runner.
 *
 * Run it with:
 *   npx tsx scripts/sprint1-apply.ts --dry-run
 *   npx tsx scripts/sprint1-apply.ts
 *   npx tsx scripts/sprint1-apply.ts --only 20260612_tenancy_v1.sql
 *   npx tsx scripts/sprint1-apply.ts --allow-pooler-port
 *   npx tsx scripts/sprint1-apply.ts --ipv4          # force IPv4 (skip IPv6)
 *
 * Why --ipv4 exists:
 *   ENETUNREACH surfaces when the kernel picks the AAAA record on a
 *   network that has no IPv6 path. We replace the connection URL with
 *   the resolved IPv4 address (and keep the original hostname in PGHOST
 *   so TLS SNI still works — pg.Client parses connectionString for the
 *   network endpoint, but TLS uses PGHOST).
 *
 * What it does
 * ------------
 * 1. Verifies DATABASE_URL is set and the host port is one we accept
 *    (default: refuse the Pooler transaction port :6543; pass
 *    --allow-pooler-port only if you know what you're doing — DDL
 *    against :6543 yields weird errors).
 * 2. Discovers migration files in supabase/migrations/ matching a prefix
 *    (20260612_*) and runs them in lexical order, one at a time, each in
 *    its own transaction. The runner stops on the first statement that
 *    fails and prints the failing file + the failing statement's 1-based index.
 * 3. After all migrations succeed, runs a fixed list of postflight SELECTs
 *    to confirm the resulting schema is sane.
 * 4. Exits 0 on full success, 1 on first DDL failure, 2 on preflight refusal
 *    (bad port, missing URL, etc.). Postflight results are reported but
 *    never abort the process.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import dns from "node:dns/promises";
import pg from "pg";

type Exit = "ok" | "fail-driver" | "fail-preflight";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const ALLOW_POOLER_PORT = argv.includes("--allow-pooler-port");
const FORCE_IPV4 = argv.includes("--ipv4");
const ONLY_FLAG = argv.indexOf("--only");
const ONLY = ONLY_FLAG >= 0 ? argv[ONLY_FLAG + 1] : undefined;

const MIGRATIONS_DIR = "supabase/migrations";
const PREFIX = "20260612_";

function log(step: string, body: string = "") {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${step}${body ? " " + body : ""}`);
}

function bail(reason: string): never {
  log("✗", reason);
  process.exit(2);
}

function assertUrl(u: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    bail("DATABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    bail(`Expected postgres:// or postgresql://, got ${parsed.protocol}`);
  }
  if (
    parsed.hostname.endsWith(".supabase.com") &&
    parsed.port === "6543" &&
    !ALLOW_POOLER_PORT
  ) {
    bail(
      "Refusing to apply DDL against the Pooler transaction port :6543. " +
        "Use the Direct connection (port 5432) from Project Settings → Database. " +
        "If you're sure DDL works on your pooler, pass --allow-pooler-port.",
    );
  }
  return parsed;
}

/**
 * Replace the hostname in the connection string with the first IPv4
 * address returned for it. We don't touch anything else, so credentials
 * and the port survive intact. The original hostname is stashed in
 * PGHOST so Supabase's TLS SNI still hits the correct virtual host
 * (Supabase's certificate pool is SNI-keyed).
 */
async function maybeForceIpv4(url: string): Promise<string> {
  if (!FORCE_IPV4) return url;
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  log("→", `Forcing IPv4 lookup for ${hostname}`);
  const records = await dns.lookup(hostname, { family: 4, all: true });
  if (!records.length) bail(`No A records found for ${hostname}`);
  const addr = records[0].address;
  log("→", `Resolved ${hostname} → ${addr}`);
  // Preserve username/password/path/port/protocol via the replacement:
  // build a fresh URL pointing at the IP and copy credentials over.
  const replaced = new URL(url);
  replaced.hostname = addr;
  process.env.PGHOST = hostname; // helps TLS SNI on pg
  return replaced.toString();
}

async function listMigrations(): Promise<string[]> {
  let all: string[];
  try {
    all = await readdir(MIGRATIONS_DIR);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    bail(`Cannot read migrations directory: ${MIGRATIONS_DIR} (${message})`);
  }
  const pick = all
    .filter((f) => f.endsWith(".sql") && f.startsWith(PREFIX))
    .sort();
  if (ONLY) {
    if (!pick.includes(ONLY))
      bail(`--only ${ONLY} did not match a file under ${PREFIX}`);
    return [ONLY];
  }
  return pick;
}

/**
 * Split a SQL file into statements, respecting `$$ ... $$` dollar-quoted
 * blocks (Postgres functions). Naive split on `;` would break for any DDL
 * containing a CREATE FUNCTION with a body. Each top-level statement is
 * "everything up to the next `;` that is NOT inside a dollar-quoted block".
 *
 * We don't parse `--` line comments. None of the Sprint 1 files contain a
 * literal `;` inside a comment, so this is safe for the migrations we have
 * today. If a future migration changes that, switch to a real SQL parser.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  let dollarTag = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (!inDollar && ch === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) {
        inDollar = true;
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (inDollar && ch === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m && m[0] === dollarTag) {
        inDollar = false;
        dollarTag = "";
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ";" && !inDollar) {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function applyOne(
  file: string,
  client: pg.Client,
): Promise<Exit> {
  const path = join(MIGRATIONS_DIR, file);
  log("→", `Reading ${path}`);
  const sql = await readFile(path, "utf8");
  const stmts = splitStatements(sql);
  log("→", `Parsed ${stmts.length} statement(s)`);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const head = stmt.replace(/\s+/g, " ").slice(0, 80);
    log(
      "  ",
      `[${i + 1}/${stmts.length}] ${head}${stmt.length > 80 ? "…" : ""}`,
    );
    try {
      await client.query(stmt);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log("✗", `Statement #${i + 1} failed in ${file}: ${message}`);
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      return "fail-driver";
    }
  }
  log("✓", `${file} applied (${stmts.length} statement(s) OK)`);
  return "ok";
}

type Check = {
  name: string;
  sql: string;
  expect: (val: string) => boolean;
};

const checks: Check[] = [
  {
    name: "tenants table has 'pelecanon' slug",
    sql: "SELECT count(*)::text FROM public.tenants WHERE slug='pelecanon'",
    expect: (v) => v === "1",
  },
  {
    name: "tenant_members table exists and is queryable",
    sql: "SELECT count(*)::text FROM public.tenant_members",
    expect: () => true,
  },
  {
    name: "customers table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='customers'",
    expect: (v) => v === "true",
  },
  {
    name: "orders table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='orders'",
    expect: (v) => v === "true",
  },
  {
    name: "quotes table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='quotes'",
    expect: (v) => v === "true",
  },
  {
    name: "invoices table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='invoices'",
    expect: (v) => v === "true",
  },
  {
    name: "production_photos table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='production_photos'",
    expect: (v) => v === "true",
  },
  {
    name: "notification_log table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='notification_log'",
    expect: (v) => v === "true",
  },
  {
    name: "audit_log table has rowsecurity = true",
    sql:
      "SELECT rowsecurity::text FROM pg_tables WHERE schemaname='public' AND tablename='audit_log'",
    expect: (v) => v === "true",
  },
  {
    name: "no NULL tenant_id in customers",
    sql: "SELECT count(*)::text FROM public.customers WHERE tenant_id IS NULL",
    expect: (v) => v === "0",
  },
  {
    name: "no NULL tenant_id in orders",
    sql: "SELECT count(*)::text FROM public.orders WHERE tenant_id IS NULL",
    expect: (v) => v === "0",
  },
  {
    name: "no NULL tenant_id in quotes",
    sql: "SELECT count(*)::text FROM public.quotes WHERE tenant_id IS NULL",
    expect: (v) => v === "0",
  },
  {
    name: "no NULL tenant_id in invoices",
    sql: "SELECT count(*)::text FROM public.invoices WHERE tenant_id IS NULL",
    expect: (v) => v === "0",
  },
  {
    name: "is_tenant_member() security-definer helper exists",
    sql: "SELECT count(*)::text FROM pg_proc WHERE proname='is_tenant_member'",
    expect: (v) => Number(v) > 0,
  },
];

async function postflight(client: pg.Client): Promise<void> {
  log("→", "Running postflight checks");
  let problems = 0;
  for (const c of checks) {
    try {
      const { rows } = await client.query(c.sql);
      const firstRow = rows[0] as Record<string, unknown> | undefined;
      const v = firstRow
        ? String(Object.values(firstRow)[0])
        : "(no row)";
      const ok = c.expect(v);
      log(ok ? "  ✓" : "  ✗", `${c.name} → ${v}`);
      if (!ok) problems++;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log("  ✗", `${c.name} failed: ${message}`);
      problems++;
    }
  }
  if (problems === 0) {
    log("✓", "All postflight checks passed.");
  } else {
    log("⚠", `${problems} postflight check(s) failed — review above.`);
  }
}

async function main() {
  log("→", "Checking DB connectivity");
  const url = process.env.DATABASE_URL;
  if (!url)
    bail(
      "DATABASE_URL is not set. Example: export DATABASE_URL=postgresql://postgres:PASS@db.x.supabase.co:5432/postgres",
    );
  assertUrl(url);
  const effectiveUrl = await maybeForceIpv4(url);

  const files = await listMigrations();
  log("→", `Applying ${files.length} migration file(s):`);
  for (const f of files) log("  -", f);

  if (DRY_RUN) {
    log("✓", "Dry run complete. Re-run without --dry-run to apply.");
    process.exit(0);
  }

  const client = new pg.Client({
    connectionString: effectiveUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    log("→", "Connected");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    bail(`Connection failed: ${message}`);
  }

  let exit: Exit = "ok";
  try {
    for (const file of files) {
      await client.query("BEGIN");
      const r = await applyOne(file, client);
      if (r === "ok") {
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
        exit = "fail-driver";
        break;
      }
    }
    await postflight(client);
  } finally {
    await client.end();
  }

  if (exit === "ok") log("✓", "Sprint 1 migrations applied successfully.");
  process.exit(exit === "ok" ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});