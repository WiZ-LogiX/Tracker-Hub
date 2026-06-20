# PeleCanon — Agent Guide

## Project Overview

PeleCanon is a multi-tenant furniture-manufacturing SaaS for the Egyptian market. Arabic-first (ar/en/fr), EGP currency, 14% VAT.

### Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start (SSR) + React 19 |
| Routing | TanStack Router v1 (file-based) |
| Data | TanStack Query v5 (client cache) |
| UI | shadcn/ui + Tailwind CSS v4 + Radix primitives |
| DB | Drizzle ORM + Supabase Postgres (direct connection) |
| Auth | Supabase Auth (username-based, synthetic `<user>@pelecanon.local` email) |
| Storage | Cloudflare R2 (presigned URLs via AWS SDK v3) |
| Deploy | Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`) |
| i18n | i18next + react-i18next + browser language detector |
| Validation | Zod (server function inputs) + React Hook Form (client forms) |
| Build | `@lovable.dev/vite-tanstack-config` (TanStack Start + React + Tailwind + Cloudflare plugins) |
| Lint | ESLint 9 + typescript-eslint + Prettier |
| Language | TypeScript 5.8, strict mode, ES2022 target |

---

## Domain Model

### Tenancy

Every business table has a `tenant_id` column. Resolved at runtime via:

```
requireSupabaseAuth → requireTenant → TenantContext { userId, tenantId, role }
```

Roles: `owner | admin | sales | worker | viewer` + custom slugs via `tenant_roles` table.

### Catalog

| Table | Purpose |
|---|---|
| `product_templates` | Reusable product definitions (code, base_price) |
| `products` | Instances with dimensions, linked to templates |
| `materials` | Raw materials (MDF, wood, aluminum) with price_per_unit |
| `suppliers` | Material suppliers |
| `finishes` | Surface finishes with price_modifier_pct + fixed |
| `veneers` | Wood veneers with price_per_m2 |
| `accessories` | Hardware/add-ons with unit_price |
| `pricing_factors` | Configurable factors: labor, wastage, overhead, margin, luxury, complexity, rush |
| `pricing_rules` | Versioned formula DSL (immutable per version) |
| `discounts` | Promo codes with type/value/max_value/validity |
| `wastage_rules` | Material wastage rules |
| `categories` | Product categories |

### Sales Flow

```
customers → quotes → quote_items → orders → invoices
```

- Quotes contain a `snapshot` (JSON pricing breakdown at time of quote)
- Quote numbers: `PLC-YYYYMMDD-NNNN` (tenant-scoped sequential)
- Orders inherit the PLC-ID from the quote
- Invoices track deposit_amount, paid_amount

### Production

```
orders → production_assignments → qc_inspections → remakes
```

9-stage pipeline:
1. `deposit_received` — استلام العربون
2. `design_approved` — اعتماد التصميم
3. `cutting` — قص الخامات
4. `assembly` — التجميع
5. `finishing` — التشطيب والدهان
6. `quality_check` — فحص الجودة
7. `ready_for_pickup` — جاهز للاستلام
8. `delivered` — تم التسليم
9. `completed` — مكتمل

### Permissions

63 permission slugs across 14 categories. Owner bypasses all checks. Stored in `role_permissions` per tenant. Checked via `hasPermission()` / `requirePermission()` from `src/lib/tenant-context.ts`.

---

## HARD RULES

> These rules are non-negotiable. Violating any of them is a bug.

### 1. Tenant scoping

Every DB read and write MUST be tenant-scoped. No raw query without `tenant_id`. Server functions use `requireTenant` middleware; direct `supabaseAdmin` calls must filter by `ctx.tenantId`.

### 2. Pricing rule immutability

Pricing rule versions are immutable. Never mutate an existing rule version. New pricing = new version row. Old quotes reference old versions; they must keep working.

### 3. Append-only logs

`notification_log`, `audit_log`, `internal_notes`, `production_photos`, and `tenant_audit_log` are append-only. Never UPDATE or DELETE rows from these tables.

### 4. No unjustified dependencies

No new dependency without justifying it in the PR description. Prefer stdlib, existing deps, or small inline utilities. The bundle is already large.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server (port 8081) |
| `npm run build` | Production build for Cloudflare Workers |
| `npm run build:dev` | Development-mode build |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint on all `**/*.{ts,tsx}` |
| `npm run test` | Run Vitest test suite |
| `npm run format` | Format with Prettier |

---

## Conventions

### Server functions

All server functions live in `src/lib/*.functions.ts`. They use `createServerFn()` from `@tanstack/react-start`. No REST endpoints, no API routes. Example:

```ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";

export const myFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => MySchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    // ... tenant-scoped logic
  });
```

### File naming

- Server-only: `*.server.ts` (e.g. `client.server.ts`)
- Server functions: `*.functions.ts` (e.g. `catalog.functions.ts`)
- TanStack Router file-based routes: `src/routes/...`
- UI components: `src/components/...` (Radix primitives in `src/components/ui/`)

### Database

- Schema definitions: `src/db/schema.ts` (attachments) + `src/db/tenancy-schema.ts` (tenants, members)
- Business tables defined via Supabase migrations in `supabase/migrations/`
- Drizzle client: `src/db/client.server.ts` (lazy singleton, `postgres` driver)
- All DB access through `supabaseAdmin` (service role) gated by auth + tenant middleware

### Styling

- Tailwind CSS v4 (not v3) — no `tailwind.config.js`
- shadcn/ui components in `src/components/ui/`
- RTL layout (Arabic-first): `dir="rtl"` on root
- Custom fonts: Cairo (Arabic body), Inter (Latin), Playfair Display (serif headings)

### i18n

- Translation files: `src/i18n/locales/ar.json`, `en.json`, `fr.json`
- Components use `useTranslation()` from `react-i18next`
- Arabic is the primary language; English and French are secondary

### Pricing

Two engines coexist:
- **v1** (`src/lib/pricing.ts`): `calculateLine()` — fixed formula, used for backward compat
- **v2** (`src/lib/pricing/engine.ts`): `runFormula()` — configurable JSON DSL, used for new quotes

The `DEFAULT_FORMULA` defines a 14-step pipeline. New quotes use the active `pricing_rules` version.
