# 3. Architecture

## 3.1 High-level shape

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers (SSR + Edge)                      │
│  src/server.ts (entry), src/start.ts (TanStack Start config)         │
│  ┌─────────────────┐     ┌───────────────────────────────────────┐    │
│  │  TanStack Router │ →   │  Server Functions (createServerFn)   │    │
│  │  routes/admin/*  │     │  src/lib/*.functions.ts               │    │
│  └─────────────────┘     │  middleware: requireSupabaseAuth      │    │
│                          └───────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Drizzle ORM (declared) / Supabase client (actual reads)     │    │
│  │  src/db/schema.ts (only `attachments` typed today)            │    │
│  │  src/db/client.server.ts (portable `postgres-js` driver)      │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────┐   ┌───────────────────────────────────┐   │
│  │ Supabase Auth + Postgres│   │ Cloudflare R2 (S3-compatible)     │   │
│  │ src/integrations/...    │   │ src/lib/r2.server.ts              │   │
│  └─────────────────────────┘   │ presigned PUT (avatars, attach.)  │   │
│                                 │ presigned GET (signedUrl 25min)   │   │
│                                 └───────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                         │
                          ┌──────────────┴────────────────┐
                          ▼                                ▼
                  Customer browser                 Admin browser (Arabic RTL)
              /track?ref=ORD-XXX                       /admin/* (auth gated)
```

## 3.2 Request lifecycle

1. Edge request → `src/server.ts` (Cloudflare Workers entry).
   - `getServerEntry()` dynamically imports `@tanstack/react-start/server-entry` (cached).
   - `normalizeCatastrophicSsrResponse()` swaps the h3 swallowed-error body (`{"unhandled":true,"message":"HTTPError","status":500}`) for a branded `renderErrorPage()`. The real `Error` is preserved by `src/lib/error-capture.ts` (globalThis `error` + `unhandledrejection` listeners, 5-sec TTL ring buffer).

2. TanStack Start middleware (`src/start.ts`):
   - `errorMiddleware` — catches remaining errors → branded HTML.
   - `csrfMiddleware` — CSRF only for `handlerType === "serverFn"`.
   - `attachSupabaseAuth` — `functionMiddleware` (client-side attacher) sets `Authorization: Bearer <token>` on every server-fn RPC (`src/integrations/supabase/auth-attacher.ts`).

3. Server functions attach `.middleware([requireSupabaseAuth])` from `src/integrations/supabase/auth-middleware.ts`. The middleware reads the bearer, calls `supabase.auth.getClaims(token)`, and exposes `context = { supabase, userId, claims }`. Missing/invalid token throws a string error.

4. Data access paths:
   - **Browser**: `supabase.from(...)` (RLS-enforced, `src/integrations/supabase/client.ts`).
   - **Server (admin)**: `supabaseAdmin.from(...)` (service-role, RLS bypass, `src/integrations/supabase/client.server.ts`).
   - **Server (RLS)**: middleware-injected `supabase`.

## 3.3 Multi-tenant data path

- RLS policy functor: `is_tenant_member(_tenant_id uuid, _roles tenant_role[])` (SECURITY DEFINER, `search_path=public`, `supabase/migrations/20260612_tenancy_v1.sql`).
- Every business table has `tenant_id uuid NOT NULL` + immutability trigger.
- Application glue: `src/lib/tenant-context.ts` exposes `TENANT_ROLES`, `canWrite(role)`, `canDelete(role)`, `requireRole(ctx, allowed)`.
- Drizzle schema mirror: `src/db/tenancy-schema.ts` for `tenants` + `tenant_members`.
- Note from `.lovable/STATUS.md`: legacy `user_roles` is dropped; `useAuth.tsx` queries `tenant_members` directly.