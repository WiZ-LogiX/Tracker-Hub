# PeleCanon — Project Overview

> Living document. Tracks what's done, what's in progress, tech foundation, and known risks across all phases. Verified against baseline commit `c3d472b` on `feature/atelier-prestige-homepage`.

---

## 🎯 What PeleCanon Is

PeleCanon is a multi-tenant SaaS for **furniture pricing, quotation, and production tracking** (kitchens, wardrobes, bedrooms, tables, office furniture). Built for the Egyptian market (Egyptian pounds, 14% VAT, Arabic-first).

**Core flow:** Catalog → Commercial Quote Builder (`/admin/quotes/new`) with full cost breakdown → Invoice & Ledger → Production Orders (9-stage workflow with photo logs) → Customer Tracking Page (`/track`) → Notifications (WhatsApp via n8n).

---

## ✅ What's Done

### Phase 0 — Bootstrap (100%)
- TanStack Start + Router + React 19 wired.
- shadcn/ui + Tailwind v4 + Emerald Prestige palette.
- i18n: ar / en / fr, RTL switching, dark mode.
- Landing page, admin layout (23 nav items), public tracking page.

### Phase 1 — Multi-tenant DB & Schema Parity (100%)
- `tenants` + `tenant_members` tables with `tenant_role` enum.
- `is_tenant_member(_tenant_id, _roles[])` SECURITY DEFINER helper.
- **34 tenant-scoped business tables** across Drizzle ORM (`src/db/schema.ts`) and Supabase migrations (including `projects` entity table from `20261101_projects_entity.sql`).
- All 34 tables have `tenant_id` (NOT NULL) and strict foreign key relationships.
- RLS written and verified for strict tenant isolation.
- Tenant immutability trigger (`tenant_id` cannot be modified across updates).
- Legacy `company_id` columns and `default_company_id()` dropped.

### Phase 2 — Unified RBAC & Access Management (100%)
- **Unified RBAC Engine**: One single source of truth across `tenant_members`, `tenant_roles`, `permissions`, and `role_permissions`.
- **3-State Permission Resolution**:
  1. *Uninitialized roles*: automatically seeded with defaults.
  2. *Roles with explicitly saved permissions*: resolved directly from tenant role permissions.
  3. *Roles intentionally configured with zero permissions*: strictly enforced with 0 permissions, never falling back to defaults.
- **Predefined Access Profiles & Custom Roles**:
  - `owner`: Immutable super-admin with unconditional full system access.
  - `admin`: Full administrative access (adjustable per tenant).
  - `sales`: Operational manager access across CRM, quotes, projects, orders, and after-sales.
  - `worker`: Strictly scoped task worker workspace (`/admin/tasks` only; all administrative routes blocked and hidden).
  - `viewer`: Read-only access profile.
  - *Custom Roles*: Tenant-scoped dynamic roles configurable via `/admin/team`.
- **Decoupled Architecture**: Presentation metadata decoupled into client-safe `src/lib/tenant-permissions-data.ts`, preventing Node.js database drivers from leaking into Vite / Cloudflare Workers client bundles.
- **Fail-Close Auth Middleware**: Mock bearer tokens (`mock-...`) and mock user ID fallbacks are strictly gated behind `(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")`, preventing unauthorized access in production or unconfigured runtimes.
- **Admin-Managed Credentials**: Username + password authentication via Supabase Auth (synthesized as `<username>@pelecanon.local`).

### Phase 3 — Cloudflare R2 Storage (100%)
- ✅ Server primitives: `r2.server.ts` (S3 SDK), `r2.utils.ts` (client-safe), `r2.functions.ts` (server fns).
- ✅ Presigned PUT URLs for direct browser-to-bucket uploads of production photos and attachments.
- ✅ Presigned GET URLs with short-lived, bounded customer capability TTL (10 minutes max).
- ✅ Camera and photo-grid integration on admin orders page and customer tracking page.
- ✅ Attachments table for generic file uploads (PDF, CSV, images) scoped per tenant.
- ✅ R2 storage migration helpers and CORS policy documented in `src/lib/r2.config.ts`.

### Phase 4 — Quotation Engine & Canonical Numbering (100%)
- **Canonical PLC Identifier (`PLC-XXXXX`)**: Standardized 5-character alphanumeric format linking the full commercial chain: Quote → Project (`PRJ-XXXXX`) → Order (`PLC-XXXXX`) → Delivery (`DEL-XXXXX`) → Invoice (`PLC-XXXXX`).
- **Commercial Quotation Builder (`/admin/quotes/new`)**: Consolidated quotation workspace supporting multi-category commercial terms, margins, wastage, and cost breakdown.
- **Configurator Retirement**: Legacy `/admin/quotes/configurator` redirects cleanly to `/admin/quotes/new` with full dimension and pricing preservation.
- **Progressive 7-Step Quotation Lifecycle Stepper**:
  1. Draft (`draft`)
  2. Internal Approval (`approved`)
  3. WhatsApp Confirmation Request (`confirmation_requested`)
  4. Customer Consent (`consented`)
  5. PDF Sent (`pdf_sent`)
  6. Customer Decision (`awaiting_customer_decision` / `accepted` / `rejected` / `revision_requested`)
  7. Converted to Production Order (`converted`)
