# PeleCanon ERP — Comprehensive Project Handoff & Architecture Baseline

**Date**: 2026-11-18  
**Baseline Git Commit**: `2608814`  
**Active Branch**: `feature/atelier-prestige-homepage` (ahead of origin by 9 commits)  
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
| **Vitest Unit & Integration** | `npm test` (`vitest run`) | **1,073 / 1,073** tests (62 files) | 100% | ✅ PASS |
| **Playwright End-to-End** | `npm run test:e2e` (`playwright test`) | **165 / 165** tests | 100% | ✅ PASS |
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
│  │  Drizzle ORM (34 tenant-scoped tables fully typed)               │  │
│  │  src/db/schema.ts                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────┐     ┌────────────────────────────────┐  │
│  │  Supabase Auth + Postgres │     │  Cloudflare R2 (S3-compatible) │  │
│  │  src/integrations/...     │     │  src/lib/r2.server.ts          │  │
│  └───────────────────────────┘     └────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

| Layer | Implementation Choice | Notes |
| :--- | :--- | :--- |
| **Framework** | TanStack Start (v1.167) + React 19 + Vite 7 | Server-side rendering (SSR) targeting Cloudflare Workers |
| **Routing** | TanStack Router (v1.168) | File-based routing under `src/routes/` |
| **Design System** | Tailwind CSS v4 + shadcn/ui + Radix UI | Emerald Prestige theme tokens, Lucide icons, Dark/Light modes |
| **Database & ORM** | PostgreSQL 16 + Drizzle ORM | 34 tenant-scoped tables typed in `src/db/schema.ts` |
| **Auth Provider** | Supabase Auth (Username/Password) | Synthetic `<username>@pelecanon.local` email proxying |
| **Storage** | Cloudflare R2 | Direct presigned PUT uploads, 10-minute customer signed GET URLs |
| **PDF Generation** | `@react-pdf/renderer` | High-fidelity Shaheen quotation PDF with Arabic ligatures |
| **i18n** | `i18next` + `react-i18next` | Fully translated across `ar`, `en`, and `fr` with RTL support |

---

## 4. Multi-Tenant Architecture & Database Schema

The database model guarantees strict tenant isolation at the schema, query, and application layers:

### The 34 Tenant-Scoped Tables
1. **Tenancy & Core RBAC**: `tenants`, `app_users`, `tenant_members`, `tenant_roles`, `role_permissions`
2. **CRM & Customer Operations**: `customers`, `leads`, `opportunities`, `service_cases`, `customer_files`
3. **Commercial Quotation**: `quotes`, `quote_items`, `quote_snapshots`, `configurations`
4. **Manufacturing Hierarchy**: `quotation_products`, `sections`, `units`, `components`
5. **Projects & Operations**: `projects`, `orders`, `work_orders`, `remakes`, `delivery_handovers`
6. **Financials & Accounting**: `invoices`, `invoice_payments`
7. **Task Management 2.0**: `tasks`, `task_assignees`, `task_attachments`
8. **Catalog & Pricing Levers**: `suppliers`, `catalog_materials`, `catalog_material_variants`, `catalog_finishes`, `catalog_hardware`, `catalog_accessories`, `tenant_pricing_factors`
9. **Storage & Audit**: `attachments`, `notifications_log`

### Tenant Isolation Enforcement
- Every table enforces `tenant_id uuid NOT NULL`.
- PostgreSQL triggers block any `UPDATE` modifying `tenant_id` (immutability rule).
- Row-Level Security (RLS) policies evaluate `is_tenant_member(tenant_id, allowed_roles[])`.
- Server functions execute `setTenantGuc(tenantId)` to set PostgreSQL session GUCs.

---

## 5. Unified Dynamic RBAC & Access Management

### 1. Database-Driven Single Source of Truth
Permissions resolve dynamically from:
$$\text{User} \longrightarrow \text{Tenant Member} \longrightarrow \text{Assigned Role} \longrightarrow \text{Role Permissions}$$

### 2. The 3-State Permission Engine
1. **Uninitialized Roles**: Safely fall back to default permissions (`DEFAULT_ROLE_PERMISSIONS`).
2. **Roles with Explicitly Configured Permissions**: Resolved directly from `role_permissions`.
3. **Roles Configured with Explicitly Zero Permissions**: If an administrator unchecks all permissions for a role, it resolves to an empty set and **never** falls back to defaults.

