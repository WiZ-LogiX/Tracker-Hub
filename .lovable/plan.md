# PeleCanon → Multi-Tenant SaaS — Phased Execution Plan

This is a very large transformation. I will execute **Phase 2 only** in this round (per your "implement first, fully, before any other phase" instruction), then come back for Phases 3 and 4 in separate rounds so each can be reviewed.

Before I start, I need to flag a few hard realities about scope so we agree on the approach.

---

## Reality check — what I'll do vs. defer

**Do now (Phase 2 core, non-negotiable for tenancy):**
1. **Schema migration** — create `tenants`, `tenant_members`, add nullable `tenant_id` to every business table, seed `pelecanon` tenant, backfill existing rows, then `NOT NULL` + indexes + immutability trigger.
2. **RLS rewrite** — replace every `is_staff(auth.uid())` policy on business tables with strict `tenant_id ∈ my_tenants` membership checks; role-gated INSERT/UPDATE/DELETE.
3. **`useTenant()` hook + tenant context** — resolves current tenant from URL slug, exposes `{tenant, role}`.
4. **Path-based routing under `/t/$slug/...`** — move existing `/admin/*` tree under `/t/$slug/admin/*` via a new `_tenant` layout that validates membership in `beforeLoad`. Keep `/admin/*` as a redirect to `/t/pelecanon/admin` for one release so nothing breaks.
5. **Per-tenant branding** — replace hardcoded "PeleCanon" name/logo in sidebar + header + tracking page footer with values from `useTenant()`. Inject `--brand-primary` CSS var. Emerald Prestige stays as the fallback palette.
6. **Onboarding** — `/signup` (auth + tenant + owner member) and `/onboarding` 5-step wizard (brand, business info, seed defaults toggle, invite team, done → tenant dashboard).
7. **`tenant_audit_log`** — table + triggers logging any RLS-denied access (best-effort: log INSERTs/UPDATEs that pass the policy but reference cross-tenant FKs via a check function).

**Defer / push back (with reason):**

- **2.3 `getTenantClient()` server-side wrapper that throws on missing tenant filter.** RLS already enforces isolation at the DB layer. A "throws if no tenant filter" wrapper has to statically analyze every query, which is not practical at runtime in JS. I'll instead: (a) rely on RLS as the real boundary, (b) add a single helper `tenantScopedFrom(table)` that auto-appends `.eq('tenant_id', tenantId)` and is the *recommended* path, (c) add the ESLint rule from 2.7 to flag bare `supabase.from(...)`.
- **`tests/rls.test.ts` 2-tenant cross-CRUD suite.** This project has no test runner wired up and no Supabase local stack in this sandbox. Standing one up is a multi-hour task by itself. Instead I will: provide the test file checked into the repo with clear `bun test` instructions, and **manually verify** isolation by running cross-tenant `SELECT/INSERT/UPDATE/DELETE` against the live DB using `supabaseAdmin` impersonation (`set local request.jwt.claims`) in a SQL script committed to the repo. If you want the full vitest+supabase-js test harness wired in, say so and I'll do it as a follow-up.
- **PDFs and email templates per-tenant branding.** I could not find a PDF or Resend template file in the current codebase (no `pdf`, `react-pdf`, or `resend` references). Once those exist they'll get the same `useTenant()` treatment. Flagging now so we don't claim done-ness we haven't earned.
- **Codemod / ESLint rule (2.7).** I'll add a custom ESLint rule that warns on `supabase.from('<business_table>')` outside the tenant-scoped helper. Warn-only at first so the migration doesn't break the build.
- **Phases 3 and 4** — done in subsequent rounds.

---

## Phase 2 — Detailed steps

### 2.1 Migration (single SQL file)

