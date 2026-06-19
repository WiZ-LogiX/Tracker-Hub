# 8. API Surface

> There are no REST/GraphQL routes. The API is `createServerFn` handlers in `src/lib/*.functions.ts`. They're consumed via `useServerFn(fn)` + TanStack Query.

## 8.1 Server function reference

| Server fn | File | Auth | Purpose |
|---|---|---|---|
| `checkNeonConnection` | `db-health.functions.ts` | — | DB ping (diagnostic) |
| `applyWastageRulesMigration` | `apply-migration.functions.ts` | requireSupabaseAuth + owner/admin | Apply pending schema fix |
| `getPublicOrder({orderNumber, phone})` | `tracking.functions.ts` | — | Public tracking lookup (requires phone match) |
| `getPublicOrdersByPhone({phone})` | `tracking.functions.ts` | — | List orders for last-9 of phone |
| `getPublicTrackingByRef({reference})` | `tracking.functions.ts` | — | Lookup by ref across order/quote/invoice/quote_request |
| `sendTestNotification({phone,message})` | `notifications.functions.ts` | requireSupabaseAuth | Smoke-test n8n path |
| `sendNotification({event, entityType, entityId, extra?,language?})` | `notifications.functions.ts` | requireSupabaseAuth | Render template + dispatch + log |
| `createOrder({quoteId?, invoiceId?, customerId, plcId?})` | `order.functions.ts` | requireSupabaseAuth | Create order, fills quote field |
| `createInvoiceFromQuote({quoteId, customerId, plcId?})` | `invoice.functions.ts` | requireSupabaseAuth | Invoice + status flip on quote |
| `ensureBootstrapAdmin` | `auth.functions.ts` | — | Provision `pelecanon` tenant + `admin/admin` |
| `login({username, password})` | `auth.functions.ts` | — | Sign in via synthetic email |
| `logout` | `auth.functions.ts` | — | Kill session |
| `getCurrentUser` | `auth.functions.ts` | reads bearer | Resolve caller + profile |
| `createAppUser({username, displayName, password, role})` | `auth.functions.ts` | owner/admin | Provision user (+ `tenant_members`) |
| `listAppUsers` | `auth.functions.ts` | — (caller-gated in page) | Admin reads |
| `setUserStatus({userId, status})` | `auth.functions.ts` | — | Disable/activate |
| `resetUserPassword({userId, newPassword})` | `auth.functions.ts` | — | Admin reset |
| `updateUserAvatar({userId, avatarKey})` | `auth.functions.ts` | — | R2 key persistence |
| `listProductTemplates` / `upsert...` / `delete...` | `catalog.functions.ts` | requireSupabaseAuth | service-role catalog |
| `listMaterials` / `upsertMaterial` / `deleteMaterial` / `getMaterialWastage` | `materials.functions.ts` | requireSupabaseAuth | RLS-friendly materials API |
| (analogous) `listSuppliers`, `listFinishes`, `listVeneers`, `listAccessories`, `listDiscounts`, `listWorkers`, `listWastageRules`, `listPricingRules` | `catalog.functions.ts` | requireSupabaseAuth | service-role catalog |
| `listPricingFactors` / `upsert...` / `delete...` | `pricing-factors.functions.ts` | requireSupabaseAuth | service-role `pricing_factors` |
| `ensurePricingSetup` | `seed.functions.ts` | requireSupabaseAuth | Idempotent bootstrap pricing |
| `seedSampleData` | `seed.functions.ts` | requireSupabaseAuth | Heavy sample-data seeder |
| `bootstrapMyTenant({role?})` | `bootstrap-tenant.functions.ts` | requireSupabaseAuth | Self-heal tenant membership |
| `getR2UploadUrl({filename, contentType, entityType, entityId})` | `r2.functions.ts` | tenant session | One PUT URL |
| `getR2BatchUploadUrls({files[], entityType, entityId})` | `r2.functions.ts` | tenant session | Up to 20 PUT URLs |
| `getR2DownloadUrl({key})` | `r2.functions.ts` | tenant + key-prefix match | Signed GET |
| `deleteR2Object({key})` | `r2.functions.ts` | tenant + prefix match | Object delete |
| `getR2ViewUrls({urls[]})` | `r2-views.functions.ts` | requireSupabaseAuth | Bulk sign for photo grid |
| `listAttachments({entityType, entityId})` | `attachments.functions.ts` | requireSupabaseAuth + tenant | List attachments |
| `registerAttachment({...})` | `attachments.functions.ts` | requireSupabaseAuth + tenant | Insert after PUT |
| `deleteAttachment({id})` | `attachments.functions.ts` | requireSupabaseAuth + tenant | Row + R2 cleanup |
| `getAttachmentUrl({id})` | `attachments.functions.ts` | requireSupabaseAuth + tenant | Public or signed URL |
| `generatePLCNumber({type})` | `plc.functions.ts` | — | Date-stamped PLC for new doc |
| `getTableCounts` / `getMemberships` / `getTenants` / `getAuthUsers` | `diagnostics-db.functions.ts` | — (admin-gated in page) | Operator probes |

## 8.2 Supabase Edge Functions

- `migrate-helper` (`supabase/functions/migrate-helper/index.ts`) — protected by `X-Access-Key: <32-hex>`. Actions: `ping` (DB probe) and `info` (env presence). Build-gated by `BUILD_ID = "2026-03-04"`.

## 8.3 Patterns

- **Auth-gated reads**: `requireSupabaseAuth` middleware exposes `context.supabase`. The fn calls `.from(...)` against that client; RLS passes or rejects.
- **Service-role reads**: catalog + diagnostics use `supabaseAdmin` directly to bypass RLS when policies can't satisfy PostgREST chains.
- **Tenant-scoped reads**: explicitly `.eq("tenant_id", tenantId)` against the caller-resolved tenant — the pattern used in `attachments.functions.ts` against `supabaseAdmin`.
- **Mutation cleanup**: order/invoice fns intentionally do not wrap in transactions; a mid-failure leaves a partial chain (see [15-debt.md](./15-debt.md)).