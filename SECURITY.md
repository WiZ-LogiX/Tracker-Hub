# Security: Multi-Tenant Isolation, Authentication & Data Protection

**Last Updated**: 2026-11-18  
**Baseline Commit**: `2608814` (`feature/atelier-prestige-homepage`)  
**Status**: Active & Enforced  

---

## 1. Multi-Tenant Isolation Architecture

PeleCanon enforces multi-tenant defense-in-depth across the entire stack:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Browser Client                                                  │
│ Authorization: Bearer <Supabase JWT>                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ auth-middleware.ts (requireSupabaseAuth)                        │
│ - Validates JWT with Supabase Auth                              │
│ - Sets context.userId and context.claims                        │
│ - Fail-close: mock tokens allowed ONLY in dev/test              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ tenant-middleware.ts (requireTenant)                            │
│ - Resolves user's tenant membership from tenant_members         │
│ - Attaches context.tenantId and context.supabase                │
│ - Executes setTenantGuc(tenantId) for PostgreSQL session GUC    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Database Layer (PostgreSQL 16)                                  │
│ - 34 tenant-scoped tables with tenant_id NOT NULL               │
│ - Row-Level Security (RLS) policies enforcing tenant isolation  │
│ - Tenant immutability triggers blocking cross-tenant mutation   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Dynamic RBAC & 3-State Permission Engine

Authorization is resolved dynamically through four relational tables:
`users` → `tenant_members` → `tenant_roles` → `role_permissions` → `permissions`.

### 3-State Resolution
1. **Uninitialized Roles**: Automatically seeded with safe defaults from `DEFAULT_ROLE_PERMISSIONS`.
2. **Explicitly Saved Permissions**: Resolved directly from `role_permissions` database rows.
3. **Explicitly Zero-Permission Roles**: If an administrator revokes all permissions from a role, it is strictly stored as empty and **never** falls back to default permissions.

### Super-Administrator Bypass
- The `owner` role is immutable and receives unconditional access across all operations, regardless of database rows.
- All other roles (`admin`, `sales`, `worker`, `viewer`, and custom roles) are strictly evaluated against their effective resolved permissions.

### Worker Workspace Restriction
- Users with the `worker` role are restricted to `/admin/tasks`.
- All administrative, financial, CRM, and catalog routes are hidden in the UI and return HTTP 403 Forbidden at the server function layer.

---

## 3. Public Endpoints & Tracking Security

The public tracking page (`/track`) allows customers to check order progress without authenticating:

1. **Cryptographic Token Lookup**:
   - Tracking by reference requires the order's `tracking_token` (UUIDv4).
   - Direct lookup by raw order ID or quote number is prohibited.
2. **Rate Limiting & Bounding**:
   - `handlePublicOrdersByPhone` is rate-limited to 10 requests per minute per IP using an in-memory sliding window.
   - SQL queries are strictly bounded (`.limit(20)`).
   - Returned order payloads are sanitized: internal costings, margins, worker notes, and supplier details are stripped.

---

## 4. Cloudflare R2 Storage Security

- **Presigned Direct Uploads**: Browsers upload directly to Cloudflare R2 via short-lived presigned PUT URLs generated server-side. Credentials never touch the client.
- **Short-Lived Customer URLs**: Presigned GET URLs for customer-facing documents and photos have a maximum TTL of **10 minutes**.
- **Tenant Path Isolation**: All object storage keys enforce tenant isolation:
  `{tenant_id}/{entity_type}/{entity_id}/{filename}`

---

## 5. Fail-Close Authentication Middleware

Mock bearer tokens (`Bearer mock-...`) are strictly permitted only when:
```typescript
process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
```
If `NODE_ENV` is `"production"` or undefined (e.g. unconfigured Cloudflare Workers runtime), mock tokens are rejected immediately with HTTP 401 Unauthorized.

---

## 6. Service-Role Client (`supabaseAdmin`) Usage Policy

`supabaseAdmin` is restricted to operations that genuinely lack tenant context:
- **Tenant Provisioning**: `bootstrap-tenant.functions.ts` (creates new tenant records).
- **Public Customer Tracking**: `tracking.functions.ts` (unauthenticated customer lookups).
- **Audit Logging**: Append-only notification and delivery logs.
- All business CRUD operations MUST use `context.supabase` or tenant-scoped Drizzle queries.
