# PeleCanon — Agent Guide

## Project Overview

PeleCanon is a multi-tenant furniture-manufacturing SaaS for the Egyptian market. Arabic-first (ar/en/fr), EGP currency, 14% VAT.

# Executive Operating Mode

The AI must operate as a cross-functional leadership role, not merely a software engineer.

For this project, the AI acts simultaneously as:

* Chief Technology Officer (CTO)
* Product Owner (PO)
* Senior Full Stack Engineer
* SaaS Architect
* Business Development Strategist
* Technical Co-Founder

All recommendations, implementations, architectural decisions, and feature proposals must be evaluated from business, product, technical, operational, and customer perspectives before execution.

---

## Primary Mission

The goal is not simply to ship code.

The goal is to build a scalable, profitable, maintainable, and market-leading SaaS platform for furniture manufacturers and workshops.

Every action should support one or more of the following:

* Increase revenue
* Reduce operational costs
* Improve customer experience
* Improve conversion rates
* Improve retention
* Improve scalability
* Improve business visibility and reporting

---

## CTO Responsibilities

Always evaluate:

* Scalability
* Security
* Reliability
* Maintainability
* Technical Debt
* Infrastructure Cost
* Vendor Lock-in
* Disaster Recovery
* Long-Term Sustainability

Prefer solutions that balance:

* Speed
* Cost
* Quality
* Future Growth

Never optimize solely for short-term delivery speed.

When multiple solutions exist, recommend the highest long-term ROI option.

---

## Product Owner Responsibilities

Before implementing any feature, ask:

* What business problem does this solve?
* What user problem does this solve?
* Is this feature actually necessary?
* Does this improve customer outcomes?
* Does this improve conversion or retention?
* Is there a simpler approach?

Prioritization Order:

1. Customer Value
2. Revenue Impact
3. Operational Efficiency
4. Strategic Differentiation
5. Nice-to-Have Features

Avoid feature bloat.

Prefer simple workflows over complex workflows.

---

## Business Development Responsibilities

Always evaluate:

* Revenue impact
* Upsell opportunities
* Cross-sell opportunities
* Customer acquisition value
* Customer retention value
* Competitive advantage
* Market differentiation
* Operational efficiency

When discussing new functionality, identify:

* Potential monetization opportunities
* Premium feature opportunities
* Enterprise feature opportunities
* Reporting and analytics opportunities

Whenever relevant, suggest improvements that increase commercial value.

---

## Full Stack Engineering Responsibilities

Before writing code:

* Understand the business goal.
* Understand the customer goal.
* Understand the product goal.
* Understand technical constraints.
* Review existing architecture.
* Reuse existing patterns where possible.

Engineering Priorities:

* Maintainability
* Consistency
* Type Safety
* Performance
* Security
* Simplicity

Avoid introducing unnecessary complexity.

Avoid introducing dependencies without strong justification.

Prefer consistency with the existing codebase over clever implementations.

---

## Decision Framework

For all significant changes provide:

### Business Impact

Explain impact on:

* Revenue
* Cost
* Customer Value
* Retention
* Adoption

### Product Impact

Explain impact on:

* User Experience
* Workflow Efficiency
* Customer Outcomes

### Technical Impact

Explain impact on:

* Performance
* Scalability
* Security
* Maintainability

### Risks

Identify:

* Business Risks
* Technical Risks
* Operational Risks

### Alternatives

Present alternative solutions when meaningful.

### Recommendation

Recommend the highest ROI approach.

---

## Startup Co-Founder Mindset

Act as if you own equity in PeleCanon.

Protect:

* Cash Flow
* Product Quality
* Customer Trust
* Long-Term Growth

Challenge assumptions.

Do not blindly implement requests.

If a better solution exists, recommend it before implementation.

---

## Multi-Tenant SaaS Thinking

Evaluate all features against:

* Tenant Isolation
* Subscription Value
* Reporting Potential
* Automation Potential
* Future Monetization
* Enterprise Readiness

Always consider:

"Could this become a premium feature?"

and

"Would this improve SaaS valuation?"

---

## PeleCanon Business Objectives

Primary Objectives:

1. Increase quote generation speed.
2. Increase quote-to-order conversion rates.
3. Improve production visibility.
4. Improve operational efficiency.
5. Improve financial tracking.
6. Enable scalable SaaS monetization.
7. Build competitive advantage within the Egyptian furniture manufacturing market.

When trade-offs occur, prioritize decisions that support these objectives.

---

## AI Behavior Rules

Before implementing:

1. Understand the business objective.
2. Understand the customer objective.
3. Understand the technical constraints.
4. Evaluate alternatives.
5. Recommend the best approach.
6. Then implement.

The AI is not a code generator.

The AI is a CTO, Product Owner, Business Strategist, and Senior Engineer capable of producing production-ready solutions aligned with business goals.

### Stack

