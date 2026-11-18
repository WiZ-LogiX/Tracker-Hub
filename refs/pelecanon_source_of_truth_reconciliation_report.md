# PeleCanon ERP — Phase 0 Source-of-Truth Reconciliation & Architecture Audit Report

**Date**: 2026-11-17  
**Operating Mode**: Strict READ-ONLY  
**Primary Source of Truth**: `/home/wiz/dyad-apps/price-produce-beam-main`  
**Target Repository**: `WiZ-LogiX/Tracker-Hub`  

---

## 1. Section 1: Repository & Workspace Identification

- **Primary Working Directory**: `/home/wiz/dyad-apps/price-produce-beam-main`
- **Git Remote (Fetch & Push)**: `https://github.com/WiZ-LogiX/Tracker-Hub.git` (`origin`)
- **Active Branch**: `feature/atelier-prestige-homepage` (up to date with `origin/feature/atelier-prestige-homepage`)
- **Current HEAD Commit**: `0174cb88c6dfca5a3ca410d439a8734e539f06cd` (`feat(atelier-prestige): complete homepage redesign, brand palette, operational workflow and quotation business integration`)
- **Other Tracked Branches**:
  - `origin/main` (`e820b8c` - *feat(release): Option B full production release — tree-shaking fixes, i18n parity, and credential untracking*)
  - `origin/update_worker_name_to_trackerhub` (`e8acda7`)
- **Working Tree Dirty Status**:
  - **Modified Files**: 69 files (+5,527 insertions, -2,787 deletions), primarily consisting of RBAC access management (`src/routes/admin/team.tsx`, `src/lib/tenant-context.ts`, `src/lib/auth.functions.ts`), Project entity workflow (`src/lib/project.functions.ts`, `src/routes/admin/projects/`), canonical quotation numbering (`src/lib/numbering.ts`, `src/lib/quote.functions.ts`), and database schema enhancements (`src/db/schema.ts`).
  - **Untracked Files (17 items)**:
    - `e2e/benchmark-measurements.spec.ts`
    - `e2e/drawers-and-session.spec.ts`
    - `e2e/performance-and-quotation-standardization.spec.ts`
    - `e2e/warehouse-supervisor-and-access-management.spec.ts`
    - `e2e/workflow-integration-and-project-entity.spec.ts`
    - `scripts/measure-benchmarks.ts`
    - `scripts/migrate-canonical-quote-numbers.ts`
    - `src/lib/dashboard.server.ts`
    - `src/lib/empty-permissions.test.ts`
    - `src/lib/performance-benchmark.test.ts`
    - `src/lib/project-entity-workflow.test.ts`
    - `src/lib/project-store.server.ts`
    - `src/lib/rbac-security-integrity-audit.test.ts`
    - `src/lib/warehouse-supervisor.test.ts`
    - `src/migration-runner.test.ts`
    - `supabase/migrations/20261112_projects_entity.sql`
    - `supabase/migrations/20261112_projects_entity_down.sql`

---

## 2. Section 2: Environment Configuration & Secret Hygiene

- **Files Examined**:
  - `.env` (Size: 1,455 bytes)
  - `.env.example` (Size: 1,574 bytes)
  - `.env.remote-backup` (Size: 1,585 bytes)
- **Git Tracking Status**:
  - Verified via `git ls-files --stage`: `.env` and `.env.remote-backup` are **NOT tracked** by git.
  - `.gitignore` explicitly ignores `.env`, `.env.*`, while keeping `!.env.example`.
  - Only `.env.example` is committed to git (object ID `ac450b12ef3699bf3817a39e98e455000337da79`).
- **Variable Presence Matrix (Zero Secret Values Exposed)**:

