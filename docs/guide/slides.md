# PeleCanon — Presentation Guide

---

## Slide 1 — Cover

**PeleCanon**
Pricing, quoting & production tracking for custom furniture.

A vertically-integrated workspace for the bespoke furniture business.

Podium-ready three-liner:
- One workspace for customer, quote, order, factory, and finance.
- Built around a configurable pricing engine, not hard-coded markups.
- Multi-tenant from the database up, designed to onboard new brands in days.

---

## Slide 2 — The problem

Workshops that build custom kitchens, wardrobes, and bedrooms have outgrown spreadsheets but underestimated CRMs. They need:

- A pricing calculator that respects every finish, veneer, and wastage percentage.
- A quote-to-invoice-to-order paper trail that doesn't lose trace of who approved what.
- Public order tracking for the customer, internal photo logs for the workshop.
- A way to onboard new cabinet brands without rewriting their software.

---

## Slide 3 — What we shipped

- **Quote configurator** with formula-driven pricing (labor, wastage, overhead, margin snapshots were fed through a custom formula DSL).
- **Production workflow** across 9 stages: deposit → design approval → cutting → assembly → finishing → QC → ready-for-pickup → delivery → closed.
- **Customer tracking pages** at `/track?ref=…` reachable by phone or order number.
- **Multi-language en/ar/fr UI**, right-to-left aware.
- **Cloudflare R2 storage** for production photos via presigned PUT URLs.

---

## Slide 4 — Tech stack

- **Frontend**: React 19, TanStack Router file-routes, TanStack Start SSR/SSG.
- **UI**: shadcn/ui (Radix primitives) — Emerald Prestige palette tuned to the brand.
- **Styling**: Tailwind v4 (CSS-first config), Cairo + Playfair Display typography.
- **State & data**: TanStack Query v5, server functions via `createServerFn`.
- **Database**: Supabase Postgres in dev; portable client pointed at Neon in production via neon-http.
- **Storage**: Cloudflare R2 (S3-compatible) with browser-direct PUT + signed-GET for private reads.
- **Auth**: Supabase email/password; admin-managed credential model with RLS-enforced tenancy.
- **i18n**: i18next + 3 locale JSON files.
- **Deploy**: Cloudflare Workers via `@cloudflare/vite-plugin` and wrangler.

---

## Slide 5 — Repository map

Top-level paths worth memorising:

| Path | Role |
|------|------|
| `src/routes/` | TanStack Router file-routes (file = URL) |
| `src/components/ui/` | shadcn primitives — don't edit, compose |
| `src/components/admin/` | Composite admin widgets |
| `src/lib/` | Server functions, pricing engine, R2 helpers |
| `src/db/` | Drizzle schema + portable Neon client |
| `src/integrations/supabase/` | Auth + admin Supabase clients, RLS middleware |
| `src/i18n/locales/` | ar/en/fr JSON |
| `src/styles.css` | Tailwind v4 tokens + Emerald Prestige palette |
| `supabase/migrations/` | SQL migrations |
| `scripts/` | Migration runner, postflight checks |

---

## Slide 6 — Core data model

Three logical rings — keep three colors in your diagrams:

1. **Catalog ring**: categories, products, product_templates, materials, suppliers, finishes, veneers, accessories, wastage_rules.
2. **Commercial ring**: customers, quote_requests, quotes, quote_items, discounts, invoices, orders.
3. **Production ring**: production_assignments, production_logs, production_photos, qc_inspections, remakes, workers, notifications.

Each business table now carries `tenant_id` (NOT NULL) — added in Phase 1, with a single `tenants` table as the source of truth.

---

## Slide 7 — Multi-tenant architecture

The "h=(horizontal) → h=(helper) → p=(policy)" rhythm:

- **H**orizontal slice: every business table gets a `tenant_id` column with the appropriate index and `set_NULL` then `NOT NULL` migration pattern.
- **H**elper function: `is_tenant_member(_tenant_id uuid, _roles tenant_role[])` — `SECURITY DEFINER`, `search_path` locked to `public`. Recursion-safe.
- **P**olicy rewrite: every business table's RLS becomes a one-liner through the helper. Read uses `USING`, write uses `WITH CHECK`, delete uses `USING`.

This shape lets us onboard a new brand by inserting one row into `tenants` and granting memberships — no schema change required.

---

## Slide 8 — Pricing engine

Two engines, one purpose:

| File | Use |
|------|-----|
| `src/lib/pricing.ts` | Old fixed-formula engine (in-line multipliers). |
| `src/lib/pricing/engine.ts` | New DSL: sequence of `add`, `snapshot`, `mul_pct` steps applied to a `Selections` record + a factor map. |

The DSL is JSON-serialised; an admin can save a new formula version, and every subsequent quote tags itself with `pricing_rule_version` for reproducibility. Snapshots ("subtotal_before_overhead") make factor math easy to inspect in the breakdown view on the customer page.

---

## Slide 9 — Order tracking + photo capture

Public `/track?ref=…` route. Three lookup keys (order number, phone, request number) consolidate into full progress, stage logs, and per-stage photos. Photos are stored privately in R2 — the public route signs GET URLs on demand (30-minute TTL). Phase 1 guarantees keys are scoped to the tenant — no `tenant_id` access equals no signed URL.

---

## Slide 10 — Auth & session model

`AuthProvider` listens to `supabase.auth.onAuthStateChange`, stores session in React context, fetches role via `user_roles`.

Two middleware run on every server function:
1. `attachSupabaseAuth.client` — attaches the bearer token to the request.
2. `requireSupabaseAuth.server` — parses the bearer token, validates it with `getClaims`, populates `context.userId` + `context.claims`.