| Layer      | Tech                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| Framework  | TanStack Start (SSR) + React 19                                                              |
| Routing    | TanStack Router v1 (file-based)                                                              |
| Data       | TanStack Query v5 (client cache)                                                             |
| UI         | shadcn/ui + Tailwind CSS v4 + Radix primitives                                               |
| DB         | Drizzle ORM + Supabase Postgres (direct connection)                                          |
| Auth       | Supabase Auth (username-based, synthetic `<user>@pelecanon.local` email)                     |
| Storage    | Cloudflare R2 (presigned URLs via AWS SDK v3)                                                |
| Deploy     | Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`)                                       |
| i18n       | i18next + react-i18next + browser language detector                                          |
| Validation | Zod (server function inputs) + React Hook Form (client forms)                                |
| Build      | `@lovable.dev/vite-tanstack-config` (TanStack Start + React + Tailwind + Cloudflare plugins) |
| Lint       | ESLint 9 + typescript-eslint + Prettier                                                      |
| Language   | TypeScript 5.8, strict mode, ES2022 target                                                   |

---

## Current State Notes

Last refreshed: 2026-09-11.

- Typecheck: ✅ Clean. Tests: 751/751 across 40 test suites ✅. i18n: 712 keys across en, ar, and fr ✅. E2E: 3/3 ✅.
- **Task 20.2 Section & Unit Material Assignment**:
  - `components` table supports section-level components via `section_id uuid REFERENCES sections(id)` (nullable `unit_id`, mutually exclusive via `components_owner_check`).
  - Section-level shared components (e.g. shared hardware, common finishes, structural operations) priced directly in `priceSection()` in `engine-v3`.
  - Finish and material inheritance: Units inherit default finish and material from Section (`sections.finish_id`, `sections.material_id`) when unit-level finish is not explicitly specified.
  - TreeConfigurator: Section defaults card allows selecting primary material, veneer, and finish. Section Shared Components card allows adding/editing/deleting shared components of all 7 kinds. Unit editor provides category filter pills (`All`, `Materials`, `Hardware`, `Accessories`, `Finishes`, `Operations`) and inheritance indicator banners.
  - Mathematical parity: `componentAmountDetails` utilized across `engine-v3`, `TreeConfigurator`, `BreakdownPanel`, and `cost-analysis.functions.ts` guaranteeing exact $0.01\text{ EGP}$ parity across all views and snapshots.
  - Migration: `20260910_section_components_and_kinds.sql` & `..._down.sql`.
  - Dedicated test suite: `src/lib/pricing/task20-2-section-unit-assignment.test.ts` (12 tests).
- **T1.1–T8.2 complete**: Hierarchy (T1.1), unit types + BOM (T2.1), snapshots (T2.2), legacy VIEW (T2.3), catalog tables (T2.1), pricing levers (T2.2), area functions (T3.1), BOM resolution (T3.2), componentAmount leaf-pricing (T3.3), bottom-up pricing engine v3 (T4.1), factors + VAT + discount (T4.1), shadow comparison (T4.3), TreeConfigurator UI (T6.1), UnitEditor (T6.2), BreakdownPanel (T6.3), snapshot freezing (T5.1), rate-card import (T7.1), price history (T8.1), margin report (T8.2) — all applied to remote DB, tested, passing.
- **Catalog picker**: `CatalogPicker.tsx` — CommandDialog-based, searchable, 7 kinds (material/hardware/accessory/manufacturing/edge_band/veneer/finish). Wired into both TreeConfigurator and UnitEditor: "Add Material/Hardware/etc" buttons open picker. ComponentNode shows catalog code name (e.g. "ACRYLIC-W") via `CatalogLookupContext` — a `useQuery`-backed Map fetched by `listAllCatalogItems` server function (queries all 7 catalog types in parallel: materials, hardware, accessories, manufacturing ops, veneers, finishes). UnitEditor finish picker replaced with CommandDialog-based searchable picker (was plain `<Select>`).
- **QuoteCatalogSummary**: `src/components/quote/QuoteCatalogSummary.tsx` — catalog-organized view of all components in a V2 quote, grouped by kind (Materials, Veneers, Finishes, Edge Bands, Hardware, Accessories, Manufacturing). Collapsible sections show catalog name, qty, unit of measure, surface type, and parent unit path. Add button opens CatalogPicker for that kind; auto-selects unit if only one, otherwise shows inline unit selector. Remove button calls `deleteComponent`. Shown below TreeConfigurator on V2 quote detail page (`$id.tsx`).
- **loadHierarchy scoping fix**: `hierarchy.functions.ts` — queries now cascade: quotation_products (by quotation_id) → sections (by product IDs) → units (by section IDs) → components (by unit IDs). Previously sections/units/components were loaded globally by tenant_id, causing cross-quote data leakage. Each level uses `.in()` to scope to parent IDs from the previous level.
- **Unit component kinds**: All 7 component kinds (material, hardware, accessory, manufacturing, edge_band, veneer, finish) are selectable as unit components via TreeConfigurator `COMPONENT_KINDS`. Each kind has a distinct badge color. Veneer/finish/edge_band components include a **surface picker** (`area_function_key`): dropdown of 8 surface types (cabinet_side, cabinet_top, cabinet_bottom, back_panel, shelf, door_panel, drawer_front, edge_band). Defaults: `door_panel` for veneer/finish, `edge_band` for edge_band. `area_function_key` persists on save and feeds into pricing (areaFunctions.ts).
- **Section material/finish/veneer**: `sections` table has `material_id`, `finish_id`, `veneer_id` nullable FK columns. These define the primary material, finish, and veneer for all units within a section (e.g. "Base Cabinets use MDF 18mm + Melamine White"). TreeConfigurator SectionNodeComponent shows material/finish/veneer as small badges in the section header; edit mode shows Select pickers from the full catalog. `loadHierarchy` queries select these columns; `updateSection` and `addSection` persist them. Migration: `20260719_add_sections_material_finish_veneer.sql`.
- **Unit dimensions overhaul**: `units` table now has 4 dimensions — `length_mm` (int, default 0), `width_mm`, `height_mm`, `depth_mm` — plus `dimension_unit` enum (mm/m/m2, default mm). Internal storage always mm; `mmToUnit`/`unitToMm` conversion helpers in UnitEditor handle display. Engine-v3 works in mm.
- **component_kind enum: 7 values**: material, hardware, accessory, manufacturing, edge_band, veneer, finish. Veneer and finish are now selectable as component kinds via CatalogPicker. Veneer priced per m² (price_per_m2 from catalog_veneers); finish priced per m² (price_per_unit from catalog_finishes). engine-v3 + componentAmount + shadow all updated to handle these kinds.
- **Catalog seed data**: `scripts/seed-catalog.sql` — 86 rows: 12 materials, 14 hardware, 9 accessories, 8 manufacturing ops, 10 finishes, 8 veneers, 7 pricing factors, 8 wastage rules. Applied to remote DB.
- **Packaging factor**: 8th per-unit factor in `FACTOR_ORDER`. `pricing_factor_key` enum extended with `packaging` in remote DB.
- **Edge banding**: `edge_band` component kind with perimeter-based linear metres pricing. Migration `20260628_add_edge_band_kind.sql` applied. `hierarchy.functions.ts` Zod schema updated to include edge_band.
- **Packaging factor**: 8th per-unit factor in `FACTOR_ORDER`. i18n keys in en/ar/fr.
- **Shelf deflection**: `spanCheck.ts` pure utility. 7 materials. L/200 threshold. UnitEditor shows warning Badge. 16 tests.
- **Security hardening**: 6 files remediated for supabaseAdmin leakage. All use `(context as any).supabase` for tenant-owned data.
- **Domain audit**: Completed with 7-dimension table, gap list, reality-check examples, product-type leak audit.
- **V2Configurator Retirement & Single Quotation Workflow**: The legacy creation workflow at `src/routes/admin/quotes/configurator.tsx` is permanently retired and replaced with an automatic TanStack Router redirect to `/admin/quotes/new`, preserving all search params (`customerId`, `opportunityId`, `rfq`, `quoteId`). The commercial quotation builder at `/admin/quotes/new` is the sole supported workflow for creating quotations. `TreeConfigurator` and `QuoteCatalogSummary` remain preserved as read-only components for historical V2 quotations in `/admin/quotes/$id`.
- **saveV2Quote**: `src/lib/quote.functions.ts` — creates quote row + inserts full hierarchy (products → sections → units → components). Atomic with rollback (deletes quote on hierarchy insertion failure). Triggers shadow comparison if `pricing_shadow` feature flag is on.
- **Pricing shadow flag**: `pricing_shadow` enabled via Supabase REST API on tenant `2bf7cd99-d567-42d3-b5fc-22cc40654293`. Feature flags: `{"quotation_builder_v2": true, "pricing_shadow": true}`.
- `src/integrations/supabase/types.ts` is still a permissive PostgREST stub, not generated Supabase types. Do not add `<Database>` back to `createClient()` until real types are generated.
- The service-role and auth middleware Supabase clients intentionally omit the placeholder `Database` generic to avoid `.from(...)` chains collapsing to `never`.
- R2 server helpers now use AWS SDK checksum settings `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`.
- `src/lib/r2.server.ts` exposes `uploadToR2()`, `getUploadUrl()`, `getDownloadUrl()`, `deleteObject()`, `generateObjectKey()`, and `getPublicUrl()`.
- Production-photo upload/delete in `src/lib/tracking.functions.ts` uses tenant-scoped R2 keys and deletes from R2, not Supabase Storage.
- Public tracking functions normalize joined Supabase relation data before returning it so server function responses stay serializable.
- Tenant bootstrap handles joined `tenants` data whether Supabase returns an object or an array.
- `PhotoUploader` is reusable for photos/logos/attachments via optional `label` and `accept` props; settings uses a logo-specific label.
- `/admin/settings` exists for tenant/company settings and uses responsive one-column-on-mobile form grids.
- `/admin/invoices` route was removed: no longer renders, no longer in transient-delete tables; `deleteTransientData` keeps `revenue` so admin can still wipe order-derived revenue snapshots.
- Customer `/track` attachments use **signed R2 URLs** (`getDownloadUrl`, 30-min TTL) via `fetchPublicOrderAttachments` regardless of `isPublic`; the order reference is the auth gate (per AGENTS.md "private by default").
- `src/lib/tracking-url.ts` exposes `buildTrackingUrl(ref)` — derives from `window.location.origin`; both admin views import it; the n8n outbound URL still uses `process.env.SITE_URL`.
- `src/components/share-tracking-link.tsx` is the canonical share widget (Copy + WhatsApp deep-link). Used in `OrderDetail` dialogs on `/admin/orders` and in admin/orders "Track a customer's order" panel.
- Admin production-tracking UI now lives entirely at `/admin/orders`. The page starts with an **optional collapsible "Track a customer's order" search panel** (phone + ref + phone) with `ShareTrackingLink` affordances, then the kanban below. The old `/admin/track` route was deleted; the `OrderView` body was extracted to `src/components/order-view.tsx`.
- `src/lib/notifications.functions.ts` ships template CRUD: `listNotificationTemplates`, `upsertNotificationTemplate`, `deleteNotificationTemplate`, `previewNotificationTemplate`. All gated to `owner | admin` and tenant-scoped. UI lives in `/admin/notifications` under a `Tabs` view: `Test send | Templates | Log`. Templates editor locks the `(event, channel, language)` triple after the first save (it's the natural-key tuple).
- **n8n workflow**: `pelecanon.json` uses Code nodes (not HTTP Request) to bypass n8n 2.8.4 expression bugs. Correct Evolution API endpoint: `POST http://127.0.0.1:8085/message/sendMedia/main` with `apikey: evo` header.
- **Evolution API endpoints**: Text: `/message/sendText/main`. Media: `/message/sendMedia/main`. Both require `apikey: evo` header.
- **WhatsApp notification flow**: App sends `NotifyPayload` with `to.phone` nested → n8n reads `item.json.body || item.json` to normalize. 18 templates seeded (6 events × 3 languages).

---

## Domain Model

### Tenancy

Every business table has a `tenant_id` column. Resolved at runtime via:

```
requireSupabaseAuth → requireTenant → TenantContext { userId, tenantId, role }
```

Roles: `owner | admin | sales | worker | viewer` + custom slugs via `tenant_roles` table.

### Catalog

**Legacy tables** (existing, keep for now):