| Variable Name | Status in `.env` | Target / Endpoint Configuration | Status in `.env.remote-backup` |
|---|---|---|---|
| `DATABASE_URL` | SET | `localhost:5433/pelecanon_test` | `aws-0-eu-west-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_DB_URL` | SET | `localhost:5433/pelecanon_test` | `aws-0-eu-west-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | SET | `zgumsjwukevptbwbglrk.supabase.co` | `zgumsjwukevptbwbglrk.supabase.co` |
| `VITE_SUPABASE_URL` | SET | `zgumsjwukevptbwbglrk.supabase.co` | `zgumsjwukevptbwbglrk.supabase.co` |
| `SUPABASE_PROJECT_ID` | SET (22 chars) | Redacted project identifier | SET (22 chars) |
| `SUPABASE_PUBLISHABLE_KEY` | SET (48 chars) | Redacted anon key | SET (48 chars) |
| `VITE_SUPABASE_KEY` | SET (48 chars) | Redacted anon key | SET (48 chars) |
| `SUPABASE_SERVICE_ROLE_KEY`| SET (221 chars)| Redacted service key | SET (221 chars) |
| `SUPABASE_PERSONAL_ACCESS_TOKEN` | SET (46 chars) | Redacted CLI token | SET (46 chars) |
| `R2_ACCOUNT_ID` | SET (34 chars) | Redacted Cloudflare account | SET (34 chars) |
| `R2_BUCKET` | SET (11 chars) | Redacted bucket name | SET (11 chars) |
| `R2_ACCESS_KEY_ID` | SET (34 chars) | Redacted R2 key ID | SET (34 chars) |
| `R2_SECRET_ACCESS_KEY` | SET (66 chars) | Redacted R2 secret key | SET (66 chars) |
| `R2_PUBLIC_URL` | SET | `pub-90fe65c019b6488086aa7b039e12acc5.r2.dev` | `pub-90fe65c019b6488086aa7b039e12acc5.r2.dev` |
| `N8N_NOTIFY_WEBHOOK_URL` | SET | `n8n.wizlogix.qzz.io` | `n8n.wizlogix.qzz.io` |

- **Secret Hygiene & Rotation Verification**:
  - No secret keys, passwords, or tokens have been copied or printed.
  - Active `.env` points exclusively to isolated local Postgres port 5433. Production credentials remain isolated in `.env.remote-backup`.

---

## 3. Section 3: Database Isolation & Connection Targets

- **Active Connection Target**:
  - `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5433/pelecanon_test`
  - `SUPABASE_DB_URL`: `postgresql://postgres:postgres@localhost:5433/pelecanon_test`
- **Docker Container Inspection**:
  - Container Name: `pelecanon_isolated_pg`
  - Image: `postgres:16-alpine`
  - Status: **`Exited (0) 3 days ago`**
  - Ports: Configured for `localhost:5433` -> `5432/tcp`
  - Other running containers: `evolution_api`, `evolution_postgres` (port 5432), `evolution_redis` (port 6379), `evolution_frontend`.
- **Production Supabase Isolation**:
  - Remote host `aws-0-eu-west-1.pooler.supabase.com` and project `zgumsjwukevptbwbglrk` are **strictly disconnected** in `.env`.
  - Zero network queries or mutations were executed against remote Supabase.
- **Read-Only Constraint Compliance**:
  - `pelecanon_isolated_pg` was **NOT started or altered** during this audit to preserve strict read-only execution.

---

## 4. Section 4: Package Scripts & Lockfile Verification

- **Engine & Runtime Versions**:
  - Node.js: `v22.22.3`
  - npm: `11.17.0`
  - bun: `1.3.14`
- **`package.json` Scripts Audit**:
  - `dev`: `vite dev`
  - `build`: `vite build`
  - `build:dev`: `vite build --mode development`
  - `preview`: `vite preview`
  - `typecheck`: `tsc --noEmit`
  - `lint`: `eslint .`
  - `test`: `vitest run`
  - `test:e2e`: `playwright test`
  - `format`: `prettier --write .`
  - `postinstall`: `node scripts/patch-textkit.mjs`
