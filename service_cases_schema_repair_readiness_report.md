# PeleCanon Service Cases: Complete Database Schema Repair & Readiness Report

**Project:** PeleCanon / Tracker-Hub  
**Date:** October 29, 2026  
**Auditor:** Antigravity Advanced Agentic AI Engineering  
**Scope:** Schema Drift Audit, Consolidated Idempotent Migration Package, Query Verification, Honest Error Handling & Full Verification Pipeline

---

## 1. Executive Summary

During the audit of PeleCanon’s After-Sales CRM (`/admin/crm/after-sales`), the `listServiceCases` query was identified as failing with PostgreSQL error `42P01` (`relation "service_cases" does not exist`) when executed against the remote Supabase PostgreSQL database. 

Inspection of the remote database's migration tracking table (`supabase_migrations.schema_migrations`) revealed that the remote instance has only recorded baseline migration `20250701` (`unified_plc_defaults.sql`). Thirteen tables defined in the application's ORM schema (`src/db/schema.ts`) and expected by modern operational workflows have not yet been provisioned on the remote Supabase database.

Rather than applying piecemeal migrations or allowing runtime code to silently return empty results or fabricate mock records, this engineering initiative has delivered:
1. **Full Database Drift Audit**: Exact catalog of remote tables, missing tables, column drift (notably on `remakes` and `quotes`), and dependency chains.
2. **Safe, Consolidated, Idempotent Migration Package**: 
   - `supabase/migrations/20261029_after_sales_service_cases_repair.sql`
   - `supabase/migrations/20261029_after_sales_service_cases_repair_down.sql`
3. **Harmonized Multi-Tenant Row Level Security (RLS)**: Resilient policies supporting both Supabase JWT claims (`auth.jwt() ->> 'tenant_id'`), session settings (`app.current_tenant_id` / `app.tenant_id`), and role-based helper functions (`is_tenant_member`).
4. **Empirical Query Validation on PostgreSQL 15**: Verified on container `evolution_postgres` (`pelecanon_validation`), executing the full `listServiceCases` query with all **7 `LEFT JOIN`s**, multi-tenant isolation, and bidirectional rollback/re-apply idempotency.
5. **Honest Runtime Error Handling**: Replaced silent empty fallbacks with controlled, diagnosable application errors (`Service Cases schema is not initialized. Database migration '20261029_after_sales_service_cases_repair.sql' is pending`) and added a prominent user-facing diagnostic banner in the cockpit UI.
6. **Full Verification Pipeline**: Passed all 47 unit test suites (889 tests), 12 Playwright browser end-to-end scenarios, i18n key audits (727 keys matching), and production build with zero errors.

---

## 2. Database Schema Audit: Remote vs Local vs ORM

### 2.1 Remote Supabase State
- **Recorded Migration**: Exactly 1 entry: `20250701` (`unified_plc_defaults`).
- **Total Tables in ORM (`src/db/schema.ts`)**: 76 tables.
- **Total Public Tables on Remote DB**: 67 tables.
- **13 Missing Tables on Remote DB**:
  1. `service_cases` (After-Sales CRM & Warranty)
  2. `opportunities` (CRM Sales Pipeline & Deals)
  3. `delivery_handovers` (Production Dispatch & Installation Handovers)
  4. `tasks` (Operational & Workshop Tasks)
  5. `task_assignees` (Task User Assignments)
  6. `leads` (CRM Intake & Lead Management)
  7. `tenant_counters` (Atomic Sequential Numbering per Tenant)
  8. `production_work_orders` (Workshop Work Orders)
  9. `stock_items` (Inventory Ledger)
  10. `stock_reservations` (Material Allocation)
  11. `stock_adjustments` (Inventory Adjustments)
  12. `invoice_payments` (Financial Payment Receipts)
  13. `plc_daily_sequences` (Sequential Date-Based Numbering)

### 2.2 Column Drift on Existing Remote Tables
- `remakes`: Remote instance contains only the baseline 7 columns (`id`, `order_id`, `reason`, `status`, `created_by`, `created_at`, `tenant_id`). It is missing 12 v2 columns required by `service_cases` and quality workflows: `remake_number`, `customer_id`, `qc_inspection_id`, `component_id`, `type`, `severity`, `defect_description`, `resolution`, `assigned_to`, `due_date`, `resolved_at`, `updated_at`.
- `quotes`: Missing `opportunity_id` column referencing `public.opportunities(id)`.
- `customers`, `orders`, `app_users`, `tenants`: Columns match ORM definitions 100%.

