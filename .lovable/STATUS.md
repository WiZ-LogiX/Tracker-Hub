# PeleCanon Status — June 12, 2025

> Living doc. Every phase below has an explicit % done, known blockers,
> and the next 1–3 actions to take. Use it as the single entry point
> whenever you (or AI) come back to this repo.

---

## TL;DR

| Phase | Goal | % done |
|-------|------|--------|
| 0     | Bootstrap (Stack + UI + i18n) | ✅ 100% |
| 1     | Multi-tenant Postgres + RLS | ✅ 100% |
| 2     | Server-side tenancy (middleware + Drizzle) | 🚧 ~10% (DB wired; app not yet) |
| 3     | Cloudflare R2 storage | 🔧 ~5% (infra present; no client wiring) |
| 4     | Data access rewrite (Supabase → Drizzle) | ⏸ 0% |
| 5     | Data migration + cutover | ⏸ blocked |

Three **known-blocking** items before Phase 2 can finish:

1. `user_roles` referenced in `useAuth.tsx` but not in Drizzle schema —
   admin pages will 404 after Supabase auth changes.
2. `companies` table artefact from before Phase 1 — left by `tenant_id`
   backfill; safe to drop.
3. `configurations` table missed during the `company_id` column drop —
   needs follow-up migration (no immediate effect, but breaks
   configurator's saved-quote persistence).

---

## Phase 0 — Bootstrap (complete)

- TanStack Start + Router + React 19 wired.
- shadcn/ui primitives + stubs in `src/components/ui/`.
- i18n: `ar / en / fr` with right-to-left + dir switching.
- Emerald Prestige palette in `src/styles.css`.
- Landing page, auth page, admin layout (sidebar with 21 nav items).
- Supabase Auth (email/password).
- Local dev server boots cleanly on `bun dev`.

> Files of interest: `src/router.tsx`, `src/routes/__root.tsx`,
> `src/styles.css`, `src/i18n/index.ts`.

---

## Phase 1 — Multi-tenant DB (complete)

What's done:

- `tenants` + `tenant_members` tables created.
- `tenant_role` enum: `owner / admin / sales / worker / viewer`.
- `is_tenant_member(_tenant_id uuid, _roles tenant_role[])` UDF added.
- All 33 public business tables have `tenant_id` (NOT NULL).
- RLS rewritten: read uses `USING(is_tenant_member(tenant_id, ARRAY[...]))`,
  write uses `WITH CHECK(...)`, delete uses `USING(...)` for owner/admin
  roles.
- Legacy `company_id` columns and `default_company_id()` function dropped.
- Legacy 4-column UNIQUE on `notification_templates` replaced with
  tenant-scoped UNIQUE.
- All indexes added: `(tenant_id)` and `(tenant_id, created_at)` where
  applicable.
- Tenant immutability trigger: `tenant_id` cannot be updated post-insert.
- One-time backfill: every existing `user_roles` row → `tenant_members`
  with `pelecanon` tenant and `owner` role.

How verified:

- `sprint1-apply.ts` ran the prefix migrations idempotently.
- `scripts/postflight-tenant-migration.sql` returns 0 stale rows on
  all five checks.
- `tests/rls.test.ts` covers cross-tenant read isolation (PASS).

Migration files of interest:

- `supabase/migrations/20260612_tenancy_v1_drop_company_sentinel.sql`
- `supabase/migrations/20260612_tenancy_v1_drop_company_default_fn.sql`

---

## Phase 2 — App-side tenancy (in progress, ~10%)

### Done

- Drizzle schema in `src/db/schema.ts` is the source of truth for types.
- Portable Postgres client at `src/db/client.server.ts` resolves
  `DATABASE_URL` and uses `drizzle-orm/neon-http` adapter.
- `src/lib/tenant-context.ts` exposes `TenantRole`, `canWrite`,
  `canDelete`, `requireRole` pure helpers.

### Still in flight

1. ⚠️ **`user_roles` is gone but `useAuth.tsx` still queries it.**
   - Stop it from breaking the supabase auth path before any server
     function gets refactored.
   - Fix: drop `user_roles` lookup; rely on `tenant_members` instead.
2. **`companies` table artefact** — must be dropped (no production
   code reads it, but cluttered schema).
   - Add follow-up migration.
3. **`configurations` table** — missed during `company_id` cascade.
   - Add follow-up migration: `ALTER TABLE configurations
     ADD COLUMN IF NOT EXISTS company_id` then drop.
4. **Tenant middleware**: `requireTenant` lives in this audit as a stub
   only. Needs to be:
   - Moved to `src/integrations/supabase/tenant-middleware.ts`
   - Added to `src/start.ts` as a `functionMiddleware`
   - Run *after* `requireSupabaseAuth` and *before* `next()`
   - Tests: `tests/rls.test.ts` already shows `asUser()` pattern;
     adapt assert in admin pages to match.
5. **Phase 1 hand-back to R&D**: `src/components/admin/icp-charts.tsx`
   duplicates chart data shape used in `useDashboard()` — needs
   extraction once tenant is real.

### Acceptance criteria (still unmet)

- Every `createServerFn` in `src/lib/*.functions.ts` includes the
  `requireTenant` middleware.
- Every direct `supabase.from(...)` in `src/routes/admin/*` is either
  replaced with a server function call OR has `.eq('tenant_id', ...)`
  inline.
- `useAuth()` returns `{ user, tenant, role, signOut }`.
- The admin sidebar shows the current tenant name with a fallback to
  "PeleCanon".

---

## Phase 3 — Cloudflare R2 storage (in progress, ~5%)

### Done

- Server primitives: `r2.server.ts` for the SDK; `r2.utils.ts` for
  client-safe helpers; `r2.functions.ts` for server functions.
- CORS policy specified in `src/lib/r2.config.ts`.
- Migration scripts: `scripts/migrate-from-supabase-storage.ts` (start).

### Still in flight

1. **Admin migration page** (`/admin/r2-migration`) — UI needed.
2. **CORS update on production R2 bucket** — owner must apply via the
   dashboard or Wrangler.
3. **Phase 3 client wiring** (`<PhotoUploader>` already exists but isn't
   wired into admin orders page).

### Acceptance criteria (still unmet)

- Uploading from the admin orders page puts new objects in R2.
- `production_photos.photo_url` reads back as `https://<R2>/<key>`.
- Old Supabase Storage photos still display in the public tracking
  page (read-side fallback).

---

## Phase 4 — Data access rewrite (queued, 0%)

Not started. Sequencing after Phase 2 wiring completes so we never
spend the round-trip for a half-grenade.

The shape we expect:

1. Drop `supabase.from(...)` and `supabaseAdmin.from(...)` direct
   usage in components.
2. Every read/write routes through Drizzle queries typed against
   `src/db/schema.ts`.
3. Service-role queries (`db`) live in server functions only.
4. `tenantDb(ctx)` helper exposes a Drizzle client bound to the
   request's `tenantId`.

### Not started

- Migration runner for Drizzle-side types (we already have
  `drizzle.config.ts` for `drizzle-kit pull/generate`).

---

## Phase 5 — Cutover (blocked)

The two plans:

- **Soft cutover**: read traffic still goes to Supabase; writes move to
  Neon. Risky; we accidentally produce drift in <24h.
- **Hard cutover**: scheduled outage, full data copy, full traffic flip.
  Risk: bad data on first run.

The team needs to decide which shape before we plan. My recommendation:
**soft cutover with telemetry pings** for 7 days, then hard cutover.

---

## Open questions

1. Should onboarding `useAuth` be a single role or do we need per
   tenant role info?
2. The Drizzle schema and Supabase schema need reconciliation — should
   `tenant_id` be `NOT NULL` (Phase 1 has them), or do we keep one
   denormalised mirror for analytics?
3. The price of complacency: Phase 1 was clean enough that Phase 2
   is taking longer. Either we cut to ship or we keep adding.

## Commands cheat-sheet

```bash
# Apply Phase 1 migrations idempotently:
npx tsx scripts/sprint1-apply.ts

# Verify Phase 1 schema invariants:
psql $DATABASE_URL -f scripts/postflight-tenant-migration.sql

# Run the cross-tenant RLS test suite:
DATABASE_URL_TEST=$DATABASE_URL bunx vitest run tests/rls.test.ts

# Dev server:
bun dev

# Build (Cloudflare Workers via Wrangler):
bun build && npx wrangler deploy
```

## File index — quick jumps

| What | Where |
|------|-------|
| Drizzle schema | `src/db/schema.ts` |
| Tenant types | `src/lib/tenant-context.ts` |
| Auth middleware | `src/integrations/supabase/auth-middleware.ts` |
| Server fns | `src/lib/*.functions.ts` |
| Pricing DSL | `src/lib/pricing/engine.ts` |
| R2 primitives | `src/lib/r2.server.ts` and `src/lib/r2.utils.ts` |
| R2 server fns | `src/lib/r2.functions.ts` |
| i18n locales | `src/i18n/locales/{ar,en,fr}.json` |
| Public tracking | `src/routes/track.tsx` |
| Migration scripts | `scripts/sprint1-apply.ts` |
| Tenant test | `tests/rls.test.ts` |
| Migration plan | `.lovable/neon-migration-plan.md` |