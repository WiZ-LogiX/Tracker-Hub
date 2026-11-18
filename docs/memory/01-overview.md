# 1. Project Overview

## Product

**PeleCanon** is a multi-tenant SaaS for **furniture pricing, quotation, project workspaces, and production tracking**, focused on the Egyptian market (Arabic-first + RTL, EGP currency, 14% VAT).

## Lifecycle of an order

```
Catalog
  → Commercial Quote (/admin/quotes/new)
    → Project Workspace (/admin/projects/$id)
      → Invoice & Ledger (PLC-XXXXX)
        → Production Order (9-stage workflow with photo logs, worker assignments, QC)
          → Delivery Handover (DEL-XXXXX)
            → Customer-facing tracking page (`/track?ref=…`)
              → Customer notifications (WhatsApp via n8n webhook)
```

## Identity anchor

A unified **`PLC-XXXXX`** ID (5 alphanumeric chars) ties Quote → Project (`PRJ-XXXXX`) → Invoice (`PLC-XXXXX`) → Order (`PLC-XXXXX`) → Delivery (`DEL-XXXXX`). Generated client-side in `src/lib/numbering.ts` via `generatePLCId()` and server-side in `src/lib/quote.functions.ts`.

## Current architectural posture

| Phase | Scope | State |
|---|---|---|
| 0 | Bootstrap (Stack + UI + i18n + Emerald Prestige Palette) | ✅ 100% |
| 1 | Multi-tenant Postgres + RLS (34 tables in Drizzle ORM) | ✅ 100% |
| 2 | Unified Dynamic RBAC (3-state resolver, client-safe bundling, fail-close auth) | ✅ 100% |
| 3 | Cloudflare R2 storage (presigned uploads + 10-min customer signed URL TTL) | ✅ 100% |
| 4 | Commercial Quotation Engine & Canonical PLC-XXXXX Standardization | ✅ 100% |
| 5 | Operational Workflows, Project Entity, Customer 360, & Deterministic E2E Tests | ✅ 100% |

> The full stack is production-verified with 1,073 Vitest tests (100% pass) and 165 Playwright E2E tests (100% pass) against `localhost:5433/pelecanon_test`.