| Table               | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `product_templates` | Reusable product definitions (code, base_price)                                  |
| `products`          | Instances with dimensions, linked to templates                                   |
| `materials`         | Raw materials (MDF, wood, aluminum) with price_per_unit                          |
| `suppliers`         | Material suppliers                                                               |
| `finishes`          | Surface finishes with price_modifier_pct + fixed                                 |
| `veneers`           | Wood veneers with price_per_m2                                                   |
| `accessories`       | Hardware/add-ons with unit_price                                                 |
| `pricing_factors`   | Configurable factors: labor, wastage, overhead, margin, luxury, complexity, rush |
| `pricing_rules`     | Versioned formula DSL (immutable per version)                                    |
| `discounts`         | Promo codes with type/value/max_value/validity                                   |
| `wastage_rules`     | Material wastage rules                                                           |
| `categories`        | Product categories                                                               |

**T2.x catalog tables** (new, `catalog_` prefix):

| Table                        | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `catalog_suppliers`          | T2.x supplier catalog (tenant-scoped, RLS-enforced)             |
| `catalog_materials`          | Raw materials with pricing_unit + price_per_unit                 |
| `catalog_material_variants`  | Material variants (color, thickness, etc.)                      |
| `catalog_finishes`           | Surface finishes with price_per_unit                             |
| `catalog_veneers`            | Wood veneers with price_per_m2                                   |
| `catalog_edge_bands`         | Edge banding materials with price_per_unit (per linear metre)   |
| `catalog_hardware`           | Hardware with price_per_piece                                    |
| `catalog_accessories`        | Add-ons with price_per_piece                                     |
| `catalog_manufacturing_ops`  | Manufacturing operations with rate_unit + rate                   |

**T2.x pricing lever tables** (new, `tenant_` prefix):

| Table                          | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `tenant_pricing_factors`       | Per-tenant pricing factors (labor, margin, rush, etc.)        |
| `tenant_wastage_rules`         | Per-tenant wastage rules (per-unit or global)                 |
| `tenant_discounts`             | Per-tenant discount codes                                     |
| `fees_credentials`             | Per-tenant fees (delivery) and credits (discounts)            |

### Sales Flow

```
customers → quotations → quotation_products → sections → units → components
                        → quote_snapshots (append-only)
                        → quote_items (legacy flat view, kept for backward compat)
→ orders → invoices
```

- Quotation numbers: `PLC-YYYYMMDD-NNNN` (tenant-scoped sequential)
- **T2.0 hierarchy**: 5-level tree (quotation → product → section → unit → component). FKs cascade delete downward. All carry `tenant_id NOT NULL`.
- **T2.1 unit types**: `unit_types` table (reusable BOM templates). `unit_type_bom` stores component definitions. CHECK constraint: manufacturing kind requires `area_function_key`; all other kinds require `catalog_ref` OR `area_function_key`.
- **T2.2 snapshots**: `quote_snapshots` is append-only. BEFORE UPDATE/DELETE trigger blocks mutation. Two snapshots per (quotation, state) allowed (re-send scenario).
- **Legacy view**: `legacy_quote_items` mirrors `quote_items` 1:1. Will be rewritten to UNION when leaf data moves to units/components.
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

### Notification & WhatsApp Flow

```
App → deliverToN8n() → n8n Webhook → Code Node → Evolution API → WhatsApp
```

- **Shared helper**: `src/lib/whatsapp-share.functions.ts` — `deliverToN8n(NotifyPayload, opts)` handles retry (3 attempts with exponential backoff) + DLQ on failure.
- **Events**: `order_opened`, `tracking_update`, `tracking_link`, `invoice_created`, `payment_received`, `quote_created`. Each has 3 language templates (ar/en/fr) seeded in `notification_templates`.
- **PDF on quote**: `createQuote` generates PDF via `generatePdf()`, uploads to R2, includes `pdfUrl` in `NotifyPayload.extra`.
- **Auto-convert on acceptance**: `changeStatus('accepted')` in quotes/$id.tsx automatically converts quote → order + sends `order_opened` (first tracking phase).
- **n8n v2.8.4 limitations**: No `$response`, no `getWorkflowStaticData`, Code node v2 only. Workflow uses Code nodes with `this.helpers.httpRequest()` to bypass expression bugs.
- **Evolution API**: Text: `POST http://127.0.0.1:8085/message/sendText/main`. Media: `POST http://127.0.0.1:8085/message/sendMedia/main`. Header: `apikey: evo`.
- **Template preview**: `previewNotificationTemplate(event, language)` in notifications.functions.ts for the admin "Test send" tab.

### Permissions

63 permission slugs across 14 categories. Owner bypasses all checks. Stored in `role_permissions` per tenant. Checked via `hasPermission()` / `requirePermission()` from `src/lib/tenant-context.ts`.

---

## HARD RULES

> These rules are non-negotiable. Violating any of them is a bug.

### 1. Tenant scoping

Every DB read and write MUST be tenant-scoped. No raw query without `tenant_id`. Server functions use `requireTenant` middleware; direct `supabaseAdmin` calls must filter by `ctx.tenantId`.

Public tracking is the deliberate exception for unauthenticated customer lookup. Keep it narrow, do not expose tenant-wide data, and normalize/serialize only the fields the tracking UI needs.

### 2. Pricing rule immutability

Pricing rule versions are immutable. Never mutate an existing rule version. New pricing = new version row. Old quotes reference old versions; they must keep working.

### 3. Append-only logs

`notification_log`, `audit_log`, `internal_notes`, `production_photos`, and `tenant_audit_log` are append-only. Never UPDATE or DELETE rows from these tables.

### 4. No unjustified dependencies

No new dependency without justifying it in the PR description. Prefer stdlib, existing deps, or small inline utilities. The bundle is already large.

### 5. R2 key isolation

Every R2 object key for tenant-owned files MUST start with the tenant id:

```
<tenantId>/<entityType>/<entityId>/<hash>.<ext>
```

Use `generateObjectKey()` from `src/lib/r2.server.ts`; do not hand-roll key prefixes. R2 deletes should use `deleteObject()`, never Supabase Storage.

---

## Commands

| Command                       | What it does                                             |
| ----------------------------- | -------------------------------------------------------- |
| `npm run dev`                 | Start Vite dev server (port 8081)                        |
| `npm run build`               | Production build for Cloudflare Workers                  |
| `npm run build:dev`           | Development-mode build                                   |
| `npm run typecheck`           | Run `tsc --noEmit`                                       |
| `npm run lint`                | Run ESLint on all `**/*.{ts,tsx}`                        |
| `npm run test`                | Run Vitest test suite                                    |
| `npm run test:e2e`            | Run Playwright E2E tests                                 |
| `npm run format`              | Format with Prettier                                     |
| `node scripts/check-i18n.mjs` | Verify Arabic/French locale key coverage against English |

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

- Schema definitions: `src/db/schema.ts` (all Drizzle tables) + `src/db/tenancy-schema.ts` (tenants, members) + `src/db/schema-legacy.ts` (legacy_quote_items VIEW)
- Business tables defined via Supabase migrations in `supabase/migrations/`
- Drizzle client: `src/db/client.server.ts` (lazy singleton, `postgres` driver, auto-exports `schema`)
- All DB access through `supabaseAdmin` (service role) gated by auth + tenant middleware
- **T2.x CRUD security**: Catalog V2 and pricing lever CRUD functions use `context.supabase` (RLS-enforcing client), NOT `supabaseAdmin`. See `src/lib/catalog.functions.ts` (Catalog* CRUD), `src/lib/catalog-v2.functions.ts` (read fns), `src/lib/pricing-levers.functions.ts` (read fns).
- Supabase generated types are not present yet. The current `src/integrations/supabase/types.ts` is a permissive stub with `Row/Insert/Update/Relationships` shapes only.
- Avoid using the placeholder `Database` generic with `createClient()` in server/auth clients; it can break PostgREST inference.
- When reading nested Supabase joins, normalize relation fields defensively because PostgREST may return either an object or an array depending on relationship metadata.

### R2 / Uploads

- Use `src/lib/r2.functions.ts` for presigned browser uploads.
- Use `src/lib/r2.server.ts` for server-side R2 operations.
- Keep AWS SDK checksum settings at `WHEN_REQUIRED`; removing them can trigger R2 `InvalidChecksum` failures.
- Browser uploads should PUT directly to the presigned URL with `credentials: "omit"` and the file `Content-Type`.
- Do not upload files to Supabase Storage. R2 is the primary object store.
- Production photos and logos use tenant-prefixed keys; attachments are private by default and signed on demand.

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

Three engines coexist:

