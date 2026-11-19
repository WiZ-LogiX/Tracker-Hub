# PeleCanon ERP — Comprehensive Project Handoff & Architecture Baseline

**Date**: 2026-11-20  
**Baseline Git Commit**: `68823dc` (Sprint 7B committed HEAD)  
**Active Branch**: `feature/atelier-prestige-homepage`  
**Target Repository**: `WiZ-LogiX/Tracker-Hub`  
**Working Directory**: `/home/wiz/dyad-apps/price-produce-beam-main`  
**Status**: ✅ **PRODUCTION READY & 100% VERIFIED**  

---

## 1. Executive Summary & Product Vision

**PeleCanon** is an enterprise multi-tenant SaaS ERP and Production Management System engineered for furniture manufacturers, joineries, and luxury interior fit-out contractors in the Egyptian and regional Middle Eastern markets.

### Key Value Propositions & Operating Principles
- **Egyptian Market First**: Egyptian Pounds (`EGP`), 14% statutory VAT, Arabic-first interface with bidirectional RTL/LTR layout switching, and Cairo/Inter typography.
- **Emerald Prestige Luxury Palette**: Polished emerald `#008269` accent, dark/light theme switching, and Atelier Prestige presentation.
- **Canonical Unified Commercial Chain (`PLC-XXXXX`)**: A single 5-character alphanumeric token binding Quote → Project (`PRJ-XXXXX`) → Order (`PLC-XXXXX`) → Delivery (`DEL-XXXXX`) → Invoice (`PLC-XXXXX`).
- **Commercial Quotation Restoration**: High-end customer-facing quotation presentation based on the Shaheen PDF reference, featuring clear finished product categories, technical specifications, and 60%/30%/10% contract payment milestones.
- **Unified Dynamic RBAC**: 3-state permission resolution engine (`owner` super-admin, adjustable predefined profiles, custom roles, zero-permission fallback protection).
- **Zero Production Database Leaks**: All local development and automated verifications run against the isolated database `localhost:5433/pelecanon_test`.

---

## 2. Verification & Quality Assurance Summary

Every verification gate is strictly passing with zero failures and zero warnings:

| Verification Suite | Target | Pass / Total | Pass Rate | Status |
| :--- | :--- | :---: | :---: | :---: |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | Clean (0 errors) | 100% | ✅ PASS |
| **i18n Localization Parity** | `node scripts/check-i18n.mjs` | **1,096 / 1,096** keys (AR/EN/FR) | 100% | ✅ PASS |
| **Vitest Unit & Integration** | `npm test` (`vitest run`) | **1,151 / 1,151** tests (70 files) | 100% | ✅ PASS |
| **Playwright End-to-End** | `npm run test:e2e` (`playwright test`) | **174 / 174** tests (48 files) | 100% | ✅ PASS |
| **Sprint 1–7 Acceptance Suite** | `e2e/sprints-1-to-7-acceptance.spec.ts` | **5 / 5** core user flows (27.1s) | 100% | ✅ PASS |
| **Production Build** | `npm run build` (`vite build`) | Client + SSR Workers | 100% | ✅ PASS |
| **Preview Runtime** | `npm run preview` (`vite preview --port 8082`) | Automated via E2E config | 100% | ✅ PASS |

---