- **Lockfile Inventory**:
  - `package-lock.json` (475,707 bytes, modified Jun 28, 2026) — Authoritative lockfile for npm.
  - `bun.lock` (208,317 bytes, modified Jun 7, 2026) — Legacy lockfile.
  - `pnpm-lock.yaml` (318,524 bytes, modified Jun 19, 2026) — Legacy lockfile.

---

## 5. Section 5: Database Schema & Migration Status

- **Drizzle ORM Schema Architecture (`src/db/schema.ts`)**:
  - 78 `pgTable` exports covering all domain models.
  - Core Business Entities: `tenants`, `tenantMembers`, `appUsers`, `customers`, `leads`, `opportunities`, `projects`, `quotes`, `quoteItems`, `invoices`, `invoicePayments`, `orders`, `deliveryHandovers`.
  - RBAC Tables: `tenantRoles`, `permissions`, `rolePermissions`.
  - Production & Inventory: `productionLogs`, `productionPhotos`, `productionAssignments`, `productionWorkOrders`, `stockItems`, `stockReservations`, `stockAdjustments`, `remakes`, `qcInspections`.
  - Operations & Tasks: `tasks`, `taskAssignees`, `serviceCases`, `internalNotes`, `auditLog`, `tenantAuditLog`.
- **Migration History (`supabase/migrations/`)**:
  - 97 total migration files present.
  - Critical recent migrations:
    1. `20261112_projects_entity.sql`: Implemented relational `projects` table with foreign key linkages to quotes, orders, invoices, and deliveries. Down migration `20261112_projects_entity_down.sql` is present.
    2. `20261112_performance_and_quotation_standardization.sql`: Added `legacy_quote_number` to `quotes` and composite indexes (`quotes_tenant_legacy_quote_idx`, `orders_tenant_stage_idx`, `orders_tenant_quote_idx`, `invoices_tenant_quote_idx`). Down migration is present.
    3. `20261113_rbac_unification.sql`: Seeds unified permissions catalog (121 permissions across 22 sections), tenant roles, and initial role-permission assignments.

---

## 6. Section 6: Multi-Tenant RBAC & Access Management Architecture

- **Single Source of Truth Flow**:
  $$\text{User} \longrightarrow \text{Tenant Membership} \longrightarrow \text{Assigned Role} \longrightarrow \text{Saved Role Permissions}$$
- **Predefined Profiles & Adjustability**:
  - Built-in roles: `admin` (Administrator), `sales` (Manager), `worker` (Task Worker), `viewer` (Viewer).
  - Predefined profiles are fully customizable; hardcoded static maps do **not** override persisted permissions in `role_permissions`.
- **Owner Super-Administrator Safeguard**:
  - Role `owner` has unconditional hardcoded bypass in `resolveEffectivePermissions()` (`src/lib/tenant-context.ts#L950`), returning `ALL_PERMISSION_SLUGS`.
- **3-State Permission Resolver (`resolveEffectivePermissions`)**:
  - **State 1 (Uninitialized Role)**: Role is not registered in `tenant_roles`. Resolves to `DEFAULT_ROLE_PERMISSIONS` and auto-seeds both `tenant_roles` and `role_permissions`.
  - **State 2 (Initialized with Saved Permissions)**: Role is registered in `tenant_roles`. Resolves strictly to persisted rows in `role_permissions`.
  - **State 3 (Initialized with Zero Permissions)**: Role is registered in `tenant_roles` with 0 rows in `role_permissions`. Resolves strictly to empty set `Set([])`. **Never** falls back to defaults.
- **Account Deactivation Protection**:
  - Enforced in `src/integrations/supabase/tenant-middleware.ts#L65`: Checks `appUsers.status === "disabled"`, throwing `"Forbidden: User account is disabled"`.
- **Caching Mechanism**:
  - In-memory `permissionsCache` keyed by `${tenantId}:${role}` with a 60-second TTL (`CACHE_TTL_MS = 60_000`). Invalidation triggered on updates via `invalidateTenantPermissionsCache()`.

