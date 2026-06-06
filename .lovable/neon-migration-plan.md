# PeleCanon → Neon Migration Plan

**Status:** In progress. Phase 1 partially complete. Decisions locked in by the team:
- Auth: **admin-created username/password only**. No Google OAuth, no self-signup.
- Storage: **Cloudflare R2** (bucket `pelecanon`, eu).
- DB: **Neon** via `@neondatabase/serverless` HTTP driver (Cloudflare Workers can't reliably hold raw TCP to Neon's pooler).

---

## Progress log

- [x] Neon project provisioned; `DATABASE_URL` secret set.
- [x] `@neondatabase/serverless` installed.
- [x] Health check at `/admin/db-check` returns `ok: true` (PostgreSQL 18.4, db `neondb`).
- [x] Drizzle schema (`src/db/schema.ts`) mirrors current Supabase public schema.
- [x] Portable client stub at `src/db/client.server.ts` (currently uses `postgres` package — must be swapped to `drizzle-orm/neon-http`).
- [ ] Replay schema into Neon.
- [ ] Swap `client.server.ts` to neon-http Drizzle adapter.
- [ ] Replace Supabase auth with admin-managed credential auth.
- [ ] Wire R2 for file storage.
- [ ] Migrate data.
- [ ] Rewrite data access (Supabase client → Drizzle server functions).
- [ ] Cut over.

---

## Phase 1 — Foundation

1. [x] Provision Neon + add `DATABASE_URL`.
2. [ ] **Replay schema into Neon.** Options:
   - **A)** Assistant introspects Supabase via `read_query` and rebuilds CREATE statements (slower, AI-driven).
   - **B)** User runs `pg_dump --schema-only --schema=public --no-owner --no-privileges` against Supabase and pastes the SQL (faster, more accurate).
   - **Awaiting user choice.**
3. [ ] Strip Supabase-specific bits before applying: `auth.uid()` defaults, `auth.users` FK on `profiles`, RLS policies, `GRANT`s, `app_role`/`has_role` (auth handled at app layer now).
4. [ ] Replace `src/db/client.server.ts` with `drizzle-orm/neon-http`:
   ```ts
   import { neon } from "@neondatabase/serverless";
   import { drizzle } from "drizzle-orm/neon-http";
   const sql = neon(process.env.DATABASE_URL!);
   export const db = drizzle(sql, { schema });
   ```
5. [ ] Run `drizzle-kit pull` against Neon to verify schema matches.

**Acceptance:** `select count(*)` returns 0 on every Neon table and matches the expected table list from `src/db/schema.ts`.

---

## Phase 2 — Auth replacement (admin-managed credentials)

**Scope change vs. original plan:** no Google OAuth, no self-signup, no password reset flow needed initially. Admin creates users; users log in with username + password.

1. [ ] Add tables in Neon:
   - `auth_users` (id uuid pk, username text unique, password_hash text, display_name, role text, tenant_id uuid, active bool, created_at, last_login_at)
   - `auth_sessions` (id, user_id, token_hash, expires_at, created_at, ip, user_agent)
2. [ ] Add server functions in `src/lib/auth.functions.ts`:
   - `login({ username, password })` → verifies bcrypt hash, issues session cookie (httpOnly, secure, sameSite=lax).
   - `logout()` → invalidates session.
   - `getCurrentUser()` → reads cookie, returns user or null.
   - `adminCreateUser({ username, password, displayName, role })` → gated to admin role.
   - `adminResetPassword({ userId, newPassword })` → gated to admin role.
3. [ ] Write `requireAuth` middleware for server functions (replaces `requireSupabaseAuth`).
4. [ ] Rewrite `src/lib/useAuth.tsx` to call the new server functions instead of `supabase.auth`.
5. [ ] Rewrite `src/routes/auth.tsx` — remove Google button, remove signup tab. Login form only.
6. [ ] Add `/admin/users` page for the admin to create/disable users and reset passwords.
7. [ ] Seed the first admin via a one-off server function or migration script (assistant will prompt user for initial credentials).

**Libraries:** `bcryptjs` (pure JS, Workers-safe), `nanoid` for session tokens. No Better-Auth/Lucia — overkill for the simple admin-managed model the user wants.

**Acceptance:** Admin can create a user; that user can log in; protected routes redirect unauthenticated visitors to `/auth`.

---

## Phase 3 — R2 storage

R2 credentials already provided and stored as secrets:
- `R2_ACCOUNT_ID`, `R2_BUCKET=pelecanon`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

1. [ ] Add `src/lib/r2.server.ts` using `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` pointed at `https://<account>.r2.cloudflarestorage.com`.
2. [ ] Server function `getUploadUrl({ key, contentType })` → presigned PUT URL.
3. [ ] Server function `getDownloadUrl({ key })` → presigned GET URL (or public URL if bucket made public).
4. [ ] Update `productionPhotos` flow to upload to R2 and store the key in `photo_url`.
5. [ ] Migrate existing files from Supabase Storage `production-photos` + `tenant-logos` → R2 (one-off script).

**Acceptance:** New photo uploads land in R2; old photos still display via migrated URLs.

---

## Phase 4 — Data access rewrite

1. [ ] Build `tenantDb()` helper: returns Drizzle client bound to `auth.tenantId` from session; throws if missing.
2. [ ] Rewrite `supabase.from(...)` calls module by module as server functions:
   customers → quotes → quote_items → invoices → orders → production → workers → QC → remakes → admin CRUDs → notifications.
3. [ ] Each server function does explicit `where(eq(table.tenantId, ctx.tenantId))` — RLS is gone, this is now the only barrier.
4. [ ] Drop `src/integrations/supabase/` imports as modules are migrated.

**Acceptance:** No `import ... from "@/integrations/supabase/client"` remains in `src/`.

---

## Phase 5 — Data migration & cutover

1. [ ] `pg_dump --data-only --schema=public` from Supabase → apply to Neon. Verify row counts.
2. [ ] Flip app to Neon (already on Neon for new code by this point; this just confirms data parity).
3. [ ] Keep Supabase project paused for 30 days as rollback.
4. [ ] Delete Supabase project.

---

## Risks (current)

- **Tenant leakage.** RLS is gone after Phase 4. Every server function must include the tenant filter. Code review discipline required.
- **Password hash storage.** Use bcrypt with cost ≥ 10. Never log passwords.
- **Session cookies on Workers.** Set `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. Rotate session token on privilege change.
- **R2 public access.** Default to private + presigned URLs; only make the bucket public if production photos are intentionally public.

---

## Open questions for the user

1. Schema replay: **Option A (assistant introspects) or B (user runs `pg_dump`)?**
2. Initial admin credentials: what username + password should we seed?
3. R2 bucket: keep private (presigned URLs) or make public-read for photos?
