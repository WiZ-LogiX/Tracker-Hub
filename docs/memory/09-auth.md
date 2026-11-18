# 9. Authentication & Authorization

## 9.1 Authentication Provider

- **Supabase Auth** with email/password only.
- **Google OAuth is explicitly disabled** — username + password only by design.
- **No public self-signup**: Administrators manage employee credentials under `/admin/team`.

## 9.2 Synthetic Email Pattern

```text
proxyEmailFor(username) = `${username.toLowerCase()}@pelecanon.local`
```

This RFC-compatible pattern preserves unique email constraints in `auth.users` while allowing the UI to present clean username login.

## 9.3 Unified Dynamic RBAC Architecture

Authorization is resolved dynamically through four relational tables:
`users` → `tenant_members` → `tenant_roles` → `role_permissions` → `permissions`.

### 3-State Permission Resolution
1. **Uninitialized Roles**: Seeded automatically from safe system defaults in `DEFAULT_ROLE_PERMISSIONS`.
2. **Explicitly Saved Permissions**: Resolved directly from `role_permissions` rows.
3. **Explicitly Zero-Permission Roles**: If all permissions are removed from a role, it is strictly resolved as empty and **never** falls back to default permissions.

### Role Profiles & Super-Admin
- **`owner`**: Immutable super-administrator with unconditional access across all operations.
- **`admin`**: Full administrative access (adjustable per tenant).
- **`sales` (Manager)**: Operational manager across CRM, quotes, projects, orders, and after-sales.
- **`worker` (Task Worker)**: Strictly scoped to the worker workspace (`/admin/tasks`). All administrative routes and financial figures are completely blocked and hidden.
- **`viewer`**: Read-only profile.
- **Custom Roles**: Dynamically created and scoped per tenant.

### Client-Safe Architecture
UI metadata, labels, and access levels are isolated in `src/lib/tenant-permissions-data.ts`. This ensures client React bundles never import Node.js database drivers or `postgres`.

## 9.4 Middlewares & Fail-Close Protection

| Middleware | Direction | What it does |
|---|---|---|
| `attachSupabaseAuth` | Client → Server RPC | Injects `Authorization: Bearer <token>` into server requests |
| `requireSupabaseAuth` | Inbound Server Fn | Validates JWT; **fails completely closed** for mock tokens unless `NODE_ENV` is explicitly `development` or `test` |
| `requireTenant` | Inbound Server Fn | Resolves tenant membership, sets PostgreSQL GUC via `setTenantGuc(tenantId)`, attaches `context.supabase` |
| `csrfMiddleware` | Request filter | CSRF enforcement on server-function RPCs |

## 9.5 Granular Authorization in Server Functions

Server functions use granular checks:
- `requirePermission(ctx, "quotes.create")`
- `requireAnyPermission(ctx, ["orders.manage", "orders.view"])`
- `canWrite(role)` / `canDelete(role)`

Sensitive financial figures in `getProjectWorkspaceData` are masked at the server level unless the user possesses `projects.financials.view`.
