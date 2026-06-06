import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";

export const checkNeonConnection = createServerFn({ method: "GET" }).handler(
  async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return { ok: false, error: "DATABASE_URL not set" };

    let host = "unparseable";
    let port = "(default)";
    try {
      const u = new URL(url);
      host = u.hostname;
      port = u.port || "(default)";
    } catch {}

    try {
      const sql = neon(url);
      const rows = (await sql`
        SELECT now() AS now, current_database() AS db, version() AS ver
      `) as Array<{ now: string; db: string; ver: string }>;
      const r = rows[0];
      return {
        ok: true,
        host,
        port,
        database: r.db,
        now: r.now,
        serverVersion: r.ver.split(" ").slice(0, 2).join(" "),
      };
    } catch (e: any) {
      return { ok: false, host, port, error: e?.message ?? String(e) };
    }
  },
);