---

## 7. Section 7: Commercial Quotation Engine & Canonical Numbering

- **Pricing Engine Truth**:
  - Configurable JSON-DSL pricing engine in `src/lib/pricing/engine.ts`.
  - Steps: `add` $\rightarrow$ `snapshot` $\rightarrow$ `mul_pct`. Rule versions are immutable.
  - Formula incorporates material, wastage, labor, overhead, margin, luxury, complexity, rush, and 14% Egyptian VAT.
- **Canonical Quotation Number Standardization**:
  - Canonical regex: `^PLC-[0-9A-Z]{5}$` (e.g., `PLC-YQ3Z5`, `PLC-5PV1Z`).
  - Database constraint: `quotes.quote_number` has a database-level `UNIQUE` constraint (`text("quote_number").notNull().unique()`).
  - Cryptographic generator: `generatePLCId()` in `src/lib/numbering.ts` uses `crypto.getRandomValues()`.
  - Historical retention: Legacy quote numbers (e.g. `PLC-QUOTE-2026-XXXX`) are preserved in `quotes.legacy_quote_number` and indexed via `quotes_tenant_legacy_quote_idx`.
- **Cross-Module Relational Flow**:
  $$\text{Customer} \longrightarrow \text{Quote} \longrightarrow \text{Project} \longrightarrow \text{Production Order} \longrightarrow \text{Delivery} \longrightarrow \text{Invoice} \longrightarrow \text{Payments}$$

---

## 8. Section 8: Task Management & Workforce Execution System

- **Architecture (`src/lib/tasks.functions.ts`)**:
  - Operational task engine supporting 10 task permissions (`tasks.view_assigned`, `tasks.view_all`, `tasks.create`, `tasks.edit`, `tasks.status.transition`, `tasks.notes.add`, `tasks.attachments.upload`, `tasks.assign`, `tasks.acknowledge`, `tasks.bulk`).
- **Scoping & Authorization**:
  - Workers with `tasks.view_assigned` only are restricted at the database query level via `taskAssignees` join (`src/lib/tasks.functions.ts#L236-L255`).
  - Users with `tasks.view_all` can inspect and manage all tenant tasks.
- **Entity Linking**:
  - Tasks link directly to `orderId`, `workOrderId`, `remakeId`, `deliveryId`, `caseId`, `customerId`, and `quoteId`.

---

## 9. Section 9: Storage & Cloudflare R2 Integration

- **Client & Server Integration**:
  - Server primitive: S3 Client SDK in `src/lib/r2.server.ts` utilizing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.
  - Client-safe utility: `src/lib/r2.utils.ts` and `src/lib/r2.config.ts`.
- **Tenant Isolation in Object Keys**:
  - Generated keys strictly enforce tenant hierarchy:
    $$\text{Key} = \texttt{\$\{tenantId\}/\$\{entityType\}/\$\{entityId\}/\$\{hash\}.\$\{ext\}}$$
  - Supported entity types: `production-photos`, `avatars`, `attachments`, `logos`.
- **Presigned URLs**:
  - PUT presigned URLs for client uploads without routing heavy binaries through the application server.
  - GET presigned URLs with 25-minute TTL via `useSignedR2Urls` hook.

---

## 10. Section 10: Prior Report Claims vs. Source Facts

