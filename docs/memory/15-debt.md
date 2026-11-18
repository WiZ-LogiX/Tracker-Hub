# 15. Technical Debt & Resolution Status

**Last Updated**: 2026-11-18  
**Baseline Commit**: `2608814` (`feature/atelier-prestige-homepage`)  

---

## 15.1 Resolved Debt

1. **Drizzle Schema Parity**:
   - *Status*: ✅ **Resolved**.
   - `src/db/schema.ts` now fully types all **34 tenant-scoped tables** (including `projects`, `role_permissions`, `tenant_roles`, and `permissions`).

2. **Test Runner & Verification Integration**:
   - *Status*: ✅ **Resolved**.
   - `package.json` contains active scripts: `test` (`vitest run`), `test:e2e` (`playwright test`), `typecheck` (`tsc --noEmit`), `build`, and `preview`.
   - 1,073 Vitest tests (100% pass) and 165 Playwright E2E tests (100% pass) run deterministically.

3. **Cloudflare R2 Storage**:
   - *Status*: ✅ **Resolved**.
   - Full presigned PUT/GET architecture implemented in `src/lib/r2.server.ts` and `src/lib/r2.functions.ts` with 10-minute customer URL expiration.

4. **Dynamic RBAC & 3-State Permission Engine**:
   - *Status*: ✅ **Resolved**.
   - Unified single source of truth across `tenant_members`, `tenant_roles`, `permissions`, and `role_permissions`.
   - Zero-permission roles strictly protected from default fallback.
   - Client-safe metadata decoupling in `src/lib/tenant-permissions-data.ts`.

5. **Fail-Close Mock Auth Bypass**:
   - *Status*: ✅ **Resolved**.
   - Mock bearer token bypass is strictly gated behind `(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")`.

6. **Public Tracking Hardening**:
   - *Status*: ✅ **Resolved**.
   - Requires cryptographic `orders.tracking_token` (UUID); phone lookups are rate-limited and bounded (`.limit(20)`).

7. **Transactional Safety for Multi-Entity Chains**:
   - *Status*: ✅ **Resolved**.
   - Implemented in `src/lib/transactional.server.ts` and transactional server functions.

---

## 15.2 Remaining Operational Considerations (Non-Blocking)

1. **In-Memory Permission Cache in Multi-Instance Deployments**:
   - Currently uses in-memory map with 60-second TTL + explicit invalidation per process. In a distributed multi-worker cluster, Redis or Supabase Realtime cache invalidation will ensure instantaneous cross-worker sync.

2. **CORS Policy for Cloudflare R2 Production Bucket**:
   - The R2 bucket CORS rules documented in `docs/R2.md` must be configured in the Cloudflare Dashboard for production domains.

3. **n8n Webhook Retry DLQ**:
   - Failed webhook deliveries to n8n remain recorded in `notifications_log`. A background retry queue worker can be introduced for automated redelivery.