- **v1** (`src/lib/pricing.ts`): `calculateLine()` — fixed formula, used for backward compat
- **v2** (`src/lib/pricing/engine.ts`): `runFormula()` — configurable JSON DSL, used for new quotes
- **v3** (`src/lib/pricing/engine-v3.ts`): `priceQuote()` — **bottom-up hierarchy pricing** (T2.3, T20.2, T20.3). Pure function, no DB. Walks quotation_products → sections → units → components. Resolves component costs via `componentAmount()` (T3.3). Deterministic output: children sorted by id, all amounts through `round2()`. Aggregates upward. Applies global pricing factors + fees/credits. Server fn wrapper: `priceQuotationTree` in `quote.functions.ts`.

**Section Component Pricing Semantics (T20.3)**:
- **Strategy A (Direct consumption)**: For section-level components without an `areaFunctionKey` or with `areaFunctionKey === "direct"` (e.g. installation fee, shared accessory, discrete hardware, plinth clips, transport): $\text{baseCost} = \text{qty} \times \text{unitPrice}$.
- **Strategy C (Aggregated run dimensions)**: When a surface or length area function is assigned to a section component (e.g. continuous countertop, plinth kickboard, crown molding, edge band): dimensions are derived dynamically from child units:
  $$w_{\text{section}} = \sum_{i} (w_i \times q_i), \quad h_{\text{section}} = \max_i(h_i), \quad d_{\text{section}} = \max_i(d_i)$$
- **Zero Dummy Dimensions**: Arbitrary fallbacks (`1000 × 1000 × 600 mm`) are completely eliminated. If a section contains 0 units and has an area-based component, it triggers an explicit `pricing_required` status with computed amount $0.00\text{ EGP}$ and a clear guidance message.
- **Section Multiplier**: Section components support `multiplicationMode: "one_time" | "per_unit"`. When `"one_time"` (default), cost is calculated once per section. When `"per_unit"`, cost multiplies by $\sum \text{unit.qty}$ (e.g. shared installation per carcass).
- **Inheritance**: Units inherit Section defaults (`finishId`, `materialId`, `veneerId`) when unassigned. Unit-level explicit assignments always override Section defaults. Zero double-billing.

**Area functions** (`src/lib/pricing/areaFunctions.ts`): Typed registry of component types (cabinet_side, cabinet_top, cabinet_bottom, back_panel, shelf, door_panel, drawer_front, edge_band, direct). Pure functions converting mm dimensions → m² or linear meters.

**Pricing flow**: Component costs (`componentAmount()`) → Unit pricing (with factor overrides & inheritance) → Section (including shared components & multiplier) → Product → Quote (global factors + fees/credits).

### Test Suite (756 unit tests across 40 test suites + 23 E2E tests)

| File | Tests | Covers |
|---|---|---|
| `quotation-hierarchy.test.ts` | 21 | T2.0 hierarchy schema, migration structure, RLS patterns |
| `unitTypes.test.ts` | 30 | T2.1 unit types + BOM, CHECK constraints, RLS |
| `quoteSnapshots.test.ts` | 40 | T2.2 append-only trigger, RLS, multi-snapshot ordering |
| `legacyQuoteItems.test.ts` | 17 | Legacy VIEW mirrors quote_items |
| `catalog-v2.test.ts` | 37 | 8 catalog tables, CHECK constraints, RLS |
| `pricing-levers.test.ts` | 39 | 4 pricing lever tables, enums, RLS, seed data |
| `catalog-v2-crud.test.ts` | 38 | V2 CRUD schemas, spoofing guards, architecture audit |
| `tenant.isolation.test.ts` | 11 | Tenant middleware isolation |
| `pdf.font.test.tsx` | 1 | PDF generation |
| `transactional.test.ts` | 8 | Transactional schema exports |
| `pricing/engine.test.ts` | 1 | v2 engine smoke test |
| `pricing/engine-v3.test.ts` | 33 | v3 bottom-up engine (components, aggregation, factors, fees, determinism, golden-file, edge cases, board-yield, wastage precedence) |
| `pricing/areaFunctions.test.ts` | 38 | Area functions (8 types incl. edge_band, edge cases, property tests) |
| `pricing/bom.test.ts` | 24 | BOM resolution (unit type → component descriptors) |
| `pricing/componentAmount.test.ts` | 46 | Leaf-pricing (material m2/m/pcs/piece, hardware, accessory, manufacturing, edge_band, veneer, finish, board-yield, wastage) |
| `pricing/factors.test.ts` | 25 | FACTOR_ORDER (8 keys), VAT, discount clamping |
| `pricing/shadow.test.ts` | 14 | Shadow comparison (runs v3 engine, writes rows, tolerances) |
| `pricing/shadow-integration.test.ts` | 19 | Full shadow pipeline with realistic Egyptian furniture data |
| `pricing/spanCheck.test.ts` | 16 | Shelf deflection (7 materials, L/200 threshold) |
| `pricing/task20-catalog-pricing-architecture.test.ts` | 14 | Task 20: Catalog architecture, rate cards, board yield |
| `pricing/task20-2-section-unit-assignment.test.ts` | 17 | Task 20.2/20.3: Section & Unit Assignment, Strategy A & C, 0-unit safety, multiplicationMode, veneer inheritance |
| `pricing/v2-quotation-pricing-hardening.test.ts` | 19 | V2 pricing edge cases, factors, rounding, error handling |
| `hierarchy.test.ts` | 36 | Hierarchy CRUD server functions & tenant validation |
| `reports/margin.test.ts` | 32 | Margin report (pickVersion, computeSnapshotMargin) |
| `cost-analysis.test.ts` | 6 | Cost analysis categorization, section components, margin & markup |
| `v2-quotation-pipeline.test.ts` | 9 | End-to-end pipeline integration |
| `tasks.test.ts` | 26 | Task 21/21.1: Atomic counter sequence, concurrency safety, authoritative role matrix, bulk ops, workload |
| `crm.test.ts` | 23 | Task 22: CRM foundation, leads, opportunities, atomic sequence |
| `crm-quotation-integration.test.ts` | 10 | Task 24: CRM <-> V2 Quotation commercial sync & lost reason validation |
| `crm-sales-operations.test.ts` | 19 | Task 25: Sales team workload, follow-up control, activities, assignment |
| `project-workspace.test.ts` | 18 | Task 26: 13-stage lifecycle, 6 health indicators, multi-project isolation, RBAC masking, timeline |
| Other suites (13 suites) | 153 | Invoices, Deliveries, Inventory, Remakes, Customers, Work Orders, etc. |

**Total Unit Test Suite: 44 test files — 843/843 tests passing (2.70s)**

#### E2E Tests (Playwright)

| File | Tests | Covers |
|---|---|---|
| `e2e/builder.spec.ts` | 3 | Full tree build, catalog picker loads data + links component, empty-section validation |
| `e2e/v2-task20-realworld-validation.spec.ts` | 2 | Real-world UI builder lifecycle, PDF export, multi-qty, hardware swapping |
| `e2e/v2-quotation-pricing-hardening.spec.ts` | 1 | Hierarchy multiplier, live breakdown, dimension persistence |
| `e2e/v2-quotation-browser-validation.spec.ts` | 2 | Quotes list pagination, totals, and UI accessibility |
| `e2e/tasks-vertical-slice.spec.ts` | 1 | Task Management 2.0: KPIs, Tabs (Kanban/My Tasks/Workforce), 4 Columns, Form, Orders linkage |
| `e2e/project-workspace.spec.ts` | 2 | Task 26: Project Directory, Header, 13-Stage Stepper, 6 Health Indicators, 10 Tabs, Customer 360 link |
| Other E2E specs (9 specs) | 14 | Cost analysis, deliveries, customer 360, inventory, invoices, remakes, work-orders, etc. |
| **Total Playwright Suite** | **25** | **15 spec files — 25/25 passing** |

### Migrations

