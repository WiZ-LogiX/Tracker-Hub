# 14. Design Decisions

## 14.1 Username + synthetic email
**Where:** `src/lib/auth.functions.ts:64-66` (`proxyEmailFor`).
> "The cleanest way to swap email login for username login without a multi-week edge-function rewrite is to treat `<username>@pelecanon.local` as the canonical email shape — the user never sees it."

## 14.2 No `<Database>` generic on Supabase clients
**Where:** `src/integrations/supabase/client.ts`.
> "The previous `<Database>` constraint was causing every `.from('tablename')` chain to collapse to `never` because the placeholder Database type (which can't be regenerated without the Supabase CLI) doesn't fully match the shape PostgREST's generic resolution requires."

Solution: omit the generic; keep `types.ts` as a PostgREST-compatible stub until `npx supabase gen types typescript --linked` runs.

## 14.3 Service-role bypass for catalog tables
**Where:** `src/lib/catalog.functions.ts`.
> "Several catalog tables (product_templates, materials, suppliers, ...) have Phase 1 RLS policies that the admin role can't satisfy through PostgREST — reads return 0 rows. Until those policies are loosened server-side, these fns route reads & writes through `supabaseAdmin` which bypasses RLS entirely."

Acceptable until the policies catch up (a Phase 2 task).

## 14.4 OPTIONS preflight over HEAD
**Where:** `src/components/photo-uploader.tsx:55+` (`probePreflight`).
> "HEAD on a signed-PUT URL is a CORS *simple* request — browsers don't preflight it and don't send Content-Type/Authorization, so it succeeds even when the PUT that follows would be blocked."

`Access-Control-Request-Method: PUT` triggers the real preflight that mirrors what the browser will issue.

## 14.5 `tenant_id` prefix on R2 keys
**Where:** `src/lib/r2.server.ts`, `src/lib/r2.functions.ts`.
> "tenant scoping is the primary isolation boundary; never bypass it."

`deleteR2Object` and `getR2DownloadUrl` enforce a `${session.tenantId}/` prefix check as defense-in-depth.

## 14.6 Single-source pricing
**Where:** `src/lib/pricing.ts`.
> "Centralized pricing engine — single source of truth. All formula logic lives here, NOT scattered across components."

README echoes this.

## 14.7 Dynamic import of `@tanstack/react-start/server-entry`
**Where:** `src/server.ts:14`.
- Enables a graceful SSR error path before the fully-typed runtime is available.

## 14.8 Append-only audit / notifications tables
- `.lovable/STATUS.md` + migrations restrict `notification_log` + `audit_log` against UPDATE/DELETE.
- Reduced audit surface, but also means corrections must be a new row.

## 14.9 PLC ID lifecycle
**Where:** `src/lib/numbering.ts`, `src/lib/order.functions.ts`, `src/lib/invoice.functions.ts`.
- Quote generates a PLC ID, passes it into both `createInvoiceFromQuote` and `createOrder` so the unified number threading holds (no renumber on conversion).

## 14.10 Server functions over separate API routes
- `createServerFn` avoids a parallel REST layer.
- `useServerFn` + TanStack Query gives type-safe client SDK + cache + retries for free.
- Tradeoff: harder to debug from outside because there's no open Swagger.