/**
 * Tenant context primitives.
 *
 * Phase 1 tenancy migration is complete (33 public tables now tenant-scoped).
 * This module provides the canonical types and helpers that every server
 * function in src/lib/*.functions.ts will eventually adopt.
 *
 * Wiring is intentionally lazy: existing server functions still resolve
 * the user's tenant via ad hoc queries against tenant_members. Phase 2
 * swaps them to use these helpers + the request-jwt-claims pattern.
 */

/** Roles a user can hold within a single tenant. */
export const TENANT_ROLES = [
  "owner",
  "admin",
  "sales",
  "worker",
  "viewer",
] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

/** Result of resolving the request → tenant binding. */
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

/**
 * Decide whether `role` is allowed to perform a write on a tenant table.
 * Owners and admins have free reign; sales can create/edit; workers and
 * viewers are read-only by default. Server functions can override per-table.
 */
export function canWrite(role: TenantRole): boolean {
  return role === "owner" || role === "admin" || role === "sales";
}

/**
 * Decide whether `role` is allowed to delete on a tenant table.
 * Default: only owners and admins. Worker-side deletes (e.g. own assignment)
 * should use a path-scoped check, not this default.
 */
export function canDelete(role: TenantRole): boolean {
  return role === "owner" || role === "admin";
}

/** A guard for places where we expect exactly one canonical role-check. */
export function requireRole(
  ctx: TenantContext,
  allowed: readonly TenantRole[],
): void {
  if (!allowed.includes(ctx.role)) {
    throw new Error(
      `Forbidden: role '${ctx.role}' not in [${allowed.join(", ")}]`,
    );
  }
}