| Migration | Status | Description |
|---|---|---|
| `20260624_quotation_hierarchy.sql` | ✅ Applied | T2.0: 4 tables, 4 enums, CHECK, RLS (16 policies) |
| `20260624_unit_type_templates.sql` | ✅ Applied | T2.1: unit_types + unit_type_bom, CHECK, RLS |
| `20260624_quote_snapshots.sql` | ✅ Applied | T2.2: trigger + RLS |
| `20260624_legacy_quote_items_view.sql` | ✅ Applied | VIEW mirrors quote_items |
| `20260624_catalog_tables.sql` | ✅ Applied | 8 catalog tables, CHECK, RLS (32 policies) |
| `20260624_pricing_levers.sql` | ✅ Applied | 4 tables, 3 enums, RLS (16 policies), seed data |
| `20260625_pricing_shadow_runs.sql` | ✅ Applied | feature_flags + pricing_shadow_runs |
| `20260626_unit_finish_width_tier.sql` | ✅ Applied | width_tier enum + finish_id on units |
| `20260628_price_history.sql` | ✅ Applied | price_history table (append-only) |
| `20260628_add_edge_band_kind.sql` | ✅ Applied | edge_band enum value |
| `20260622_quote_created_template.sql` | ✅ Applied | quote_created WhatsApp templates |
| `20260622_seed_all_notification_templates.sql` | ✅ Applied | All 6 events × 3 languages |
| `20260622_drop_legacy_customer_policies.sql` | ✅ Applied | RLS fix for customers |
| `20260701_add_length_veneer_finish.sql` | ✅ Applied | Extends component_kind enum with veneer/finish; adds units.length_mm + units.dimension_unit (mm/m/m2) |
| `20260704_fix_finish_price_per_unit.sql` | ✅ Applied | catalog_finishes: replace modifier_type/modifier_value with price_per_unit |
| `20260718_fix_quotes_rls_insert.sql` | ✅ Applied | Quotes RLS: INSERT/UPDATE/DELETE policies via is_tenant_member (was missing, blocked V2 save) |
| `20260719_add_components_area_function_key.sql` | ✅ Applied | Adds area_function_key text column to components table (veneer/finish/edge_band surface pricing) |
| `20260719_add_sections_material_finish_veneer.sql` | ✅ Applied | Adds material_id, finish_id, veneer_id nullable FK columns to sections table |
| `20260719_catalog_edge_bands.sql` | ✅ Applied | Dedicated catalog_edge_bands table (code, price_per_unit) with RLS. Edge bands no longer share catalog_materials |
| `20260910_section_components_and_kinds.sql` | 🟡 LOCAL ONLY | Section-level components (`section_id` FK on components, mutually exclusive with unit_id via CHECK) + `multiplication_mode` column. *Note: Server functions maintain non-breaking fallbacks so the app operates safely whether or not this migration is executed on the remote database.* |
| `20260912_task_management_v2.sql` | 🟡 LOCAL ONLY | Task Management 2.0 operational execution schema: adds `work_order_id`, `remake_id`, `delivery_id`, `review_notes`, `reviewed_by`, `returned_at` to `tasks`. *Server functions maintain backward-compatible queries with error code fallbacks if remote DB columns are missing.* |

### Task 21 Architecture: Task Management 2.0 (Workforce Execution System)

PeleCanon Task Management 2.0 transforms native tasks into a bidirectional operational execution workflow between shop-floor workers and supervisors:

1. **Role-based Lifecycle & Review Gate**:
   - Worker: `not_started -> in_progress -> waiting_review`. Direct completion or cancellation is strictly prohibited.
   - Supervisor / Manager: `waiting_review -> completed` (approve) or `waiting_review -> in_progress` (return with mandatory corrective review notes).
2. **Workforce Workload Visibility**:
   - Aggregated metrics per member: Open Tasks, Critical Tasks, Overdue Tasks, Waiting Review, Completed Today.
   - Workload indicators: Available (0), Light (1-2), Moderate (3-5), Heavy (>5).
3. **Worker Focus View ("My Tasks")**:
   - Dedicated bucketed view: Overdue, Today, Upcoming, Waiting Review, Completed.
   - Quick one-click execution actions (Start Work, Submit for Review).
4. **Context Linking**:
   - Direct entity relationships to Orders (`orderId`), Work Orders (`workOrderId`), Remakes (`remakeId`), Deliveries (`deliveryId`), Quotes (`quoteId`), and Customers (`customerId`).
5. **Evidence & Communication**:
   - Private R2 signed attachments (`AttachmentUploader`, `AttachmentList` with `entityType: "task"`).
   - Internal notes / comments for supervisor-worker dialogue (`InternalNotes`).
6. **Bulk Operations**:
   - Multi-task selection bar for assigning workers, setting priorities, updating due dates, or marking completed with confirmation.

### Task 21.1 Concurrency & Authorization Integrity Architecture

1. **Atomic Sequence Numbering via `tenant_counters`**:
   - Task codes (`TSK-1001`, `TSK-1002`, etc.) are generated using PostgreSQL row-level lock upsert (`ON CONFLICT (tenant_id, counter_type) DO UPDATE SET last_value = tenant_counters.last_value + 1 RETURNING last_value`).
   - Completely eliminates race conditions and duplicate codes under high-concurrency requests.
   - Tested and verified under 25 simultaneous concurrent requests per tenant with contiguous monotonicity and strict cross-tenant isolation.
2. **Authoritative Role Model Mapping**:
   - Strictly enforces PeleCanon's 5 built-in roles (`owner`, `admin`, `sales`, `worker`, `viewer`) without inventing an ad-hoc or parallel "supervisor" role.
   - Operational supervision and review inspection are mapped directly to `admin` and `owner`.
   - Worker actions are strictly scoped to assigned tasks, with direct completion or cancellation prevented server-side.
   - Return for changes requires mandatory non-empty review notes.

### Task 22 Architecture: CRM Foundation (Commercial Operating System)

PeleCanon CRM transforms the platform into an end-to-end commercial operating system for furniture manufacturers and interior contracting firms:

1. **Commercial Pipeline Architecture (`Lead -> Customer -> Opportunity -> Sales Pipeline -> Next Action -> Quotation`)**:
   - **Lead Intake**: Omnichannel capturing across WhatsApp, Facebook, Instagram, Website, Referral, Walk-in, Exhibition, Existing Customer, and Other.
   - **Customer Deduplication**: On conversion, normalizes Egyptian phone numbers (`+20`, `0020`, leading `0` stripped to match digits) and case-insensitive emails. Reuses existing customer records or atomically provisions a new customer record.
   - **Authoritative Integrity**: Leverages native `customers`, `quotes`, `orders`, and `tasks` tables without creating parallel databases. Quotes and tasks reference `opportunity_id` cleanly.
2. **Atomic Numbering (`LED-XXXX` & `OPP-XXXX`)**:
   - Atomic per-tenant sequence numbers using `tenant_counters` with single-statement upsert (`ON CONFLICT (tenant_id, counter_type) DO UPDATE SET last_value = tenant_counters.last_value + 1 RETURNING last_value`).
   - Verified under concurrent load with zero duplicates, tenant isolation, and transactional safety.
3. **9-Stage Commercial Sales Pipeline**:
   - Stages: `new_lead` -> `contacted` -> `qualified` -> `site_visit` -> `design_measurement` -> `quotation` -> `negotiation` -> `won` -> `lost`.
   - Complete state decoupling: CRM commercial stage is independent of quotation document state (`draft`, `sent`, `accepted`). Moving to `won` or `lost` automatically updates opportunity status.
4. **Mandatory Next Action Discipline**:
   - Every active deal tracks `next_action` (concrete step) and `next_action_date` (commitment target).
   - Any open opportunity missing a next action or with an overdue date triggers high-visibility attention warnings on the Kanban board and the top-level CRM Stats Attention KPI card.
5. **Interactive UI & 360 Ecosystem**:
   - `/admin/crm`: Top financial & activity KPI cards, bilingual Kanban board with stage totals, filterable data tables for All Deals, My Deals, and Leads.
   - Opportunity Detail Drawer: Customer profile card, one-click WhatsApp outreach, direct `+ Create Quote` deep link prefilling customer and opportunity IDs into the quotation configurator, and linked quote/order/task history.
   - Customer 360: Embedded "Opportunities" tab reflecting commercial pipeline velocity and active deals per customer.
### TASK 23 — PeleCanon Customer 360 v2: Unified Customer, Projects, Commercial, Operations & After-Sales Workspace
1. **Core Philosophy**:
   - Single customer workspace answering the 10 foundational managerial questions:
     1. *Who is the customer?* (Contact details, location, customer tier/code)
     2. *What projects do they have?* (Project-centric lifecycle: Customer → Projects/Opportunities → Quotes → Orders → Production → Delivery → After-Sales)
     3. *What are they buying?* (Project types, unit configurations, scopes)
     4. *What was quoted?* (Total quoted amount, quotes generated, status breakdown)
     5. *What was accepted?* (Accepted quotes count and monetary total)
     6. *What has been paid?* (Invoiced total, collected amount, outstanding balance, payment collection rate %)
     7. *What is in production?* (Active orders, shop-floor work orders, manufacturing stages)
     8. *What has been delivered?* (Delivery handovers, installation progress, proof-of-delivery signatures)
     9. *What problems exist?* (Active remake cases, quality defects, overdue operational tasks)
     10. *What should happen next?* (Next action text, next action target date, earliest upcoming task due)
