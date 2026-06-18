# PeleCanon — Project Overview

> Living document. Tracks what's done, what's in progress, tech foundation, and known risks across all phases.

---

## 🎯 What PeleCanon Is

PeleCanon is a multi-tenant SaaS for **furniture pricing, quotation, and production tracking** (kitchens, wardrobes, bedrooms, tables, office furniture). Built for the Egyptian market (Egyptian pounds, 14% VAT, Arabic-first).

**Core flow:** Catalog → Quote Builder (with full cost breakdown) → Invoice → Production Orders (9-stage workflow with photo logs) → Customer Tracking Page → Notifications (WhatsApp via n8n).

---

## ✅ What's Done

### Phase 0 — Bootstrap (100%)
- TanStack Start + Router + React 19 wired.
- shadcn/ui + Tailwind v4 + Emerald Prestige palette.
- i18n: ar / en / fr, RTL switching, dark mode.
- Landing page, admin layout (22 nav items), public tracking page.

### Phase 1 — Multi-tenant DB (100%)
- `tenants` + `tenant_members` tables with `tenant_role` enum.
- `is_tenant_member(_tenant_id, _roles[])` SECURITY DEFINER helper.
- All 33 public business tables have `tenant_id` (NOT NULL).
- RLS rewritten for strict tenant isolation.
- Tenant immutability trigger (tenant_id cannot be updated).
- Legacy `company_id` columns and `default_company_id()` dropped.

### Phase 2 — Custom Auth (admin-managed credentials, 100%)
- **Username + password** login (no Google OAuth, no self-signup).
- `auth_users` + `auth_sessions` tables in Supabase.
- `bootstrapMyTenant()` server fn for self-healing tenant creation.
- `/admin/team` page to create / disable / reset-password users.
- Avatar uploads to R2 with resize.
- Username is synthesized into `<username>@pelecanon.local` for Supabase Auth.

### Phase 3 — Cloudflare R2 Storage (~70%)
- ✅ Server primitives: `r2.server.ts` (S3 SDK), `r2.utils.ts` (client-safe), `r2.functions.ts` (server fns).
- ✅ Presigned PUT URLs for production photos.
- ✅ Presigned GET URLs via `useSignedR2Urls` hook (25-min TTL).
- ✅ Camera/photo-grid integration on admin orders page.
- ✅ Attachments table for generic file uploads (PDF, CSV, images).
- ✅ CORS policy documented in `src/lib/r2.config.ts`.
- ⏳ Admin migration page `/admin/r2-migration` (UI missing).
- ⏳ CORS applied on production bucket (manual step).

### Phase 4 — Quotation Engine (100%)
- Configurable JSON-DSL pricing rules in `src/lib/pricing/engine.ts`.
- Steps: `add` → `snapshot` → `mul_pct`. Immutable rule versions.
- Default formula supports labor / wastage / overhead / margin / luxury / complexity / rush.
- Wastage rules with material_type + dimension range lookups.
- `/admin/quotes/new` (legacy builder) and `/admin/quotes/configurator` (free-form builder).
- Unified PLC ID (PLC-XXXXX) ties quote → invoice → order chain.

### Phase 5 — Production Tracking (100%)
- 9-stage workflow: deposit_received → design_approved → cutting → assembly → finishing → QC → ready → delivered → completed.
- Worker assignments per stage (pending → in_progress → completed).
- QC inspections + remakes flow.
- Production photo logs grouped by stage.
- Customer-facing `/track?ref=ORD-XXX` with signed URLs.
- Internal notes per entity (quote / invoice / order).

### Phase 6 — Notifications (80%)
- Outbound via n8n webhook (WhatsApp events: quote_sent, order_opened, stage_changed, delivery_scheduled, delivered).
- Latest 200 entries logged in `notification_log`.
- Template-driven (multi-language, fallback to English).
- ⏳ No retry / dead-letter handling yet.

### Supabase Realtime Updates (100%)
- Schema fixes: wastage_rules FK backfill migration.
- Production `listing DB` migrations applied successfully.

---

## 🚧 What's In Progress

### Phase 7 — Migration to Neon + Admin Auth (priority)
- **Status:** Schema migrations prepared, **Phase 1 work remains**.
- Neon Postgres connection (`@neondatabase/serverless` HTTP driver) designed but not cut over.
- Admin-managed user/password auth (replacing Supabase email magic links).
- R2 client setup for direct uploads (presigned FR URLs).
- Open question: How to handle Postgres → production data migration.

### Phase 2 — Multi-tenant UI Refinement
- Tenancy stable in DB; UI components not yet context-aware.
- Sidebar / header still reference "PeleCanon" brand (no `useTenant()`).
- Admin users see admin pages through shared personal tenant (must still wire `tenant_id` into server queries).

