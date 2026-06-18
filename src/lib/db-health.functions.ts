import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";

export const checkNeonConnection = createServerFn({ method: "GET" }).handler(
  async () => {
    const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!url) return { ok: false, error: "DATABASE_URL not set" };

    let host = "unparseable";
    let port = "(default)";
    try {
      const u = new URL(url);
      host = u.hostname;
      port = u.port || "(default)";
    } catch {}

    let client: ReturnType<typeof postgres> | undefined;
    try {
      client = postgres(url, { prepare: false });
      const rows = await client<Array<{ now: string; db: string; ver: string }>>`
        SELECT now() AS now, current_database() AS db, version() AS ver
      `;
      const r = rows[0];
      return {
        ok: true,
        host,
        port,
        database: r.db,
        now: r.now,
        serverVersion: String(r.ver).split(" ").slice(0, 2).join(" "),
      };
    } catch (e: any) {
      return { ok: false, host, port, error: e?.message ?? String(e) };
    } finally {
      await client?.end({ timeout: 2 });
    }
  },
);