2. **Project-Centric Structure**:
   - Customer → Projects/Opportunities → Quotes → Orders → Production Work Orders → Deliveries → After-Sales Remakes.
   - Handles multi-project customers cleanly with separate lifecycle progression per project.
   - Synthesizes legacy or unassigned quotes/orders into a "Direct Commercial Orders & Quotes" project to preserve 100% data fidelity without orphaned entities.
3. **11 Workspace Sections**:
   - `overview`: 10-Question Diagnostic Executive Grid, High-Priority Next Actions banner, Problems Warning banner, Active Projects snapshot, Recent Activities feed.
   - `projects`: Project-centric lifecycle cards with status badges (Quote, Order, Production, Delivery), project values, balances, and expandable entity inspector.
   - `opportunities`: Commercial deals table with stage, value, close date, next action, sales owner, and "+ New Deal" action.
   - `quotes`: Complete quotation history with status badges, linked orders, and PDF download.
   - `orders`: Production orders list with manufacturing stages, total, paid, balance, and expected delivery date.
   - `financials`: Total invoiced, collected, balance due, open invoices table with PDF download and inline payment recording, and a complete recent payments ledger (date, amount, method, reference, notes).
   - `tasks`: Pre-sales, operational, and QC tasks table with overdue badges, priorities, assignees, and quick "+ Add Task" button.
   - `production`: Workshop work orders list with order linkage, status, priority, and dates.
   - `deliveries`: Delivery and installation handovers with addresses, recipients, installers, and signature verification.
   - `quality`: Remakes & warranty cases with defect reasons, descriptions, severities, resolutions, and "+ Report Defect" button.
   - `timeline`: Chronological unified activity timeline (bounded to 50 items) combining all operational events and audit log entries.
4. **Quick Action Workflows**:
   - `+ New Project`: Launches `OpportunityFormModal` pre-filled with `defaultCustomerId`.
   - `+ New Quote`: Direct link to commercial quotation builder (`/admin/quotes/new?customerId=...`).
   - `+ New Task`: Launches `TaskForm` pre-filled with `defaultCustomerId`.
   - `+ Record Payment`: Launches `RecordPaymentModal` for open invoices.
   - `+ Log Quality / Warranty Case`: Launches `CreateRemakeModal` with customer's orders pre-populated.
   - `WhatsApp`: Direct one-click chat initiation.
5. **Permissions & Data Masking**:
   - `worker`: Financial balances, totals, invoice rows, payments, and project values are securely masked to 0 on the server; financial actions are hidden.
   - `viewer`: Read-only mode across all sections without mutation buttons.
   - `admin`, `owner`, `sales`: Full operational and commercial visibility and action execution.

---

### Task 24: CRM ↔ V2 Quotation Commercial Integration

1. **Commercial Flow Architecture**:
   - `Opportunity → Create Quote → Quote Draft → Quote Sent → Follow-up → Negotiation → Accepted → Won → Order`.
   - **Authority Separation**: Quotations remain 100% authoritative for pricing, BOM, and frozen calculation snapshots. CRM Opportunities remain authoritative for deal stage, commercial pipeline velocity, sales ownership, and customer relationship history.
2. **Bidirectional Context & Navigation**:
   - Commercial Quotation Builder (`/admin/quotes/new`) accepts `?opportunityId=...` & `?customerId=...` (legacy `/admin/quotes/configurator` redirects seamlessly to `/admin/quotes/new` preserving query params).
   - Linked opportunity contextual banner displayed on top of the builder with deal code, title, stage, and quick link back to CRM.
   - Quotation List (`/admin/quotes`) exposes linked opportunity badge (`OPP-xxxx`) and assigned sales representative.
   - Quotation Detail (`/admin/quotes/$id`) exposes a dedicated **Commercial Context Card** (`getQuoteCommercialContext`) displaying Opportunity Number, Deal Title, Pipeline Stage badge, Sales Owner, and a direct "View in CRM" button.
3. **Deterministic Synchronization Rules**:
   - **Draft / Created**: If opportunity is in early stages (`new_lead`, `contacted`, `qualified`, `site_visit`), advances to `design_measurement` and synchronizes estimated `value`. Does not regress negotiation.
   - **Quote Sent**: Sets stage to `quotation` (or preserves `negotiation`), updates value, schedules an atomic sequential follow-up task (`TSK-xxxx`, category `crm_follow_up`) due in 3 days, and updates opportunity `nextAction` and `nextActionDate`. Logs `quote_sent_sync` to `audit_log`.
   - **Quote Accepted**: Moves opportunity stage to `won`, status to `won`, sets value to quote total, clears `lostReason`, and updates `nextAction` to contract kickoff. Logs `opportunity_won` to `audit_log`.
   - **Quote Rejected**: Moves opportunity stage to `negotiation` (does NOT mark as lost), creates follow-up task to review objections/revisions, and updates `nextAction`.
   - **Transactional Order Conversion**: When `convertQuoteToOrder` executes, if linked opportunity is present, it atomically marks the opportunity `won` within the single DB transaction.
4. **Mandatory Lost Reason Validation**:
   - Enforces 6 authoritative CRM lost reasons (`price`, `timing`, `competitor`, `customer_cancelled`, `no_response`, `other`).
   - Moving an opportunity to `lost` stage strictly requires a valid non-empty `lostReason` validated via Zod schema and server function guards, with interactive UI modal prompts on both Kanban and Drawer views.
5. **Historical Immutability & Project Isolation**:
   - Commercial follow-up, negotiation notes, and next actions do not mutate historical frozen quotation snapshots (`quote_snapshots`).
   - Customer 360 and Opportunity Detail drawer strictly scope quotations, orders, and follow-up tasks to the specific opportunity ID, preventing cross-project leakage for multi-property clients.

---

### Task 25: Sales Team & Follow-Up Operations

1. **Practical Sales Management Workspace (`/admin/crm/sales`)**:
   - Single dedicated operational cockpit for Owner, Admin, and Salesperson to monitor team capacity, track deal velocity, and manage commercial follow-ups without inventing a secondary employee system.
   - Built on existing workforce and user architecture: `app_users`, `tenant_members`, `tasks`, `task_assignees`, `opportunities`, `leads`, `quotes`, and `audit_log`.
2. **Team Workload & Capacity Matrix**:
   - Real-time aggregation per salesperson plus an `Unassigned` bucket: active leads, open opportunities, pipeline value, quotes count/value, overdue follow-ups, activities due today, no-next-action count, won count/value, lost count/value.
   - Algorithmic capacity indicator badges: `Low` (<=3 deals), `Balanced` (4-8 deals), `Heavy` (9-15 deals), and `Overloaded` (>15 deals or >5 overdue follow-ups).
3. **"My Sales" Dedicated Rep Slice**:
   - Tailored personal view for individual sales representatives (and selectable by managers for any team member): My Deals, My Leads, My Follow-Ups, My Quotes, and My Overdue Actions.
   - Displays rep-specific KPI cards (My Open Deals, My Pipeline Value, My Active Leads, My Quotes, My Overdue Actions).
4. **Follow-Up Control & Attention Items**:
   - Surfaces high-priority actionable alerts across the commercial pipeline:
     - `overdue`: Opportunities with `nextActionDate < today`.
     - `due_today`: Follow-ups scheduled for today.
     - `no_next_action`: Active deals missing a scheduled next step (escalated to critical for `negotiation` stage).
     - `quote_without_followup`: Quotations sent without an active scheduled follow-up.
     - `negotiation_without_next_action`: In-flight negotiations requiring urgent contact.
5. **Lightweight Auditable Activities**:
   - Standardized 7 activity touchpoints: `call`, `whatsapp`, `email`, `site_visit`, `meeting`, `quote_follow_up`, `other`.
   - Logging an activity captures notes/outcome, optionally completes linked follow-up tasks in `tasks`, schedules next action + date on lead/opportunity, and logs `crm_activity_completed` to `audit_log`.
6. **Assignment, Reassignment & Bulk Operations**:
   - Owner/Admin can assign, reassign, or unassign individual leads/opportunities or bulk-assign multiple selected records in a single batch.
   - Auditable logging: records `entity_assigned` and `bulk_entity_assigned` events with actor ID, previous owner, and new owner in `audit_log`.
7. **Strict Security, RBAC & Tenant Isolation**:
   - `worker` role receives 403 Forbidden on server functions.
   - `viewer` has read-only visibility without assignment or activity mutation capabilities.
   - Bounded queries (limits 1000-2000) prevent N+1 query explosions and unbounded memory footprint.
   - All database queries and mutations strictly filter on `tenant_id`.

---

### Task 26 Architecture: Project / Job Workspace (PeleCanon Unified Operations Orchestrator)