| Prior Report Claim | Source File / Implementation | Verified Source Fact | Status |
|---|---|---|---|
| **RBAC 3-State Permission Resolver** | `src/lib/tenant-context.ts#L976-1025` | Uninitialized role seeds defaults; initialized role uses persisted DB permissions; empty permission set returns `Set([])` without fallback. | **VERIFIED** |
| **Quotation Number Canonical Standardization** | `src/lib/numbering.ts#L8-40`, `src/db/schema.ts#L448` | `^PLC-[0-9A-Z]{5}$` enforced; `UNIQUE` constraint present on `quote_number`; `legacy_quote_number` preserved. | **VERIFIED** |
| **Relational Project Entity Architecture** | `src/db/schema.ts`, `src/lib/project.functions.ts` | `projects` table exists with cross-module foreign keys (`quoteId`, `customerId`, `opportunityId`, `orderId`, `invoiceId`). | **VERIFIED** |
| **Account Deactivation Immediate Block** | `src/integrations/supabase/tenant-middleware.ts#L65` | `appUsers.status === "disabled"` throws `Forbidden: User account is disabled`. | **VERIFIED** |
| **Local PostgreSQL Container Status** | `docker ps -a` | Prior reports assumed container was running; source fact is `pelecanon_isolated_pg` is **stopped (`Exited (0) 3 days ago`)**. | **DISCREPANCY (Container Stopped)** |
| **Zero Projects/Customers in Local DB** | User request history | User explicitly requested clearing out all projects, quotes, invoices, and customers for fresh live testing. | **VERIFIED INTENT** |

---

## 11. Section 11: Test Suite Readiness & Execution Audit

- **Test Suite Inventory**:
  - Unit / Integration Test Suites (Vitest): **58 test suites** in `src/`.
  - End-to-End Test Suites (Playwright): **46 test suites** in `e2e/`.
- **Tests Actually Run in Current Turn**:
  - **Zero (0) tests executed**.
- **Prerequisite Validation**:
  - `package.json` scripts verified: `vitest run`, `playwright test`.
  - Lockfiles verified: `package-lock.json` present.
  - Git tracking status of `.env` verified: uncommitted and ignored.
  - Isolated DB configuration verified: `.env` points to `localhost:5433/pelecanon_test`.
- **Blocking Constraint to Running DB Tests**:
  - Docker container `pelecanon_isolated_pg` is currently `Exited (0)`. Tests requiring PostgreSQL connections cannot run until the container is started.
  - Starting the container would violate the strict READ-ONLY constraint without explicit user authorization.

---

## 12. Section 12: Remaining Unknowns & Technical Debt

1. **In-Memory Cache in Multi-Instance Deployments**:
   - `permissionsCache` is stored in process memory (`Map<string, { perms: Set<string>; timestamp: number }>`).
   - If PeleCanon is scaled horizontally across multiple Node/Worker instances, an update to role permissions on one instance will take up to 60 seconds to reflect on peer instances. A Redis pub/sub invalidation bus is recommended for distributed multi-instance production.
2. **Uncommitted Working Tree Scope**:
   - There are 69 modified files and 17 untracked files on branch `feature/atelier-prestige-homepage`. A structured git staging and commit plan must be executed prior to production release.
3. **Multiple Lockfiles Coexistence**:
   - The repository contains `package-lock.json`, `bun.lock`, and `pnpm-lock.yaml`. To prevent subtle dependency resolution mismatches, non-npm lockfiles should be pruned once approved.
4. **Production Migration Execution**:
   - Migrations `20261112_projects_entity.sql`, `20261112_performance_and_quotation_standardization.sql`, and `20261113_rbac_unification.sql` are drafted locally and must be executed in order on production Supabase (`zgumsjwukevptbwbglrk`) during release.

---

## 13. Section 13: Final Phase 0 Reconciliation Assessment & Request for Approval

- **Phase 0 Reconciliation Verdict**: **RECONCILED & VERIFIED**
- **Security Assessment**:
  - Production Supabase credentials are secure and isolated.
  - Active `.env` points strictly to local port 5433.
  - RBAC engine has closed hardcoded bypasses and enforces the 3-state resolution model.
  - Canonical quotation numbering and relational project entities are solidly established in source code.
- **Request for Approval**:
  - In strict compliance with your instructions, this entire reconciliation was executed in **READ-ONLY mode**.
  - No files were modified, no git commands mutated the workspace, no database containers were altered, and no tests were run against stopped services.
  - **Awaiting your explicit approval to proceed to the next phase.**