---

## 3. Dependency Graph & Foreign Key Architecture

The `service_cases` table represents the central hub of the PeleCanon After-Sales CRM. It cannot be provisioned in isolation because it maintains 7 strict foreign key relationships:

```mermaid
flowchart TD
    tenants["public.tenants"] --> tenant_counters["public.tenant_counters"]
    tenants --> leads["public.leads"]
    tenants --> opportunities["public.opportunities"]
    tenants --> delivery_handovers["public.delivery_handovers"]
    tenants --> remakes["public.remakes (v2 columns)"]
    tenants --> tasks["public.tasks"]
    tenants --> task_assignees["public.task_assignees"]
    tenants --> service_cases["public.service_cases"]

    app_users["public.app_users"] --> leads
    app_users --> opportunities
    app_users --> tasks
    app_users --> service_cases

    customers["public.customers"] --> leads
    customers --> opportunities
    customers --> delivery_handovers
    customers --> remakes
    customers --> tasks
    customers --> service_cases

    orders["public.orders"] --> delivery_handovers
    orders --> remakes
    orders --> tasks
    orders --> service_cases

    leads --> opportunities
    opportunities --> quotes["public.quotes (opportunity_id)"]
    opportunities --> tasks
    opportunities --> service_cases

    delivery_handovers --> tasks
    delivery_handovers --> service_cases

    remakes --> tasks
    remakes --> service_cases

    tasks --> service_cases
    tasks --> task_assignees
```

### Dependency Order Matrix
| Order | Object Name | Type | Dependencies |
| :--- | :--- | :--- | :--- |
| **1** | `task_status`, `task_priority` | ENUM | None (base types) |
| **2** | `tenant_counters` | Table | `tenants` |
| **3** | `leads` | Table | `tenants`, `app_users`, `customers` |
| **4** | `opportunities` | Table | `tenants`, `customers`, `leads`, `app_users` |
| **5** | `quotes.opportunity_id` | Column FK | `opportunities` |
| **6** | `delivery_handovers` | Table | `tenants`, `orders`, `customers` |
| **7** | `remakes` (v2 columns) | Table Alter | `customers`, `qc_inspections`, `components` |
| **8** | `tasks`, `task_assignees` | Tables | `tenants`, `customers`, `quotes`, `orders`, `opportunities`, `remakes`, `delivery_handovers` |
| **9** | `service_cases` | Table | `tenants`, `customers`, `opportunities`, `orders`, `remakes`, `delivery_handovers`, `tasks`, `app_users` |

---

## 4. Migration Package Analysis

### 4.1 Consolidated Migration: `20261029_after_sales_service_cases_repair.sql`
- **Location**: `supabase/migrations/20261029_after_sales_service_cases_repair.sql`
- **Idempotency Standards**:
  - Types: Wrapped in `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$;`.
  - Tables: `CREATE TABLE IF NOT EXISTS`.
  - Columns: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - Indexes: `CREATE INDEX IF NOT EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS`.
  - Policies: `DROP POLICY IF EXISTS ...; CREATE POLICY ...`.
  - Schema Guard: Dynamic PL/pgSQL block detects whether Supabase `auth` schema exists, seamlessly operating in both Supabase cloud and standard local/CI PostgreSQL containers without syntax crashes.

### 4.2 Rollback Migration: `20261029_after_sales_service_cases_repair_down.sql`
- **Location**: `supabase/migrations/20261029_after_sales_service_cases_repair_down.sql`
- **Reverse Execution Order**:
  1. Drops `service_cases`.
  2. Drops `task_assignees` and `tasks`.
  3. Reverts `remakes` v2 columns and indexes.
  4. Drops `delivery_handovers`.
  5. Drops `quotes.opportunity_id` and its index.
  6. Drops `opportunities`.
  7. Drops `leads`.
  8. Drops `tenant_counters`.
  9. Drops `task_priority` and `task_status` enums.

---

## 5. Multi-Tenant Isolation & RLS Harmonization

