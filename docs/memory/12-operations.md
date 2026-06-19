# 12. Operations

## 12.1 Testing

### `tests/rls.test.ts` — cross-tenant RLS suite (vitest + pg)
Pattern: `asUser({sub: userA}, async c => { await c.query('SELECT ... WHERE tenant_id = ...') })` via `set_config('request.jwt.claims', json, true)` to emulate RLS-bound sessions.

Assertions:
- Cross-tenant SELECT visibility (positive + negative).
- Insert with foreign `tenant_id` → RLS rejection.
- Role-based UPDATE denial (worker cannot UPDATE customers).
- Append-only tables (`notification_log`) reject UPDATE/DELETE.
- Cascade cleanup on `afterAll`.

### Test runner
- No `test` script in `package.json` — vitest is in `devDependencies` only.
- Ad-hoc invocation: `bunx vitest run tests/rls.test.ts` with `DATABASE_URL_TEST=...`.

## 12.2 Migrations

### Sprint runner — `scripts/sprint1-apply.ts`
Idempotent tenant-migration runner.

### Postflight — `scripts/postflight-tenant-migration.sql`
Returns `0 stale rows` on five checks:
- `tenant_id IS NULL` per business table
- Missing tenant indexes
- Missing immutability trigger
- RLS-enabled status (no bypass)

### Supabase SQL — `supabase/migrations/`
16+ SQL migrations, includes three numbering variants (`plc_numbering_daily|simple|fixed.sql`) and four tenancy v1 files. The apply tooling picks a representative one — verify before running.

### Drizzle migrations — `src/db/migrations/`
**Empty.** `out: "./drizzle"` is referenced by `drizzle.config.ts` but no migrations are present.

## 12.3 Cleanup

### `src/lib/cleanup.functions.ts`
- `cleanTable(table)` — uses `.neq('id', '00000000-0000-0000-0000-000000000000')` because PostgREST can't issue a bare `DELETE` (returns 400). The placeholder UUID never exists in practice.
- `cleanupAllData()` — purges ~19 catalog/business tables but **never** `tenants`, `tenant_members`, or `auth.users` (which would revoke everyone's access).

## 12.4 Diagnostic paths

- **`/admin/health`** — service-role probes (above).
- **`/admin/db-check`** — returns PostgreSQL 18.4, db `neondb` — Phase 1 readiness indicator.
- **`db-health.functions.ts`** — `checkNeonConnection` server fn.

## 12.5 Observability gaps

- No structured logger; production logs use `console.error` only (e.g. `r2.functions.ts:84`).
- No tracing layer; auth middleware emits no per-request event.
- `notification_log` is the only durable record of outbound ops — no retry / DLQ.