### Attachment Flow Polish (~30%)
- Uploads work via `<AttachmentUploader>` on orders page.
- Need: la carte attachment support on quotes and invoices (currently only orders).

---

## ⚠️ Known Issues / Blockers

1. **Tenant leakage in admin queries** — Many `supabase.from(...)` calls in `/admin/*` pages bypass tenant filters. RLS is the only barrier.
2. **PDF generation / email templates** — Don't exist yet. Tracking page can't email PDFs from the system.
3. **Inline form UX** — Configurator builder is good; legacy `/quotes/new` is missing virtual scrolling and offline caching.
4. **Realtime updates not yet wired** — Workflow requires manual refresh after worker assignment uploads.
5. **Cost analysis** — Aggregate calc only at `/admin/cost-analysis`, no per-month bar charts.
6. **Tenant header / footer not dynamic** — Tracking page footer hardcodes "PeleCanon" instead of `tenant.name`.
7. **Subscription plan GTM** — No plan tier enforcement anywhere; `tenants.plan` is just text.

---

## 🚀 Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript, TanStack Start (SSR) + TanStack Router (file-based) |
| UI | shadcn/ui (Radix primitives) + Tailwind v4 + Lucide React |
| Forms | React Hook Form + Zod + `@hookform/resolvers` |
| Server state | TanStack Query v5 (`useQuery`, `useMutation`) |
| Server fns | `createServerFn` from `@tanstack/react-start` (no separate API layer) |
| Data | Drizzle ORM (Postgres) + Supabase (Auth/Storage legacy) + planned Neon |
| Storage | Cloudflare R2 via `@aws-sdk/client-s3` + presigned URLs |
| Notifications | n8n webhook (deployment-side, not integration) |
| Deploy | Cloudflare Workers via `@cloudflare/vite-plugin` + Wrangler (`wrangler.jsonc`) |
| i18n | i18next + react-i18next (ar/en/fr) |
| Date utils | date-fns (with `date-fns/locale/ar` for Arabic formatting) |
| Charts | recharts (cost analysis page) |

---

## 📊 File Index (Quick Jumps)

| What | Where |
|---|---|
| Drizzle schema | `src/db/schema.ts` |
| Tenant types | `src/lib/tenant-context.ts` |
| Auth (current: Supabase) | `src/integrations/supabase/*` |
| Auth (target: admin-managed) | `src/lib/auth.functions.ts` |
| Auth middleware | `src/integrations/supabase/auth-middleware.ts` |
| Server fns | `src/lib/*.functions.ts` |
| Pricing DSL | `src/lib/pricing/engine.ts` |
| R2 primitives | `src/lib/r2.server.ts`, `src/lib/r2.utils.ts` |
| R2 server fns | `src/lib/r2.functions.ts` |
| i18n locales | `src/i18n/locales/{ar,en,fr}.json` |
| Public tracking | `src/routes/track.tsx`, `src/lib/tracking.functions.ts` |
| Admin orders | `src/routes/admin/orders.tsx` |
| Quote builder (legacy) | `src/routes/admin/quotes/new.tsx` |
| Quote builder (configurator) | `src/routes/admin/quotes/configurator.tsx` |
| Production stages | `src/lib/stages.ts` |
| Migration plan (Neon) | `.lovable/neon-migration-plan.md` |
| SaaS plan (multi-tenant) | `.lovable/plan.md` |
| Phase status sheet | `.lovable/STATUS.md` |
| R2 docs | `docs/R2.md` |

---

## 🏁 Roadmap (Suggested Order)

1. **Stabilize Phase 2 (multi-tenant UI + sidebar branding)** — already DB-ready.
2. **Wire tenant ** in every server fn (`tenantDb()` helper pattern from plan).
3. **Add admin-managed auth (Phase 7 / Neon migration kickoff)**.
4. **Run `drizzle-kit pull`** against new Neon DB & reconcile.
5. **Move `genericCrud` from Supabase reads to Drizzle** (catalog tables).
6. **PDF quotation renders** via react-pdf with tenant logo.
7. **Realtime on production workflow** (TanStack Realtime / SSE fallback).

---

## 💡 Open Questions for the Product Team

- Cutover strategy for Postgres migration: **soft (dual-write, telemetry)** vs. **hard (full export, scheduled outage)**?
- Initial onboarding wizard in template scope (5-step) or webhook-based invitation?
- Reskinning per-tenant: capped at brand color + logo, or full theme overrides via CSS variable injection?

---

## 📝 TL;DR

- **Catalog + quoting + production tracking**: ✅ feature-complete.
- **Multi-tenant DB**: ✅ schema done, ⏳ UI partial.
- **Admin-managed auth**: ✅ on Supabase path, ⏳ Neon swap pending.
- **Cloudflare R2**: ✅ server SDK + presigned flows done; ⏳ bucket CORS pending.
- **Phase 7 priorities**: Neon cutover, tenant-aware server fns, PDF venue.