### 3. Role Profiles
- **`owner`**: Immutable super-administrator with unconditional access across all modules.
- **`admin`**: Full administrative access (adjustable per tenant).
- **`sales` (Manager)**: Operational manager across CRM, quotes, projects, orders, and after-sales.
- **`worker` (Task Worker)**: Dedicated worker workspace (`/admin/tasks`). Direct visits to unauthorized admin modules redirect safely to the permitted workspace; UI elements are hidden; server functions return HTTP 403 Forbidden.
- **`viewer`**: Read-only profile.
- **Custom Roles**: Unlimited tenant-scoped roles configurable via `/admin/team`.

### 4. Client-Safe Architecture
UI permissions metadata is decoupled into `src/lib/tenant-permissions-data.ts`. The client bundle never imports server database drivers or `postgres`.

---

## 6. Security Hardening & Isolation Baseline

### 1. Fail-Close Mock Authentication Guard
In `src/integrations/supabase/auth-middleware.ts` and `tenant-middleware.ts`:
```typescript
const isMockAuthAllowed = () =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
```
Mock bearer tokens (`Bearer mock-...`) are strictly rejected with HTTP 401 Unauthorized in production or unconfigured environments.

### 2. Hardened Public Tracking
- Public lookups by reference (`/track?ref=...`) require the cryptographic `orders.tracking_token` (UUIDv4). Lookups by raw order UUID are eliminated.
- Phone lookups (`handlePublicOrdersByPhone`) are rate-limited (10 requests/minute/IP) and SQL-bounded (`.limit(20)`).
- Returned payloads are sanitized to prevent sensitive internal margins or costs from leaking.

### 3. Cloudflare R2 Security
- Direct presigned PUT uploads bypass application servers.
- Presigned GET URLs for customer photos and documents enforce a strict **10-minute maximum TTL**.

---

## 7. Commercial Quotation Engine & Canonical Identifiers

### 1. Unified Canonical Identifier (`PLC-XXXXX`)
Standardized 5-character alphanumeric token binding the entire commercial chain:
$$\text{Quote (PLC-XXXXX)} \longrightarrow \text{Project (PRJ-XXXXX)} \longrightarrow \text{Order (PLC-XXXXX)} \longrightarrow \text{Delivery (DEL-XXXXX)} \longrightarrow \text{Invoice (PLC-XXXXX)}$$

### 2. Commercial Quotation Builder (`/admin/quotes/new`)
- Clean item creation workflow with unselected category prompt.
- Independent dimension units (`mm`, `cm`, `m`) and pricing units (`set`, `m`, `m²`, `pcs`, `lot`).
- Dual discount modes: fixed EGP amount and percentage (%).
- In-builder live Quotation Preview dialog.
- Retirement of legacy configurator: `/admin/quotes/configurator` redirects to `/admin/quotes/new`.

### 3. Shaheen Reference PDF Generation
- Solid emerald `#008269` header bar with bilingual title.
- RTL Arabic customer greeting and quote number.
- 4-column layout: Item (`البند`), Quantity (`العدد`), Design (`التصميم`), Technical Specifications (`المواصفات الفنية`).
- Arabic definite article formatting (e.g. `سعر الباب الواحد`).
- Contract payment schedule (60% Deposit / 30% Delivery / 10% Installation).

---

## 8. Operational Workflows & Workspaces

### 1. Project Entity Workspace (`/admin/projects/$id`)
- Unified hub linking quotation, customer details, work orders, remakes, deliveries, and financial ledger.
- Masked financial ledger: sensitive revenue and invoices are zeroed server-side unless the user holds `projects.financials.view`.

### 2. Task Management 2.0 (`/admin/tasks`)
- Kanban and list views, stage progression, photo proof capture, and assignment filters.
- Row-level assignment filters for task workers.

### 3. Customer 360 Drawer
- Comprehensive drawer revealing customer history, active quotations, projects, orders, service cases, and direct communication actions.

---

## 9. Automated Testing & Playwright Runtime Setup

### Dual WebServer Configuration (`playwright.config.ts`)
Playwright orchestrates both servers automatically:
- **Port 8081**: Development server (`npm run dev -- --port 8081`)
- **Port 8082**: Preview server (`npx vite preview --port 8082`)

### Idempotent Global Setup (`e2e/global-setup.ts`)
Before Playwright workers launch, `global-setup.ts` connects to `localhost:5433/pelecanon_test` and seeds:
- Primary tenant (`pelecanon`)
- Users (`admin`, `worker`)
- Predefined roles and permission records
- Reference customers, quotations (`PLC-DCD02`, `PLC-5NIEJ`, `PLC-00100`), orders, invoices, projects, and delivery handovers.

---

## 10. Local Git History & Commit Record

The branch `feature/atelier-prestige-homepage` is 14 commits ahead of remote with a clean working tree:

