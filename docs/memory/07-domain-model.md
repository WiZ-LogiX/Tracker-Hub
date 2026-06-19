# 7. Domain Model

> Schema reconstructed from `supabase/migrations/`. Some migrations are excluded from serialization by Lovable (marked "File contents excluded from context"); the structural intent is below.

## 7.1 Authentication tables (legacy Supabase)

- `auth.users` — Supabase-managed. RLS never on the auth schema.
- `app_users` (added in `20260613_username_avatars_v1.sql`):
  - `id uuid PK` (== `auth.users.id`)
  - `tenant_id uuid`
  - `username text` (intended unique-per-tenant — see [16-future.md](./16-future.md))
  - `display_name`, `avatar_key`
  - `status active|disabled`
  - `created_at`

> The original approach rotated through `user_roles` (admin) before being deprecated. `useAuth.tsx` no longer queries `user_roles`.

## 7.2 Tenancy tables (Phase 1+)

**`tenants`** (`src/db/tenancy-schema.ts`, `supabase/migrations/20260612_tenancy_v1.sql`):
```
id uuid pk
slug text unique
name
logo_url, primary_color
tax_number, commercial_registry
address, phone, email
currency default 'EGP'
tax_rate default 14
plan default 'free'
status default 'active'
created_at, updated_at
```

**`tenant_role` enum**: `owner | admin | sales | worker | viewer`.

**`tenant_members`**:
```
id uuid pk
tenant_id uuid NOT NULL FK→tenants(id) cascade
user_id uuid NOT NULL FK→auth.users(id) cascade
role tenant_role default 'viewer'
created_at
```

**Helper UDF**: `is_tenant_member(_tenant_id uuid, _roles tenant_role[]) RETURNS boolean` — `SECURITY DEFINER`, `search_path=public`. Backs every RLS policy.

## 7.3 Business tables (~33 total, all `tenant_id NOT NULL` after Phase 1)

| Group | Tables |
|---|---|
| Customers | `customers` |
| Catalog | `categories`, `materials`, `suppliers`, `finishes`, `veneers`, `accessories`, `material_variants` |
| Products | `products`, `product_templates` |
| Pricing config | `pricing_factors`, `pricing_rules`, `wastage_rules`, `discounts` |
| Quotation/Order | `quote_requests`, `quotes`, `quote_items`, `configurations`, `invoices`, `orders` |
| Production | `production_logs`, `production_assignments`, `qc_inspections`, `production_photos`, `remakes` |
| Extras | `workers`, `internal_notes`, `attachments` |
| Notifications | `notification_templates` (UNIQUE tenant-scoped), `notification_log` |
| Audit | `audit_log` |

Per-column shapes (abridged; full list in `tests/rls.test.ts` fixture for `customers` + `orders`):

- `quotes(status)` ∈ `draft | sent | accepted | rejected | converted | expired`
- `production_assignments.status` ∈ `pending | in_progress | completed`
- `production_logs.transitioned_at`, `production_photos.created_at`, `notifications_log.event` etc.

## 7.4 Constraints and triggers (Phase 1)

- `tenant_id NOT NULL` on every business table after sentinel backfill.
- `idx(tenant_id)` + `idx(tenant_id, created_at)` on every business table.
- **Tenant immutability trigger** on `tenant_id` (UPDATE blocked) — `.lovable/plan.md`.
- RLS policies:
  - SELECT: `USING(is_tenant_member(tenant_id, ARRAY[...]))`
  - INSERT/UPDATE: `WITH CHECK(is_tenant_member(...))`
  - DELETE: `USING(is_tenant_member(...) AND role IN ('owner','admin'))`
- `companies` + `default_company_id()` dropped (`20260612_tenancy_v1_drop_company_*.sql`).
- `internal_notes`, `notification_log`, `audit_log` block UPDATE/DELETE (append-only).

## 7.5 Drizzle mirror (today)

- `src/db/schema.ts` — **only** `attachments` typed.
- `src/db/tenancy-schema.ts` — `tenants`, `tenant_members`.

The rest of the schema does **not** exist yet in Drizzle, contrary to the doc claim that "Drizzle schema … is the source of truth." This is Phase 4 work.