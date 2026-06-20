# Security: Tenant Isolation & `supabaseAdmin` Usage

This document records all remaining `supabaseAdmin` usages and the justification for each.

## Summary

- **`supabaseAdmin`** is a service-role client that **bypasses RLS**.
- All business-logic server functions now use `requireTenant` middleware + explicit `.eq('tenant_id', ctx.tenantId)` filters as defense-in-depth.
- `setTenantGuc(tenantId)` sets Postgres GUC `app.tenant_id` for future RLS GUC compatibility.

## Files with `supabaseAdmin` — Tenant-Scoped

These files use `supabaseAdmin` but apply `requireTenant` middleware + `.eq('tenant_id')` on every query:

| File | Functions | Notes |
|------|-----------|-------|
| `src/lib/catalog.functions.ts` | 27 | Materials, finishes, veneers, suppliers, discounts, accessories — all CRUD |
| `src/lib/pricing-factors.functions.ts` | 3 | Pricing rules, formulas, factors |
| `src/lib/auth.functions.ts` | 20+ | User/role/permission management — resolves tenant from auth session |
| `src/lib/order.functions.ts` | 10+ | Order creation/management — uses `requireTenant` |
| `src/lib/invoice.functions.ts` | 5+ | Invoice generation — uses `requireTenant` |
| `src/lib/notifications.functions.ts` | 5+ | Notification management — uses `requireTenant` |
| `src/lib/attachments.functions.ts` | 5+ | File attachment — resolves tenant from user |

## Files with `supabaseAdmin` — Intentionally Unscoped

| File | Justification |
|------|---------------|
| `src/lib/tracking.functions.ts` | **Public, unauthenticated** endpoints for order tracking. No tenant_id — customer-facing. |
| `src/lib/bootstrap-tenant.functions.ts` | **Tenant provisioning** — creates new tenants. Global op, no existing tenant context. |
| `src/lib/apply-migration.functions.ts` | **DB migration tool** — applies SQL migrations. Dev/ops tool, not business logic. |
| `src/lib/cleanup.functions.ts` | **Dev cleanup** — removes test data. Local dev tool only. |
| `src/lib/diagnostics-db.functions.ts` | **Diagnostics** — reads `information_schema`. Read-only, no tenant data. |

## Why `supabaseAdmin` Instead of RLS?

Catalog tables (materials, finishes, veneers, suppliers, etc.) have restrictive RLS policies that prevent admin roles from accessing them through PostgREST. The service-role client bypasses these restrictions while app-layer `.eq('tenant_id')` provides the isolation guarantee.

## Security Model

```
┌─────────────────────────────────────────┐
│  Client (browser)                       │
│  → Bearer token in header               │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  auth-middleware.ts                      │
│  → requireSupabaseAuth                  │
│  → Validates JWT, sets userId           │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  tenant-middleware.ts                    │
│  → requireTenant                        │
│  → Resolves tenant_id from tenant_members│
│  → Sets role from tenant_members        │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Business logic (e.g. catalog.functions) │
│  → setTenantGuc(tenantId)               │
│  → .eq('tenant_id', ctx.tenantId)       │
│  → All queries scoped to tenant         │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  RLS policies (defense-in-depth)        │
│  → Current: mostly permissive           │
│  → Future: GUC-based tenant isolation   │
└─────────────────────────────────────────┘
```

## Last Updated
2026-06-20