```text
1. CREATE TABLE tenants (id, name, slug UNIQUE, logo_url, primary_color,
     tax_number, commercial_registry, address, phone, email,
     currency DEFAULT 'EGP', tax_rate NUMERIC DEFAULT 14,
     plan DEFAULT 'free', status DEFAULT 'active', timestamps)
2. CREATE TYPE tenant_role AS ENUM ('owner','admin','sales','worker','viewer')
3. CREATE TABLE tenant_members (id, tenant_id FK, user_id FK auth.users,
     role tenant_role, UNIQUE(tenant_id, user_id), created_at)
4. GRANTs + RLS on both
5. INSERT default tenant 'pelecanon' (capture id into a DO block)
6. For each business table T in:
     customers, quotes, quote_items, invoices, orders,
     production_assignments, qc_inspections, remakes, workers,
     materials, material_variants, suppliers, wastage_rules,
     internal_notes, finishes, veneers, accessories, products,
     product_templates, categories, configurations,
     pricing_factors, pricing_rules, discounts,
     production_logs, production_photos, notification_log,
     notification_templates, quote_requests, audit_log:
       a. ALTER TABLE T ADD COLUMN tenant_id uuid
       b. UPDATE T SET tenant_id = <pelecanon-id> WHERE tenant_id IS NULL
       c. ALTER COLUMN tenant_id SET NOT NULL
       d. CREATE INDEX (tenant_id), and (tenant_id, created_at) where created_at exists
       e. Add immutability trigger: prevent UPDATE of tenant_id
7. SECURITY DEFINER helper:
     is_tenant_member(_tenant_id uuid, _roles tenant_role[]) RETURNS boolean
8. Drop old `is_staff`-based policies on every business table and recreate:
     SELECT: USING (is_tenant_member(tenant_id, ARRAY[...all roles]))
     INSERT: WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']))
     UPDATE: USING + WITH CHECK same as INSERT
     DELETE: USING (is_tenant_member(tenant_id, ARRAY['owner','admin']))
9. CREATE TABLE tenant_audit_log (id, tenant_id, user_id, action, entity_type,
     entity_id, details jsonb, created_at)
10. handle_new_user trigger update: stop auto-granting admin role (that was
    single-tenant behavior). New users land with zero memberships → onboarding.
    Keep the existing `pelecanon` admin assignments intact via a one-time
    backfill: every existing user_role row → tenant_members(pelecanon, user, role).
```

I'll **replace** the existing `companies` / `company_id` story with the new `tenants` / `tenant_id` story rather than running both. `default_company_id()` stays for the old `company_id` columns until those are dropped in a later cleanup migration — out of scope for this round.

### 2.2 RLS — uniform pattern via helper

All business-table policies go through `is_tenant_member(tenant_id, roles[])` (SECURITY DEFINER, search_path=public) to avoid recursion and keep policies one-line.

### 2.3 App-side tenant context

- `src/lib/tenant.functions.ts` — `getMyTenants()`, `getTenantBySlug(slug)` server fns.
- `src/lib/useTenant.tsx` — context provider populated by the `_tenant` layout loader; exposes `{ tenant, role, members }`. Throws if read outside provider.
- `src/lib/tenantClient.ts` — `tenantScopedFrom(client, table, tenantId)` helper: thin wrapper that returns `client.from(table)` pre-filtered.

### 2.4 Routing

```text
src/routes/
  _tenant.tsx                       # validates auth + membership in beforeLoad
  _tenant/$slug.tsx                 # loads tenant, sets provider, redirects 403
  _tenant/$slug/admin.tsx           # ports current src/routes/admin.tsx
  _tenant/$slug/admin/...           # moves every current admin/* child here
  admin.tsx (legacy)                # redirects to /t/pelecanon/admin
  onboarding.tsx
  signup.tsx
```

`/t/$slug/...` is implemented as the `_tenant/$slug` layout (TanStack file-route convention). The path prefix `/t/` is the URL form; internally it maps cleanly via `createFileRoute('/_tenant/$slug/admin')`. (If you prefer the literal `/t/$slug` URL, I'll use folder `t.$slug.tsx` instead — equivalent.)

### 2.5 Branding

- Sidebar header reads `tenant.name` and `tenant.logo_url`; falls back to "PeleCanon" + gold "P" mark.
- Injects `<style>:root{--brand-primary: <hex>}</style>` at the `_tenant/$slug` layout when `tenant.primary_color` is set. Existing Emerald tokens stay as fallback.
- Tracking page footer + auth page (when scoped) use tenant name.

### 2.6 Onboarding

- `/signup` — email/password + Google. On success: ask tenant name → create tenant + owner member → redirect `/onboarding`.
- `/onboarding` — 5 steps, all client-side state, single server fn `completeOnboarding({tenant updates, seedDefaults, invites[]})` that does the inserts in one transaction (via supabaseAdmin RPC). Logo upload to existing `production-photos` bucket (or a new public `tenant-logos` bucket — I'll create one).

### 2.7 Defense

- `tenant_audit_log` table + an INSERT-only RLS policy.
- ESLint custom rule warning on direct `supabase.from('<known_business_table>')` use outside `tenantScopedFrom`.

---

## What I need from you to start

1. **Confirm scope reductions** above (especially the test-suite deferral and `getTenantClient` substitution).
2. **Confirm URL shape**: literal `/t/{slug}/admin/...` is what you want? (vs. `/{slug}/admin` — shorter, but collides with future top-level routes.)
3. **Existing users**: I'll migrate every current `user_roles` row into `tenant_members(pelecanon, user, mapped_role)`. The current `user_roles` table has roles `admin`. I'll map `admin → owner`. OK?

Reply "go" (with any tweaks) and I'll ship Phase 2 in one pass: migration → app wiring → onboarding → branding. Phases 3 and 4 follow in separate rounds.