# 3. Architecture

## 3.1 High-level shape

```text
┌──────────────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers (SSR + Edge)                      │
│  src/server.ts (entry), src/start.ts (TanStack Start config)         │
│  ┌─────────────────┐     ┌───────────────────────────────────────┐    │
│  │  TanStack Router │ →   │  Server Functions (createServerFn)   │    │
│  │  routes/admin/*  │     │  src/lib/*.functions.ts               │    │
│  └─────────────────┘     │  middleware: requireSupabaseAuth      │    │
│                          └───────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Drizzle ORM (34 tenant-scoped tables fully typed)           │    │
│  │  src/db/schema.ts                                             │    │
│  │  src/db/client.server.ts (portable `postgres` driver)         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────┐   ┌───────────────────────────────────┐   │
│  │ Supabase Auth + Postgres│   │ Cloudflare R2 (S3-compatible)     │   │
│  │ src/integrations/...    │   │ src/lib/r2.server.ts              │   │
│  └─────────────────────────┘   │ presigned PUT (direct uploads)    │   │
│                                 │ presigned GET (10min bounded TTL) │   │
│                                 └───────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                         │
                          ┌──────────────┴────────────────┐
                          ▼                                ▼
                  Customer browser                 Admin browser (Arabic RTL)
              /track?ref=ORD-XXX                       /admin/* (auth gated)
```

## 3.2 Request lifecycle

1. **Edge request** → `src/server.ts` (Cloudflare Workers entry):
   - `getServerEntry()` dynamically imports `@tanstack/react-start/server-entry` (cached).
   - `normalizeCatastrophicSsrResponse()` swaps swallowed error bodies for a branded `renderErrorPage()`. Real errors are preserved by `src/lib/error-capture.ts`.

2. **TanStack Start middleware** (`src/start.ts`):
   - `errorMiddleware`: catches remaining errors → branded HTML.
   - `csrfMiddleware`: CSRF enforcement for `handlerType === "serverFn"`.
   - `attachSupabaseAuth`: client-side function middleware injecting `Authorization: Bearer <token>` on every server-fn RPC.

3. **Server function authentication & tenancy** (`src/integrations/supabase/auth-middleware.ts` & `tenant-middleware.ts`):
   - `requireSupabaseAuth`: validates JWT, exposes `{ supabase, userId, claims }`. Mock bearer tokens (`mock-...`) are strictly fail-close, permitted only in development or test runtimes.
   - `requireTenant`: resolves active tenant membership from `tenant_members`, attaches `tenantId`, sets session GUC via `setTenantGuc(tenantId)`.

4. **Authorization & RBAC**:
   - Resolved via 3-state permission engine (`src/lib/tenant-context.ts`).
   - Granular checks (`requirePermission`, `requireAnyPermission`) guard all 22 administrative sections.
   - UI permission constants isolated in client-safe `src/lib/tenant-permissions-data.ts`.

5. **Data access**:
   - Primary: Drizzle ORM queries via `src/db/schema.ts` (34 tables) and `requireTenant` client.
   - Unauthenticated: Hardened public tracking (`/track`) via `orders.tracking_token` UUID lookups.

## 3.3 Multi-tenant data path

- RLS policy functor: `is_tenant_member(_tenant_id uuid, _roles tenant_role[])` (SECURITY DEFINER, `search_path=public`).
- Every business table enforces `tenant_id uuid NOT NULL` + immutability trigger.
- Application glue: `src/lib/tenant-context.ts` resolves user roles, effective permissions, and cache invalidation.