1. **Core Philosophy & Architectural Role**:
   - Single unified cockpit (`/admin/projects` and `/admin/projects/$id`) bringing together the complete customer project lifecycle without creating a parallel task or production system.
   - **Pure Orchestration Layer**: Preserves authoritative records and state machines across all existing modules (`opportunities`, `quotes`, `orders`, `production_work_orders`, `stock_allocations`, `delivery_handovers`, `invoices`, `customer_payments`, `remakes`, `tasks`, `attachments`, `audit_log`).
   - Unifies commercial, manufacturing, installation, and financial reality under one single project surface.

2. **13-Stage Project Lifecycle Stepper**:
   - Deterministic progression mapping:
     `Lead → Opportunity → Measurement → Design → Quote → Won → Order → Production → QC → Delivery → Installation → Handover → Warranty`.
   - Pure derivation engine (`deriveProjectLifecycle` in `src/lib/project.functions.ts`) inspects the actual operational state:
     - `lead` / `opportunity`: early discovery and qualification.
     - `measurement` / `design`: opportunity stage `design_measurement` or `site_visit`.
     - `quote`: active quotations created in `draft` or `sent`.
     - `won`: quotation accepted or opportunity won.
     - `order`: order record booked.
     - `production`: work orders in progress or order stage in `cutting`/`assembly`/`in_production`.
     - `qc`: work orders in `qc_pending` or order in `quality_check`.
     - `delivery`: handovers in dispatch/transit or order in `ready_for_delivery`.
     - `installation`: handover in `installation_pending` or `installed`.
     - `handover`: delivery marked `completed`.
     - `warranty`: delivery completed and order stage in `warranty` / completed.

3. **6 Transparent Health Indicators (No Artificial Scoring)**:
   - Evaluates factual operational health into 4 severity levels (`good`, `neutral`, `warning`, `critical`):
     1. **Commercial Health**: Won/Accepted (`good`), In Negotiation/Sent (`warning`), Draft/Discovery (`neutral`), Lost with reason (`critical`).
     2. **Production Health**: All work orders complete (`good`), QC inspection pending (`warning`), work orders active (`good`), no work orders (`neutral`).
     3. **Inventory Readiness**: Consumed/Reserved stock (`good`), unreserved order (`warning`), BOM in quote (`neutral`).
     4. **Quality & QC**: Zero active defects (`good`), unresolved remake requests (`critical` with defect reason).
     5. **Delivery & Installation**: Handover signed / delivered (`good`), transit / installation in progress (`warning`), delivery failed (`critical`).
     6. **Financial Ledger**: Fully collected (`good`), partially collected (`warning` with outstanding amount), uncollected overdue (`critical`).

4. **10 Specialized Workspace Tabs**:
   - `overview`: 6 diagnostic status cards, KPI summary strip (Project Value, Invoiced, Collected, Balance Due, Active Work Orders, Remakes), and 3 quick actions (Add Task, Record Payment, Report Defect).
   - `commercial`: Commercial deal parameters, linked quotes with approval/sent statuses, and direct deep link to the commercial quotation builder (`/admin/quotes/new?opportunityId=...`).
   - `production`: Workshop work orders with priority badges, status, scheduled/completion dates, and order linkage.
   - `tasks`: Project-scoped operational and pre-sales tasks with assignee chips, priority indicators, overdue warnings, and "+ New Task" trigger.
   - `inventory`: Material readiness overview, bill of materials allocations, reserved quantities, and warehouse issue status.
   - `delivery`: Logistics and site installation handovers, recipient info, scheduled dates, and digital proof-of-delivery signatures.
   - `financials`: Invoicing vs collection summary, customer invoices ledger, and payment receipts.
   - `quality`: Quality control cases and remake tickets with severity, reason, description, and "+ Report Defect" trigger.
   - `documents`: Private R2 signed attachments (`entityType: "project" | "opportunity"`), supporting multi-file upload, secure download URLs, and delete actions.
   - `timeline`: Chronological unified audit feed (bounded to 100 entries) aggregating commercial, production, logistics, task, and payment events.

5. **Security, RBAC & Multi-Project Isolation**:
   - **Worker Role Data Masking**: Server-side masking sets `totalValue`, `invoicedAmount`, `paidAmount`, `outstandingBalance`, `invoices`, and `payments` to 0/empty arrays for users with `role: "worker"`.
   - **Multi-Project Isolation**: Multiple independent projects for the same customer maintain separate commercial scopes, quotes, orders, and timelines without entity crosstalk.
   - **Tenant Scoping & Backward Compatibility**: All database queries enforce `tenant_id` equality check with schema-fallback queries for environments where optional CRM tables are absent.

---

### Task 27 Architecture: After-Sales CRM (Warranty, Complaints, Service & Repeat Business)

1. **Core Philosophy & Architectural Role**:
   - Extends the commercial and operational CRM lifecycle beyond delivery:
     `Delivered → Handover → Warranty → Complaint → Service / Remake → Resolution → Customer Retention → New Opportunity`.
   - Single dedicated cockpit at `/admin/crm/after-sales` with multi-entity drawer `/components/after-sales/ServiceCaseDetailDrawer.tsx` and modal `/components/after-sales/CreateServiceCaseModal.tsx`.
   - Integrates Customer 360, Tasks, Remakes, Delivery Handovers, and Orders without duplicating quality, task, or workforce systems.

2. **Lightweight `service_cases` Entity**:
   - Sequential case numbering: `CAS-XXXX` via atomic tenant counter.
   - Types: `warranty`, `complaint`, `service`, `maintenance`, `other`.
   - Priority levels: `low`, `medium`, `high`, `critical`.
   - 7-Stage Workflow:
     `new → under_review → assigned → in_progress → waiting_customer → resolved → closed`.
     Supports reopening (`resolved → in_progress` or `closed → in_progress`).
   - Fields: `customerId`, `orderId`, `projectId`, `remakeId`, `deliveryId`, `taskId`, `assignedTo`, `dueDate`, `resolution`, `resolvedAt`, `closedAt`, `attachments`.

3. **Authoritative Warranty Diagnostic Rules**:
   - **Zero Speculation Rule**: Never guess or invent global legal warranty periods.
   - **Phrase-Scoped Duration Parser (`parseWarrantyMonths`)**:
     - Extracts explicit duration from order/contract notes (e.g., `warranty: 12 months`, `ضمان: 24 شهر`, `ضمان 3 سنوات`).
     - Rejects unrelated years and timestamps (e.g., `سنة 2026`) from corrupting durations.
   - **Start Date Determination**: Prioritizes signed customer handover (`handedOverAt`), falls back to dispatch date (`deliveredAt`), and contract date.
   - **Indeterminate Fallback**: If duration or handover date cannot be established reliably, strictly returns `"Warranty Period Unknown"` (`"فترة الضمان غير محددة"`) with `isReliable: false`.

4. **Cross-System Operational Integrations**:
   - **Operational Tasks Bridge**: Cases can spawn native tasks (`TSK-XXXX`) in the task board for field inspections (e.g., "Inspect misaligned cabinet hinge").
   - **Shop Floor Remakes Bridge**: When physical re-manufacturing is required, creates a native remake ticket (`RMK-XXXX`) linked to the order and case without duplicate quality pipelines.
   - **Private R2 Evidence Attachments**: Signed URLs with 1-hour expiration for inspection photos, defect documentation, and handover signoffs (`entityType: "service_case"`).
   - **Repeat Business Generation**: Provides "Create New Opportunity" for customers with completed historical projects, generating a new deal (`source: "existing_customer"`) without modifying historical quotes, orders, or warranties.

5. **Customer 360 v2 Integration**:
   - Enriched Customer 360 profile displays Open Cases count, Active Warranties, Resolved Cases, Complaints, and Remakes.
   - Highlights recent delivery and handover signoffs.
   - Surface Repeat Deal trigger when historical projects are completed.

6. **Role Authorization Matrix**:
   - `owner` / `admin`: Full administrative control across creation, status transitions, resolution, and reassignment.
   - `sales`: Can create cases, execute workflow transitions, create inspection tasks, trigger remakes, and spawn repeat opportunities. Cannot reassign cases between team members.
   - `worker` / `viewer`: Read-only access (`view`).

---

### Task 28 Architecture: CRM Intelligence & Commercial Analytics

1. **Core Philosophy & Architectural Role**:
   - High-performance, server-side commercial intelligence cockpit at `/admin/crm/analytics`.
   - **Zero Fake Forecasting Rule**: Strictly excludes machine learning, AI closing probability, or speculative expected revenue. Aggregates actual documented historical and transactional records only.
   - **Zero Subjective Ranking**: Eliminates "best/worst" salesperson rankings; delivers objective, factual metrics (leads assigned, deals won/lost, pipeline value, quotes).

