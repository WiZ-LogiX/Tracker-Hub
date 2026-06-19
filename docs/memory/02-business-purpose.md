# 2. Business Purpose

PeleCanon solves three problems for furniture workshops:

1. **Transparent pricing.**
   A central deterministic pricing engine (`src/lib/pricing.ts`, `src/lib/pricing/engine.ts`) reveals every cost bucket:
   `base + material + finish + veneer + accessories + labor / wastage / overhead + margin + luxury / complexity / rush`. Admins can edit the rule (or add a new version) without code changes.

2. **Production visibility.**
   - Customers see a public tracking page (`/track?ref=ORD-XXX`) with stage progress + photos.
   - Admins see a kanban-by-stage view (`src/routes/admin/orders.tsx`) with worker assignments, QC, and remakes.

3. **Multitenancy.**
   Each "company" is a `tenant` with isolated `tenant_id`-scoped RLS (`supabase/migrations/20260612_tenancy_v1.sql`). 33 business tables are tenant-scoped. Per-tenant branding is conceptually in place (`tenants.logo_url`, `tenants.primary_color`) but not yet wired in the UI.

## Market edge

- 9-stage production workflow: `deposit_received → design_approved → cutting → assembly → finishing → quality_check → ready_for_pickup → delivered → completed` (`src/lib/stages.ts`).
- Config-driven pricing DSL — admins tune formulas via JSON in `/admin/pricing-rules`.
- Unified PLC ID threading quote → invoice → order without renumbering on conversion.