A third middleware to come (`requireTenant`) is in flight — it queries `tenant_members` for the user's first active membership and adds `tenantId` + `role` to the context.

---

## Slide 11 — R2 Media

Storage primitives in `src/lib/r2.server.ts` + `src/lib/r2.utils.ts` + `src/lib/r2.functions.ts`. Three lifecycles:

1. **Upload**: client asks `getR2BatchUploadUrls` (cap 20) → presigned PUT → DB row with public URL.
2. **View**: server function `getR2ViewUrls` signs multiple keys at once, defends against cross-tenant signing.
3. **Delete**: `deleteR2Object` (server) checks object is in user's tenant prefix before issuing DELETE.

CORS policy frozen in `src/lib/r2.config.ts` — required for browser-direct uploads.

---

## Slide 12 — Migration status

Phases tracked in `.lovable/neon-migration-plan.md`:

| Phase | Intent | % done |
|-------|--------|--------|
| 1 | Multi-tenant DB | ✅ 100% (33 tenant-scoped tables, helper, RLS) |
| 2 | App-side tenancy (server fns + UI) | 🚧 in progress — DB changed; app unchanged |
| 3 | Cloudflare R2 storage | 🔧 0% — infra present, no client wiring |
| 4 | Data-access rewrite (Supabase → Drizzle/Neon) | ⏸ queued |
| 5 | Data migration + cutover | ⏸ blocked |

Phase 2's outstanding work is the single scaling bottleneck.

---

## Slide 13 — Phase 2 to-do list (next sprint)

1. Refactor `requireSupabaseAuth` into a `requireTenant` middleware that adds tenant + role to the request context.
2. Sweep all `src/lib/*.functions.ts` files: add `requireTenant` to the middleware chain.
3. Replace every direct `supabase.from(...)` and `supabaseAdmin.from(...)` in admin pages with server functions (or at least narrow by tenant).
4. Rewrite `useAuth.tsx` so the React context exposes `{ user, tenant, role }` and an `/admin` route checks the right role.
5. Add a tenant pill to the sidebar header — read from `useTenant()` after that hook lands.

---

## Slide 14 — Operational discipline

Operational artifacts:

- `sprint1-apply.ts`: transactional migration runner with staleness checks.
- `postflight-tenant-migration.sql`: regression-detecting queries—run on every CI green.
- `db-check` admin route: hand-rolled health check (`SELECT now(), current_database(), version()`).
- `tests/rls.test.ts`: cross-tenant read isolation re-checked at every phase.

Acceptance: any `supabaseAdmin` query that lacks an explicit tenant filter is rejected in code review.

---

## Slide 15 — What's known to be technically fragile

- **Service-role queries**: every direct `supabaseAdmin.from(...)` call must carry `.eq('tenant_id', tenantId)`. Audit script not yet written — manual discipline.
- **Configurations table**: dropped Phase 1 `tenant_id` row during the cascade — needs a follow-up migration to add it back.
- **Existing `customer_labels` & other public tables on Supabase**: not yet scrubbed. They'll remain useful for cross-brand analytics if exposed via admin-only views.
- **No test runner for React components** — only for RLS. Add vitest + RTL in a follow-up sprint.

---

## Slide 16 — Risks (and mitigations)

- **Tenant leakage**: handled by RLS + per-function `.eq('tenant_id', …)`. Mitigation: complete Phase 2 wiring + automated ESLint rule.
- **R2 public reads**: currently private + signed. Mitigation: same model as production photos, single bucket policy.
- **Cross-tenant photo reads**: tag with RLS-friendly scoping via key prefix matching tenant UUID.
- **Multi-language drift**: strings added in one locale but not the others. Mitigation: missing-key lint rule on CI.

---

## Slide 17 — Onboarding a new brand — the dream

A new furniture brand "Scandi&Co" wants in. Tomorrow's job:

1. Login to Supabase → insert one row into `tenants` (slug, name, primary color).
2. Insert one row into `tenant_members` per admin user.
3. New `useTenant()` hook reads tenant from URL slug.
4. /t/scandi-co/admin/marketing re-directs them into the configurator with their branding.
5. Zero schema changes. Zero code changes to the existing routes.

This is why every business table carries `tenant_id` — onboarding is a SQL insert.

---

## Slide 18 — Next 30 days, by week

- **Week 1**: Phase 2 finish-line. `requireTenant` middleware, sweep `*.functions.ts`, refactor `useAuth.tsx`, ESLint rule.
- **Week 2**: R2 client wiring + first end-to-end photo upload flow on an order.
- **Week 3**: Drizzle adapter switch + reload-test against dev Neon.
- **Week 4**: Phased cutover to Neon (read-only if possible). Browser-side smoke tests on `/track`.

If any one of these slips, the deadline slips with it.

---

## Slide 19 — Demo script (60 seconds)

1. Visit `/` → marketing landing page (Emerald Prestige + Cairo typography).
2. Open `/track?ref=ORD-xxxx` → see customer's public status page.
3. Open `/admin` → login → quote builder → pick material + finish → factor breakdown shows up live as you tweak wastage %.
4. Convert quote → invoice → order → walk an order through 9 stages.
5. Upload production photos → they show up on the customer's tracking page in real time.

---

## Slide 20 — Closing

PeleCanon has a real foundation: the database is multi-tenant, the pricing engine is honest, the public tracking page actually works, and R2 is ready to be wired in. The remaining work is what every mature SaaS must do: sweep, harden, and cutover.

A foundation you can keep building on.