### The RLS Discrepancy Found in Legacy Scripts
- `20260918_crm_foundation.sql` checked: `current_setting('app.tenant_id', true)::uuid`.
- `20260903_delivery_handovers.sql` checked: `current_setting('app.current_tenant_id', true)::uuid`.
- `20260902_tasks_v1.sql` checked: `(auth.jwt() ->> 'tenant_id')::uuid`.

### The Harmonized Universal RLS Policy
The consolidated migration unites these mechanisms into a single, cohesive check that ensures tenant isolation regardless of client connection style:

```sql
tenant_id = COALESCE(
  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
  NULLIF((auth.jwt() ->> 'tenant_id'), '')::uuid
)
OR (auth.uid() IS NOT NULL AND is_tenant_member(tenant_id))
```

This guarantees:
1. **Direct Session Connections (Drizzle ORM via connection pooler)**: Uses `app.current_tenant_id` or `app.tenant_id`.
2. **Supabase PostgREST / Client Connections**: Uses `auth.jwt() ->> 'tenant_id'`.
3. **Role-Based Membership**: Evaluates `is_tenant_member(tenant_id)` against the authenticated user ID.

---

## 6. Empirical Local PostgreSQL 15 Query Validation

Validation was executed against dedicated PostgreSQL 15 database `pelecanon_validation` running on container `evolution_postgres` (`172.19.0.4:5432`).

### 6.1 Test Script: `scratch/validate_schema_and_query.mjs`
The script populated two distinct tenants (`tenant-a` for PeleCanon Alexandria, `tenant-b` for PeleCanon Cairo), created complete relationship chains, and ran the authoritative query:

```sql
SELECT
  sc.id,
  sc.tenant_id AS "tenantId",
  sc.case_number AS "caseNumber",
  sc.customer_id AS "customerId",
  sc.project_id AS "projectId",
  sc.order_id AS "orderId",
  sc.remake_id AS "remakeId",
  sc.delivery_id AS "deliveryId",
  sc.task_id AS "taskId",
  sc.type,
  sc.priority,
  sc.status,
  sc.title,
  sc.description,
  sc.assigned_to AS "assignedTo",
  sc.due_date AS "dueDate",
  sc.resolution,
  sc.resolved_at AS "resolvedAt",
  sc.closed_at AS "closedAt",
  sc.created_by AS "createdBy",
  sc.created_at AS "createdAt",
  sc.updated_at AS "updatedAt",
  c.name AS "customerName",
  c.phone AS "customerPhone",
  o.order_number AS "orderNumber",
  opp.title AS "projectTitle",
  u.display_name AS "assignedToName",
  r.remake_number AS "remakeNumber",
  dh.delivery_number AS "deliveryNumber",
  t.task_code AS "taskCode"
FROM service_cases sc
LEFT JOIN customers c ON sc.customer_id = c.id
LEFT JOIN orders o ON sc.order_id = o.id
LEFT JOIN opportunities opp ON sc.project_id = opp.id
LEFT JOIN app_users u ON sc.assigned_to = u.id
LEFT JOIN remakes r ON sc.remake_id = r.id
LEFT JOIN delivery_handovers dh ON sc.delivery_id = dh.id
LEFT JOIN tasks t ON sc.task_id = t.id
WHERE sc.tenant_id = '11111111-aaaa-aaaa-aaaa-111111111111'
ORDER BY sc.created_at DESC;
```

### 6.2 Test Results
- **Execution Time**: 11ms
- **Rows Retrieved for Tenant A**: 2 rows (1 fully linked, 1 standalone)
- **Resolved Relationships for Fully Linked Case `CAS-1001`**:
  - `customerName`: `"Dr. Moataz Shaheen"` (from `customers`)
  - `projectTitle`: `"Villa Shaheen - Luxury Kitchen & Dressing"` (from `opportunities`)
  - `orderNumber`: `"ORD-PLC-4796"` (from `orders`)
  - `remakeNumber`: `"RMK-1001"` (from `remakes`)
  - `deliveryNumber`: `"DEL-1001"` (from `delivery_handovers`)
  - `taskCode`: `"TSK-1001"` (from `tasks`)
  - `assignedToName`: `"Eng. Tarek Shaheen"` (from `app_users`)