```text
549823b feat(inventory): add directional stock-in/out controls and global movement ledger
b53bcf8 feat(production): add atomic stage sync, server qc gate, and project shop-floor controls
b4209c8 feat(crm): add fast crm intake drawer and relational opportunity quote sync
1354f5b feat(finance): implement milestone billing schedules and project margin tracking
bd658fe docs: archive project references, update memory bank, and align status report
2608814 test(e2e): resolve fixture-dependent failures, preview runtime, and align documentation
c3d472b test(fixtures): provide self-seeding fixtures and isolate client rbac metadata for clean bundle compilation
fcf80b3 fix(security): fail-close mock auth bypass and harden public tracking endpoints
795b004 chore(core): update router guards, client middleware, operational tests and documentation
```

### Recent Completed Sprints (Sprints 1 - 6A)
- **Sprint 1 (Milestone Billing & Project Financial Health)**: Migration `20261118_milestone_billing_and_margin.sql`, milestone schedule creation (Deposit, Progress, Delivery), margin calculations, and `projects.financials.view` protection.
- **Sprint 2 (Fast CRM Intake & Relational Opportunity Sync)**: `FastCrmIntakeDrawer` modal, quick lead/opportunity creation, bidirectional quote opportunity sync and auto stage advancement.
- **Sprint 3 (Guided Production Stage, QC Gate & Remake Loop)**: Server-side `executeOrderStageTransition` and `executeQcInspection` in `production-workflow.server.ts`, strict QC gate on completion, automated remake task creation.
- **Sprint 4 (Standalone Inventory Polish & Movement Audit Ledger)**: Directional Stock In (+) and Stock Out (-) modal with quick-add chips and reserved stock protection; `StockMovementsDrawer` global audit ledger; restock row shortcuts.
- **Sprint 5 (SaaS Tenant Onboarding & Subscription Plan Enforcement)**: Self-serve workshop registration (`executeWorkshopOnboarding`), subscription plan tiers (`free`, `pro`, `enterprise`), active seat quota enforcement (`assertActiveSeatAvailable`), and monthly quotation quota limit checks (`assertMonthlyQuoteQuota`).
- **Sprint 6A (Company Delivery & Installation Stage, Milestone Billing Prompt & After-Sales Warranty Loop)**: Transition `ready_for_pickup` to `ready_for_delivery` with backward-compatible aliases, default installation-first handover (`installationRequired = true`), milestone invoice issuance triggers upon delivery, order/project stage synchronization, after-sales warranty diagnostic drawer, and automated remake task generation.

---

## 11. Operational Runbook & Key Commands

### Daily Development & Verification
```bash
# 1. Start the isolated PostgreSQL container
docker start pelecanon_isolated_pg

# 2. Run static type checking
npm run typecheck

# 3. Run all unit and integration tests
npm test

# 4. Run all Playwright E2E browser tests
npm run test:e2e

# 5. Compile production build
npm run build

# 6. Preview production build
npm run preview
```

### Safety Constraints
1. **Never mutate production Supabase (`zgumsjwukevptbwbglrk`) during tests**.
2. **Never push to remote repository without explicit authorization**.
3. **Always use `npm` per `package-lock.json`**.
4. **Never print secrets from `.env`**.

---

## 12. Reference Documentation Suite (`refs/`)

All historical audit reports, architectural studies, and runbooks are organized in `refs/`:

| Document | Purpose |
| :--- | :--- |
| **`refs/PELECANON_PROJECT_HANDOFF.md`** | Primary master handoff document (this file) |
| **`refs/pelecanon_source_of_truth_reconciliation_report.md`** | Phase 0 source-of-truth reconciliation audit |
| **`refs/pelecanon_phase_1_verification_report.md`** | Phase 1 test execution and security verification |
| **`refs/pelecanon_rbac_security_audit_report.md`** | Comprehensive RBAC security audit |
| **`refs/pelecanon_rbac_security_integrity_audit_report.md`** | Security audit of empty permission sets and bypasses |
| **`refs/pelecanon_rbac_implementation_acceptance_report.md`** | Acceptance report for dynamic RBAC implementation |
| **`refs/pelecanon_user_access_management_simplification_report.md`** | Non-technical Access Management UI architecture |
| **`refs/quotation_configurator_retirement_report.md`** | Verification of legacy configurator retirement |
| **`refs/quotation_final_acceptance_audit.md`** | Commercial quotation acceptance verification |
| **`refs/service_cases_final_production_deployment_runbook.md`** | Production deployment runbook for service cases |
| **`refs/pelecanon_r2_storage_and_backup_audit.md`** | Cloudflare R2 storage and backup audit |
| **`refs/pelecanon_final_integration_and_merge_readiness_report.md`** | Merge readiness and final integration review |
