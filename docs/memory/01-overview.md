# 1. Project Overview

## Product

**PeleCanon** is a multi-tenant SaaS for **furniture pricing, quotation, and production tracking**, focused on the Egyptian market (Arabic-first + RTL, EGP currency, 14% VAT).

## Lifecycle of an order

```
Catalog
  → Quote (draft / sent / accepted / rejected / converted)
    → Invoice (paid / unpaid)
      → Production Order (9-stage workflow with photo logs, worker assignments, QC)
        → Customer-facing tracking page (`/track?ref=…`)
          → Customer notifications (WhatsApp via n8n webhook)
```

## Identity anchor

A unified **`PLC-XXXXX`** ID (5 random alphanumeric chars) ties Quote → Invoice → Order. Generated:

- Client-side in `src/lib/numbering.ts` via `generatePLCId()`.
- Server-side in `src/lib/plc.functions.ts` via the `generatePLCNumber` server fn (different shape — date-stamped).

## Current architectural posture

| Phase | Scope | State |
|---|---|---|
| 0 | Bootstrap (Stack + UI + i18n) | ✅ 100% |
| 1 | Multi-tenant Postgres + RLS | ✅ 100% |
| 2 | Server-side tenancy (middleware + Drizzle) | 🚧 ~10% (DB wired; app not yet) |
| 3 | Cloudflare R2 storage | ✅ ~90% (server + presigned flows done; CORS pending) |
| 4 | Quotation Engine | ✅ 100% |
| 5 | Production Tracking | ✅ 100% |

> The DB layer has been cut to multi-tenant; the application code still leans on Supabase client. See `docs/memory/15-debt.md` for known issues.