- Configurable JSON-DSL pricing rules in `src/lib/pricing/engine.ts` with immutable rule versions.

### Phase 5 — Production Tracking & Customer Journey (100%)
- 9-stage internal factory workflow: deposit_received → design_approved → cutting → assembly → finishing → QC → ready → delivered → completed.
- 6 simplified customer-facing stages on `/track?ref=<token>`: Order Confirmed → Design Approval → In Production → Quality Check → Ready for Delivery → Delivered.
- Dual public search modes on `/track`: direct unguessable 128-bit `tracking_token` capability access, or dual-factor order number + customer phone verification.
- Worker assignments per stage with mobile-friendly status transitions.
- QC inspections + remakes flow.
- Production photo logs grouped by stage with customer signed URLs.

### Phase 6 — Notifications & Integrations (80%)
- Outbound via n8n webhook (WhatsApp events: quote_sent, order_opened, stage_changed, delivery_scheduled, delivered).
- Latest 200 entries logged in `notification_log`.
- In-app notification bell with real-time deep links to tasks, orders, and quotes.
- Template-driven (multi-language: Arabic, English, French).
- ⏳ Retry / dead-letter queue handling pending.

---

## 🚧 What's In Progress

### Attachment Flow Polish (~70%)
- Uploads and signed downloads work via `<AttachmentUploader>` across orders and tracking.
- Expansion to quotes and invoices attachment drawers.

### Multi-tenant Branding Customization (~80%)
- Tenant-scoped roles and team members fully functional.
- Dynamic per-tenant logo and branding tokens wired.

---

## ⚠️ Known Issues / Blockers

1. **Realtime updates** — Workflow requires manual refresh after worker assignment uploads.
2. **Cost analysis monthly trends** — Aggregate calc completed at `/admin/cost-analysis`; detailed per-month bar charts pending.
3. **Subscription plan GTM** — No plan tier enforcement anywhere; `tenants.plan` is text.

---

## 🚀 Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript, TanStack Start (SSR) + TanStack Router (file-based) |
| UI | shadcn/ui (Radix primitives) + Tailwind v4 + Lucide React |
| Forms | React Hook Form + Zod + `@hookform/resolvers` |
| Server state | TanStack Query v5 (`useQuery`, `useMutation`) |
| Server fns | `createServerFn` from `@tanstack/react-start` (no separate API layer) |
| Data | Drizzle ORM + Supabase PostgreSQL (34 tenant-scoped tables) |
| Storage | Cloudflare R2 via `@aws-sdk/client-s3` + presigned URLs |
| Notifications | n8n webhook (deployment-side) + In-app Notification Bell |
| Deploy | Cloudflare Workers via `@cloudflare/vite-plugin` + Wrangler (`wrangler.jsonc`) |
| i18n | i18next + react-i18next (ar/en/fr) with RTL support |
| Date utils | date-fns (with `date-fns/locale/ar` for Arabic formatting) |
| Charts | recharts (cost analysis page) |

---

## 📊 File Index (Quick Jumps)

| What | Where |
|---|---|
| Drizzle schema (34 tables) | `src/db/schema.ts` |
| Tenant context & RBAC engine | `src/lib/tenant-context.ts` |
| Client-safe permission metadata | `src/lib/tenant-permissions-data.ts` |
| Auth & Role management fns | `src/lib/auth.functions.ts` |
| Auth middleware (fail-close) | `src/integrations/supabase/auth-middleware.ts` |
| Tenant middleware | `src/integrations/supabase/tenant-middleware.ts` |
| Server functions | `src/lib/*.functions.ts` |
| Customer quote decision server | `src/lib/quote-decision.server.ts` |
| Pricing DSL engine | `src/lib/pricing/engine.ts` |
| R2 primitives & server fns | `src/lib/r2.server.ts`, `src/lib/r2.utils.ts`, `src/lib/r2.functions.ts` |
| Canonical numbering generator | `src/lib/numbering.ts` |
| Public tracking handler | `src/routes/track.tsx`, `src/lib/tracking.functions.ts` |
| Commercial quotation builder | `src/routes/admin/quotes/new.tsx` (legacy `configurator.tsx` redirects here) |
| Projects workspace | `src/routes/admin/projects.tsx`, `src/routes/admin/projects/$id.tsx` |
| Production stages definition | `src/lib/stages.ts` |
| Playwright E2E global setup | `e2e/global-setup.ts` |
| R2 documentation | `docs/R2.md` |

---

## 🏁 Roadmap (Suggested Order)

1. **Wire tenant middleware in every remaining server fn** (`tenantDb()` pattern).
2. **Move remaining legacy queries from Supabase REST to Drizzle ORM**.
3. **PDF quotation renders** via react-pdf with tenant logo.
4. **Realtime on production workflow** (SSE / TanStack Realtime).

---

## 📝 TL;DR

- **Catalog + quoting + production tracking**: ✅ feature-complete.
- **Multi-tenant DB**: ✅ 34 tables verified, strict tenant isolation.
- **Unified RBAC**: ✅ 3-state permission resolver, adjustable predefined profiles, custom roles, client-safe bundling, and fail-close security.
- **Cloudflare R2**: ✅ complete server SDK + presigned flows + 10-minute bounded customer capability URLs.
- **Commercial Quotation & Projects**: ✅ canonical `PLC-XXXXX` numbering and unified commercial builder.
