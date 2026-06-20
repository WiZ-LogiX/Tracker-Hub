# 9. Authentication & Authorization

## 9.1 Provider

- **Supabase Auth** with email/password only.
- **Google OAuth is explicitly disabled** — username + password only by design.
- **No self-signup.** Admin creates accounts under `/admin/team`. The username/password model is part of the Phase 7 decision lock.

## 9.2 Synthetic email pattern

```
proxyEmailFor(username) = `${username.toLowerCase()}@pelecanon.local`
```

This is RFC-compatible. It preserves a unique `auth.users.email` per row while letting the UI present only a username. From the source comment: *"The cleanest way to swap email login for username login without a multi-week edge-function rewrite is to treat `<username>@pelecanon.local` as the canonical email shape — the user never sees it."*

### Validation

```ts
Username = z.string().trim().min(3).max(32).regex(/^[a-z0-9._-]+$/i);
Password = z.string().min(6).max(128);
```

## 9.3 Session persistence

- After `login` server fn returns `{session, user, profile}`, the client calls `supabase.auth.setSession({access_token, refresh_token})` (`src/routes/auth.tsx:60`).
- Cookies via the configured `pelecanon-auth-token` storage key.
- `onAuthStateChange` triggers the bootstrap flow.

## 9.4 Tenant bootstrap

```
First login
  → ensureBootstrapAdmin (server) — idempotent creates:
      • tenants row (slug='pelecanon', name='PeleCanon')
      • auth.users row (email='admin@pelecanon.local', password='admin')
      • app_users row (tenant_id, username='admin', display_name='Admin', status='active')
      • tenant_members row (role='owner')

Subsequent visits
  → bootstrapMyTenant (server, requires auth) — self-heals:
      • resolve or default-create tenants row
      • ensure tenant_members row for caller
      • read all memberships, pick primary for client
```

If the bootstrap request fails, the user lands on the **bootstrap-failed** panel with a Retry button (`AdminLayout` in `src/routes/admin.tsx`).

## 9.5 Middlewares

| Middleware | Direction | What it does |
|---|---|---|
| `attachSupabaseAuth` | client → server-fn RPC | Sets `Authorization: Bearer <token>` from `supabase.auth.getSession()` |
| `requireSupabaseAuth` | server-fn inbound | Reads bearer, calls `supabase.auth.getClaims(token)`, exposes `context = { supabase, userId, claims }` |
| `csrfMiddleware` | request filter | CSRF only for `handlerType === 'serverFn'` |

All three are registered in `src/start.ts`.

## 9.6 Application-level role

```sql
tenant_members.role -- owner | admin | sales | worker | viewer
```

`useAuth().isStaff = memberships.some(m => m.role !== 'viewer')` gates `/admin/*`. There's no per-page granular RBAC at the UI layer — the server fns check the user's first tenant's role.

## 9.7 Server-fn authorization patterns

| Pattern | Where |
|---|---|
| Bearer verification | `requireSupabaseAuth` middleware (any fn with `.middleware([requireSupabaseAuth])`) |
| `owner\|admin` block | `applyWastageRulesMigration`, `createAppUser` |
| Tenant-prefix on R2 keys | `getR2DownloadUrl`, `deleteR2Object` (defense-in-depth) |
| Service-role for reads/writes the RLS admin role can't satisfy | all of `catalog.functions.ts`, `diagnostics-db.functions.ts` (intentional) |
| RLS as the only barrier | direct `supabase.from(...)` in UI (InternalNotes, orders, customers, etc.) — leaky by design in the current state |

## 9.8 Tests covering authz

`tests/rls.test.ts` covers, in `beforeAll`/`beforeEach` plus per-`it`:

- Two-tenant SELECT/INSERT/UPDATE/DELETE separation via `set_config('request.jwt.claims', json, true)`.
- Worker role cannot UPDATE `customers`.
- Append-only tables block UPDATE/DELETE.