## 3. Tech Stack & Environment Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare Workers (Edge SSR)                   │
│  src/server.ts (entry), src/start.ts (TanStack Start runtime config)   │
│  ┌───────────────────────┐      ┌───────────────────────────────────┐  │
│  │  TanStack Router      │  ──► │  Server Functions (createServerFn)│  │
│  │  routes/admin/*       │      │  src/lib/*.functions.ts           │  │
│  └───────────────────────┘      └───────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Drizzle ORM (35 tenant-scoped tables fully typed)               │  │
│  │  src/db/schema.ts                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────┐     ┌────────────────────────────────┐  │
│  │  Supabase Auth + Postgres │     │  Cloudflare R2 (S3-compatible) │  │
│  │  src/integrations/...     │     │  src/lib/r2.server.ts          │  │
│  └───────────────────────────┘     └────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

- **Frontend**: TanStack Start + TanStack Router (File-based routing), React 19, Tailwind CSS v4, Lucide React, Radix UI.
- **Backend / Server**: TanStack Start Server Functions (`createServerFn`), Cloudflare Workers runtime.
- **ORM & Database**: Drizzle ORM, PostgreSQL (pg driver with SSL in production, isolated local Docker container in test).
- **Auth & Storage**: Supabase Auth (JWT + Session Cookie), Cloudflare R2 object storage.
- **Testing**: Vitest 4.1, Playwright 1.50+ (Chromium headless, RTL/LTR viewport matrix).

---

## 4. Multi-Tenant Architecture & Data Isolation

### Schema & RLS Guardrails
1. **Tenant Identification**: Every business table contains `tenant_id uuid NOT NULL references tenants(id)`.
2. **Tenant Context Enforcement**:
   - `src/lib/tenant-context.server.ts` resolves tenant from the authenticated user's session.
   - `src/lib/tenant.functions.ts` / server functions enforce tenant isolation on every SQL query (`eq(table.tenantId, tenantId)`).
3. **Database RLS Policies**:
   - Supabase PostgreSQL RLS enabled on all tables with tenant isolation helper `is_tenant_member(_tenant_id, _roles[])`.
   - Security Definer triggers prevent updating `tenant_id` on existing records.

---

## 5. Completed Sprints Summary (Sprints 1 – 7B & 6C)

### Sprint 1: Fast CRM Intake & Commercial Pipeline Handoff
- **Features**: `FastCrmIntakeDrawer` modal on `/admin/crm` for high-speed lead intake.
- **Handoff**: 1-click **Save & Build Quote** transitions seamlessly to `/admin/quotes/new?customerId=...&opportunityId=...` with pre-filled customer and opportunity relationships.
- **Commercial Pipeline**: Bidirectional opportunity stage synchronization (`inquiry` → `quote_sent` → `negotiation` → `won`).

### Sprint 2: Milestone Billing & Project Financial Health
- **Migration**: `supabase/migrations/20261118_milestone_billing_and_margin.sql` (+ `_down.sql`).
- **Features**: Project Financials tab on `/admin/projects/$id` displaying Contract Value, Total Invoiced, Collected Revenue, and Gross Margin.
- **Milestone Schedule**: 3-stage milestone schedule (Contract Deposit, Assembly & Progress, Handover & Delivery).
- **1-Click Billing**: Single-click **Issue Invoice** action transitioning `billingStatus: "scheduled"` → `"issued"`.
- **Security**: Strict financial field masking for roles lacking `projects.financials.view` permission.

### Sprint 3: Guided Production Stage, QC Gate & Remake Loop
- **Stage Stepper**: Replaced `ready_for_pickup` with `ready_for_delivery` ("Ready for Delivery & Installation" / "جاهز للتسليم والتركيب") with backward-compatible aliases.
- **QC Gate**: Strict QC inspection requirement before advancing to delivery; defect logging with severity categorization.
- **Remake Loop**: Automated remake task creation linked to production work orders upon QC check failure.

### Sprint 4: Standalone Inventory Polish & Movement Audit Ledger
- **Stock Tracking**: Independent material/hardware inventory management with real-time stock levels.
- **Low Stock Filter**: Interactive Low Stock Alert KPI card toggling URL state (`?lowStock=true`).
- **Directional Stock Adjustment**: Directional Stock In (+) and Stock Out (-) modal with quick-add chips (`+1`, `+5`, `+10`) and free/reserved stock validation.
- **Audit Ledger**: `StockMovementsDrawer` sliding ledger providing complete chronological movement history.

### Sprint 5: SaaS Multi-Tenant Onboarding & Subscription Quotas
- **Self-Serve Onboarding**: `/auth?tab=register` workshop creation flow with Free Plan auto-provisioning.
- **Subscription Tiers**: Free (3 seats, 25 quotes/mo), Pro (10 seats, 150 quotes/mo), Enterprise (unlimited).
- **Quota Enforcement**: Server-side active seat assertions (`assertActiveSeatAvailable`) and monthly quote quota limit checks (`assertMonthlyQuoteQuota`).
- **Settings Card**: Clean read-only Subscription & Quotas card inside `/admin/settings` (system tab).

### Sprint 6A: Delivery & Installation Stage & After-Sales Warranty Loop
- **Stage Transition**: Formalized `ready_for_delivery` as the canonical stage for furniture installation fit-outs.
- **Handover Flow**: Customer delivery handover creation with installation requirements and signature recording.
- **After-Sales Warranty**: `service_cases` tracking for warranty claims, customer complaints, and diagnostic visits.
- **Remake Linkage**: Direct generation of repair work orders from after-sales service cases.

### Sprint 6B: Actionable Morning Command Center & Dashboard Hardening
- **Executive Operations Center**: Refactored `/admin` morning cockpit with high-performance concurrent query execution.
- **Needs Attention Center**: "Management Attention Center" with priority filters (All, Production & QC, Billing & CRM, Inventory & Tasks).
- **Performance Hardening**: All morning metrics queried via single concurrent `Promise.all` in <25ms (threshold: 500ms).
- **RBAC Financial Masking**: Automatic masking of sensitive financial figures for worker and supervisor roles.

### Sprint 7A: Workshop-Grade Cut-List CSV Importer & Relational Remakes
- **Migration**: `supabase/migrations/20261119_work_order_cut_list_items.sql` (+ `_down.sql`).
- **Relational Schema**: Dedicated `work_order_cut_list_items` table decoupled from legacy catalog configurator trees.
- **CSV Parser**: Resilient RFC-4180 CSV parser supporting both English and Arabic header variations.
- **Workshop Math**: Client-safe sheet estimation (`computeCutListSummary`: 2440x1220mm MDF sheets, linear edge-banding meters).
- **Detail Drawer**: Cut List & Parts tab in `WorkOrderDetailDrawer` with live summary badges and `ImportCutListModal`.
- **Relational Remakes**: Direct linkage between remake tickets and specific cut list line items (`remakes.cutListItemId`).

### Sprint 7B: Public `/compare` ERP Positioning Page & Quote Builder Quick-Pick Polish
- **Public `/compare` Page**: High-conversion comparison page with Atelier Prestige emerald tokens `#008269`, 10-point workshop matrix, CAD handoff section, and 3-tier SaaS pricing cards.
- **Navigation Parity**: "Compare" / "المقارنة" / "Comparer" links added to desktop header, mobile drawer, and footer.
- **Quote Builder Quick-Pick Tiles**: Visual category selection cards in `/admin/quotes/new` while preserving the unselected combobox state and catalog picker.
- **Full i18n Parity**: 108 translation keys added across `en.json`, `ar.json`, and `fr.json` (1,096 keys each, 100% parity).

### Sprint 6C: Unified Acceptance Suite & Release Documentation Lock
- **Acceptance Spec**: Deterministic Playwright spec `e2e/sprints-1-to-7-acceptance.spec.ts` validating the 5 core user journeys in 27.1s.
- **Full Verification Gate**: 100% passing results across Typecheck, i18n, 70 Vitest files (1,151 tests), 48 Playwright specs (174 tests), and production build.
- **Documentation Lock**: Master handoff, architecture baseline, and ordered migration manifest synchronized.

---

## 6. Ordered SQL Migration Manifest

Three database migrations were created on this branch and must be applied in the exact sequence below when deploying to production Supabase (`zgumsjwukevptbwbglrk`):

| # | Migration File | Rollback (`_down.sql`) | Tables / Columns Touched | Description |
| :- | :--- | :--- | :--- | :--- |
| **1** | `20261112_projects_entity.sql` | `20261112_projects_entity_down.sql` | `projects` (new table) | Creates multi-tenant `projects` entity with unique project numbers, quote/order relationships, financial metrics, and RLS policies. |
| **2** | `20261118_milestone_billing_and_margin.sql` | `20261118_milestone_billing_and_margin_down.sql` | `invoices` (7 new columns) | Adds `project_id`, `milestone_index`, `milestone_total_count`, `milestone_label`, `milestone_pct`, `billing_status`, and `due_stage` to `invoices`. |
| **3** | `20261119_work_order_cut_list_items.sql` | `20261119_work_order_cut_list_items_down.sql` | `work_order_cut_list_items` (new table) | Creates tenant-scoped cut list table with dimensions (length/width/thickness), edge-banding, grain orientation, and work order relationships. |

### Post-Merge Migration Execution Runbook
When authorized to apply migrations to production Supabase:
```bash
# 1. Apply Migration 1 (Projects Entity)
supabase db push --file supabase/migrations/20261112_projects_entity.sql

# 2. Apply Migration 2 (Milestone Billing & Margin)
supabase db push --file supabase/migrations/20261118_milestone_billing_and_margin.sql

# 3. Apply Migration 3 (Work Order Cut List Items)
supabase db push --file supabase/migrations/20261119_work_order_cut_list_items.sql
```

### Emergency Rollback Runbook
If rollback is required:
```bash
# 1. Rollback Cut List Items
supabase db push --file supabase/migrations/20261119_work_order_cut_list_items_down.sql

# 2. Rollback Milestone Billing
supabase db push --file supabase/migrations/20261118_milestone_billing_and_margin_down.sql

# 3. Rollback Projects Entity
supabase db push --file supabase/migrations/20261112_projects_entity_down.sql
```

---

## 7. Operational Runbook & Verification Commands

### Local Development Commands
```bash
# Start local isolated test database
docker start pelecanon_isolated_pg

# Typecheck TypeScript files
npm run typecheck

# Check bilingual / trilingual i18n parity
node scripts/check-i18n.mjs

# Run Vitest test suite (70 files, 1,151 tests)
npm test

# Run full Playwright E2E suite (48 files, 174 tests)
npm run test:e2e

# Run unified Sprint 1–7 acceptance spec
npx playwright test e2e/sprints-1-to-7-acceptance.spec.ts

# Compile production bundle
npm run build

# Preview production build locally
npm run preview
```

### Safety & Operational Constraints
1. **Target ONLY the isolated PostgreSQL test container (`localhost:5433/pelecanon_test`) during local development and testing.**
2. **Never push commits, alter remote branches, or mutate remote Supabase (`zgumsjwukevptbwbglrk`) without explicit user instruction.**
3. **Always preserve client/server boundary separation** (`.pure.ts` for calculations, `.server.ts` for database operations).
4. **Maintain 100% trilingual (EN/AR/FR) translation key parity across all locales.**
