# 5. Core Components

## 5.1 Pricing engine — `src/lib/pricing.ts`, `src/lib/pricing/engine.ts`

Two engines coexist:

### `calculateLine` + `calculateQuoteTotals` — classic deterministic
- **Inputs**: base, dimension (m² or linear m), qty, material rate per unit, finish pct/fixed modifiers, accessories total, labor / wastage / overhead / margin %.
- **Output labels**: `baseCost`, `materialCost`, `finishCost`, `accessoriesCost`, `subtotalBeforeOverhead`, `laborAmount`, `wastageAmount`, `overheadAmount`, `marginAmount`, `unitPrice`, `lineTotal`.
- **Discount**: percentage or fixed + `max_value` cap.
- **VAT**: default 14%.

### `runFormula(formula, selections, factors, ruleVersion)` — JSON-DSL interpreter
- Steps: `add (which bucket)`, `snapshot (label)`, `mul_pct (factor key, against snapshot or running, ?add)`.
- Default formula archives labor/wastage/overhead/margin + luxury/complexity/rush as optional per-item overrides.
- Rule versions are immutable; each quote pins the rule version it priced against.

### `formatEGP(n)`
Always `Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 })`.

## 5.2 Order workflow machine — `src/routes/admin/orders.tsx`, `src/lib/stages.ts`

```
deposit_received → design_approved → cutting → assembly → finishing → quality_check → ready_for_pickup → delivered → completed
```

- `nextStage(s)` returns null at the last stage.
- **QC gate**: `canAdvance(order)` requires a passing `qc_inspections` row for `quality_check`, otherwise UI shows toast error `orders.advanceGate`.
- **Worker assignments**: tracked per stage — `pending → in_progress → completed`. Each assignment carries `started_at` + `finished_at`.
- **Advance side-effects**:
  - Insert `production_logs` row.
  - Optionally send `notify({ data: { event, entityType:'order', entityId, extra } })` via `sendNotification`.
  - If `next === 'delivered'`, stamp `delivered_at` on the order.

## 5.3 Generic CRUD widget — `src/components/admin/GenericCrud.tsx`

- Bypass tables route through service-fns → `supabaseAdmin` (RLS bypass). `TABLES_WITH_BYPASS` = product_templates, materials, suppliers, finishes, veneers, accessories, pricing_factors, wastage_rules, pricing_rules, workers, discounts.
- **Hooks are unconditionally allocated**: every bypass table's `useServerFn` is called every render. The source comment warns "conditional hook allocation flips hook order across renders and crashes Dialog mounts."
- **Field guard**: `PROTECTED_INSERT_FIELDS` (id, tenant_id, created_at, updated_at) are filtered before saving.
- `auth.loading` gates render so the table never flashes before tenant is resolved.

## 5.4 Photo upload pipeline — `src/components/photo-uploader.tsx`, `src/components/photo-grid.tsx`, `src/lib/useSignedR2Urls.ts`

```
UI PhotoUploader.handlePick(files)
  → getR2BatchUploadUrls({ files, entityType:'production-photos', entityId:orderId })
    ← server signs each; returns { uploads: [{key, uploadUrl, publicUrl?}] }
  → probePreflight(uploadUrl)        // real OPTIONS preflight, raises on 4xx
  → fetch(uploadUrl, { method:'PUT', body, headers:{ Content-Type } })
[Browser] supabase.from('production_photos').insert(rows)
```

- `probePreflight` exists because HEAD on a signed-PUT URL is a CORS *simple* request (no preflight, no Content-Type/Authorization headers). With OPTIONS, real CORS failure surfaces.
- `useSignedR2Urls(urls[])` keys cache by sorted-joined URL list, `staleTime = 25min`, `gcTime = 30min`. 25-min is matched to the signed URL TTL; gc 30 is the safety margin.
- `PhotoGrid` groups by `ORDER_STAGES` order.

## 5.5 Auth pipeline — `src/lib/useAuth.tsx`, `src/lib/auth.functions.ts`, `src/routes/auth.tsx`

- **Username login**: `proxyEmailFor(username) = ${username}@pelecanon.local` (RFC-compatible synthetic email so Supabase Auth still has a unique `auth.users.email` while the UI shows only a username).
  - Username regex: `/^[a-z0-9._-]+$/i`, min 3, max 32.
- **First login**: `ensureBootstrapAdmin` server fn creates the `pelecanon` tenant + `admin/admin` user with the `owner` tenant role if missing.
- **After login**: client calls `setSession({access_token, refresh_token})` → `onAuthStateChange` fires → bootstrap call.
- **Bootstrap race protection**: `bootstrappedForRef` (UID) + `bootstrapTokenRef` (counter). Bootstrap runs once per user. If it fails, UI shows `bootstrapFailed` panel with a Retry button.
- 6 admin flows under `/admin/team`: `createAppUser`, `listAppUsers`, `setUserStatus(active|disabled)`, `resetUserPassword`, `updateUserAvatar`, `getCurrentUser`.

## 5.6 Tenant context — `src/lib/tenant-context.ts`

- `TenantRole = 'owner' | 'admin' | 'sales' | 'worker' | 'viewer'`.
- `canWrite(role)` → owner/admin/sales.
- `canDelete(role)` → owner/admin only.
- `TenantContext = { userId, tenantId, role }`.

## 5.7 Multi-tenant server functions

- Catalog fns bypass RLS through `supabaseAdmin` (`src/lib/catalog.functions.ts`).
- Server fns that must respect RLS use `supabase` injected by `requireSupabaseAuth` middleware.
- `resolveTenantId(userId)` helper in `src/lib/attachments.functions.ts` reads `tenant_members.tenant_id` ordered by `created_at` asc (canonical "first tenant" semantics).