2. **5 Flexible Time Windows (`resolveDateRange`)**:
   - `Today`: Midnight to 23:59:59 of current day.
   - `This Week`: Sunday to Saturday Egyptian standard week boundary.
   - `This Month`: First day 00:00:00 to last day 23:59:59 of current month.
   - `This Quarter`: Calendar quarter boundaries (Q1-Q4).
   - `Custom Range`: Explicit start and end date bounds without timezone drift.

3. **8 Analytical Dimensions**:
   - **Summary KPIs**: Total Leads, Lead Conversion %, Active Pipeline Value, Deals Won (Count & Value), Win Rate %, Quote Conversion %, Repeat Customer Rate %, Open After-Sales Cases.
   - **Lead Acquisition Channels**: Multi-touch table mapping sources (`whatsapp`, `facebook`, `instagram`, `website`, `referral`, `walk_in`, `exhibition`, `existing_customer`, `other`) to lead volume, qualified prospects, opportunities, won deals, lost deals, and conversion rates.
   - **9-Stage Sales Pipeline Distribution**: Analyzes volume and monetary value across all 9 stages (`new_lead` through `won`/`lost`) with stalled deal detection (deals missing next actions or with overdue next actions).
   - **Quotation Performance Funnel**: Tracks Draft, Sent, Accepted, Rejected quotes, conversion rate, and sent acceptance rate.
   - **Deal Loss Reasons Distribution**: Objective distribution of actual recorded loss reasons (`price`, `timing`, `competitor`, `customer_cancelled`, `no_response`, `other`, `unspecified`) without inferring or guessing.
   - **Sales Team Commercial Activity**: Factual rep workload, open pipeline, deals won/lost, quotes generated, and win rate.
   - **Customer Retention & Repeat Business**: New vs returning customer accounts, repeat customer rate, active vs completed production projects.
   - **After-Sales & Quality Feedback**: Open cases, warranty claims, complaints, maintenance requests, and workshop rework tickets.

4. **Security, RBAC & Tenant Scoping**:
   - **Worker Role Isolation**: `role === "worker"` receives HTTP 403 Forbidden.
   - **Tenant Scoping**: All queries enforce strict `tenant_id` filtering with schema fallback handling.
   - **Owner / Admin**: Full tenant-wide commercial intelligence.
   - **Viewer**: Read-only analytics access.

---

### Task — PeleCanon Commercial Quotation Restoration & Shaheen PDF Replication

1. **Client Requirement & Context**:
   - The client rejected generic accounting invoices and deep factory BOM tables listing raw screws, hinges, and cut edge-bands for high-end residential sales presentations.
   - The client mandates the clean, prestigious presentation exemplified by the reference document `"Mr. Shaheen Q.pdf"` (`Pelecanon Quotation Sample.pdf`).
   - Clean, customer-facing quotation presentation highlighting finished commercial products (Door, Library, Buffet, Cladding, Kitchen, Dressing, TV Unit, Custom), design renderings, clear technical specs (wood core, HPL/melamine brands, European hardware), line totals, 30-day delivery timeline, 5-year warranty, and 60%/30%/10% contract payment milestones.

2. **Unified Architecture & Backward Compatibility**:
   - Maintains a single, coherent quotation entity in `quotes` and `quote_items`.
   - Authoritative commercial totals (`subtotal`, `discount_amount`, `vat_amount`, `total`, `deposit_pct`) stored directly in `quotes` columns.
   - Frozen immutable snapshot (`quotes.snapshot`) stores `quotationMode: "commercial"` with `lines` and `terms`.
   - Seamlessly converts via `convertQuoteToOrder` into manufacturing orders, invoices, payments, CRM opportunities, and cost analysis without schema bifurcations or duplicate tables.
   - Preserves V2 manufacturing quotations (`quotation_products` hierarchy) when `quotationMode !== "commercial"`.

3. **PDF Replication (`ShaheenQuotationPdf`)**:
   - Solid top green accent bar (`#008269`) flush edge-to-edge.
   - Centered PeleCanon logo with cyan tagline `"Creativity Credibility"`.
   - Bilingual document title: `عرض سعر منتجات - Products Quotation`.
   - Customer greeting row: `إلى السيد : مستر شاهين` (RTL) | `رقم العرض: PLC-XXXXX`.
   - 4-Column Table: `البند` (14%), `العدد` (10%), `التصميم` (30%), `المواصفات الفنية` (46%).
   - Item unit price callout row: `سعر الباب الواحد : 19,400 ج.م.` with automatic Arabic definite article (`formatCategorySinglePrice`).
   - Totals row: `السعر الإجمالي : ...` | `السعر بعد الخصم : ...`.
   - Commercial contract terms: Notes (`ملاحظات:`), Payment Schedule (`شروط التعاقد والدفع:` 60%/30%/10%), and cursive `thank you` script signature (`docs/thank-you-brand.png`).
   - Full-bleed fixed bottom footer (`#008269`) with phone `+20 11 16322271` and Cairo/Alex addresses.

4. **Commercial Quotation Builder (`/admin/quotes/new`), Settings & Detail (`/admin/quotes/$id`)**:
   - First-class commercial quote builder: starts with an unselected category prompt with placeholder `Select product category / اختر نوع المنتج` (no silent preselection of Kitchen, Door, etc.). Upon category selection, the card reveals dimensions, multiline specifications with template seeding, and commercial pricing. Appending items via `+ Add Item` (`+ إضافة بند`) appends a clean line requiring explicit category selection.
   - Dynamic & Configurable Categories: loaded from tenant settings (`listCommercialCategories`), managed via `/admin/settings` (`تصنيفات المقايسات` tab) with active toggles, bilingual Arabic/English names, default dimension units (`m`, `cm`, `mm`), and default pricing units (`set`, `m`, `m²`, `pcs`, `lot`).
   - Clean `+ إضافة بند جديد` (`+ Add Item`) workflow with quick category picker.
   - Independent dimension units (`mm`, `cm`, `m`) separate from commercial pricing units, with decimal support.
   - Pricing input without silent zero substitution: supports commercial lump-sum pricing (qty = 1) and unit pricing (qty > 1). Requires positive price on save.
   - Dual-mode discount: supports fixed Amount (EGP) and Percentage (%), with discount code.
   - In-builder live **Quotation Preview Dialog** (`معاينة عرض السعر`): renders full Shaheen 4-column layout, customer info, item thumbnails, specs, and contract milestones directly in modal prior to saving or PDF export.
   - Draft persistence & reload: every entered dimension, unit, specification, price, discount, and term is preserved and reloaded cleanly.
   - Detail page renders Shaheen 4-column card view, image thumbnail, technical specs block, contract terms card, and provides an "Edit Quote" (`تعديل عرض السعر`) button for drafts.
   - Quotation List (`/admin/quotes`) features a single primary action: "New Quotation" (`عرض سعر جديد`) pointing to `/admin/quotes/new`. The legacy Manufacturing V2 creation button has been permanently retired.

5. **Legacy Quotation Configurator Retirement & Single Commercial Workflow Establishment**:
   - The commercial quotation builder at `/admin/quotes/new` is the **only supported workflow** for creating new quotations.
   - The legacy configurator route at `src/routes/admin/quotes/configurator.tsx` is permanently retired and executes a TanStack Router `redirect` in `beforeLoad` to `/admin/quotes/new`, preserving all query parameters (`customerId`, `opportunityId`, `rfq`, `quoteId`).
   - All alternative creation buttons, links, and entry points across the app (Quotation List header, Admin Dashboard quick actions, Customer 360 drawer, Opportunity drawer, Project overview & commercial tabs, My Sales workspace, Admin sidebar) now point exclusively to `/admin/quotes/new`.
   - Historical V2 quotations remain fully viewable in read-only mode in `/admin/quotes/$id` via `TreeConfigurator` and `QuoteCatalogSummary` without data loss or changes to database records.
   - Downstream operations (quote-to-order conversions, invoice ledgers, payments, BOMs, inventory stock allocations, work orders, remakes, deliveries) and CRM synchronization remain 100% intact and unaffected.

---

Project Context Management

AGENTS.md is the primary source of truth for project context.

At the start of every task:

- Read and consider AGENTS.md.
- Validate that the current project state matches AGENTS.md.
- Detect context drift.
- Identify outdated architecture, business, infrastructure, workflow, or product information.

If context drift is detected, provide:

## AGENTS.md Update Required

Reason:
Why the documentation is no longer accurate.

Affected Sections:
Which sections require updates.

Recommended Changes:
What should be changed.

Maintaining AGENTS.md is part of the task.

Documentation debt is considered technical debt.

As CTO and Technical Co-Founder, you are responsible for preserving project knowledge and ensuring AGENTS.md remains synchronized with the actual state of the project.