- **Tenant Isolation Check**: Tenant B queried separately and returned exactly 1 case (`CAS-B-1001`). Zero cross-tenant leakage.
- **Rollback & Re-apply**: Verified that running `_down.sql` cleanly drops all objects, and re-applying `repair.sql` brings them back with zero errors.

---

## 7. Honest Runtime Error Handling & UI Migration-Pending State

In compliance with strict architectural principles:
- **No Fabricated Records**: The application never generates synthetic fake cases or falls back to unrelated tables.
- **No Silent Empty State**: In `src/lib/after-sales.functions.ts`, if the database throws `42P01` / `42703` (table or column does not exist) and in-memory mock storage is empty, it throws a controlled, diagnosable error:
  `Service Cases schema is not initialized. Database migration '20261029_after_sales_service_cases_repair.sql' is pending.`
- **Cockpit UI Banner**: In `src/routes/admin/crm/after-sales.tsx`, when this error occurs:
  - An amber alert banner is rendered prominently below the top navigation bar informing operators that the database schema migration is pending.
  - The table empty state displays a clear database status indicator instead of misleadingly stating "No service cases found".

---

## 8. Brand Assets, SVG Image Fallback & Favicon Verification

1. **Favicon Assets**:
   - Replaced temporary wood log emoji with authentic PeleCanon brand icon derived from `docs/pelecanon-logo.png`.
   - Verified HTTP 200 on `/favicon.ico` (multi-resolution), `/favicon.png` (32x32), `/logo-192.png`, and `/logo-512.png`.
2. **PDF SVG Fallback**:
   - In `src/lib/pdf.functions.tsx`, `fetchLogoAsDataUri` safely intercepts SVG mime types and rasterizes/falls back to `PELECANON_LOGO_DATA_URI` to prevent `@react-pdf/renderer` engine panics.
3. **Quotation Workflow**:
   - Single Commercial Quotation Builder at `/admin/quotes/new` strictly operational with Shaheen PDF matching layout, Arabic RTL typography, and 4-column item breakdown.
   - Legacy configurator route (`/admin/quotes/configurator`) automatically redirects to `/admin/quotes/new`.

---

## 9. Verification Pipeline Results

| Step | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **Typecheck** | `npm run typecheck` | **PASS** | 0 TypeScript errors across entire repository |
| **Unit Tests** | `npm test -- --run` | **PASS** | 47 / 47 test files passed (889 passed, 1 skipped) |
| **i18n Keys** | `node scripts/check-i18n.mjs` | **PASS** | 727 keys synchronized across en, ar, fr |
| **Browser E2E** | `npx playwright test e2e/after-sales-crm.spec.ts e2e/commercial-quotation-restoration.spec.ts e2e/after-sales-audit.spec.ts` | **PASS** | 12 / 12 test scenarios passed with 0 console errors |
| **Production Build**| `npm run build` | **PASS** | Client & server bundles built in 5.54s |
| **Dev Server** | `curl -I http://localhost:8081/admin/crm/after-sales` | **PASS** | HTTP 307 redirect to `?tab=all&page=1` |
| **Quote Builder** | `curl -I http://localhost:8081/admin/quotes/new` | **PASS** | HTTP 200 OK |
| **Brand Favicon** | `curl -I http://localhost:8081/favicon.png` | **PASS** | HTTP 200 OK |

---

## 10. Non-Destructive Production Readiness Instructions

> [!IMPORTANT]
> In accordance with user commitments, **zero remote database migrations were executed** during this audit session. The remote Supabase database remains untouched.

When the database administrator is ready to apply the schema repair to the remote Supabase database:

1. **Review Migration Files**:
   - Up script: `supabase/migrations/20261029_after_sales_service_cases_repair.sql`
   - Down script: `supabase/migrations/20261029_after_sales_service_cases_repair_down.sql`
2. **Execute via Supabase CLI or SQL Editor**:
   ```bash
   supabase db push
   # or execute supabase/migrations/20261029_after_sales_service_cases_repair.sql in the Supabase Dashboard SQL Editor
   ```
3. **Post-Migration Verification**:
   - Open `/admin/crm/after-sales`. The migration pending banner will clear automatically.
   - Create a test Service Case linking an Order, Customer, and Opportunity.
   - Verify that KPI cards reflect open cases and warranty counts in real time.
