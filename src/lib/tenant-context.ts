/**
 * Tenant context primitives.
 *
 * Phase 1 tenancy migration is complete (33 public tables now tenant-scoped).
 * This module provides the canonical types and helpers that every server
 * function in src/lib/*.functions.ts will eventually adopt.
 *
 * Phase 2 adds permission-based access control via the permissions / role_permissions tables.
 * Phase 3 makes roles fully dynamic — custom role slugs are allowed.
 */

/** The 5 built-in role slugs (cannot be deleted). */
export const BUILTIN_ROLE_SLUGS = [
  "owner",
  "admin",
  "sales",
  "worker",
  "viewer",
] as const;

/** A role is now just a string slug — custom roles are allowed. */
export type TenantRole = string;

/** All known permission slugs. */
export const ALL_PERMISSION_SLUGS = [
  "quotes.view","quotes.create","quotes.edit","quotes.delete","quotes.configurator",
  "invoices.view","invoices.create","invoices.edit","invoices.delete",
  "orders.view","orders.create","orders.edit","orders.delete",
  "customers.view","customers.create","customers.edit","customers.delete",
  "products.view","products.create","products.edit","products.delete",
  "materials.view","materials.create","materials.edit","materials.delete",
  "suppliers.view","suppliers.create","suppliers.edit","suppliers.delete",
  "finishes.view","finishes.create","finishes.edit","finishes.delete",
  "veneers.view","veneers.create","veneers.edit","veneers.delete",
  "accessories.view","accessories.create","accessories.edit","accessories.delete",
  "pricing.view","pricing.edit",
  "cost-analysis.view","cost-analysis.edit",
  "discounts.view","discounts.create","discounts.edit","discounts.delete",
  "notifications.view","notifications.send",
  "workers.view","workers.create","workers.edit","workers.delete",
  "remakes.view","remakes.create","remakes.edit","remakes.delete",
  "team.view","team.manage",
  "seed.view","seed.manage",
] as const;

export type PermissionSlug = (typeof ALL_PERMISSION_SLUGS)[number];

/** Result of resolving the request → tenant binding. */
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

/** A permission set loaded from the role_permissions table. */
export interface UserPermissions {
  role: TenantRole;
  permissions: Set<string>;
}

/** A tenant role row from the DB. */
export interface TenantRoleInfo {
  slug: string;
  label: string;
  description: string | null;
}

/**
 * Decide whether `role` is allowed to perform a write on a tenant table.
 * Owners and admins have free reign; sales can create/edit; workers and
 * viewers are read-only by default. Server functions can override per-table.
 * Custom roles default to read-only (use permissions for fine-grained control).
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
  allowed: string[],
): void {
  if (!allowed.includes(ctx.role)) {
    throw new Error(
      `Forbidden: role '${ctx.role}' not in [${allowed.join(", ")}]`,
    );
  }
}

/**
 * Check whether a loaded UserPermissions set includes the given slug.
 * The owner role always has all permissions (bypass check).
 */
export function hasPermission(
  perms: UserPermissions,
  slug: PermissionSlug | string,
): boolean {
  if (perms.role === "owner") return true;
  return perms.permissions.has(slug);
}

/**
 * Guard that throws if the user lacks the given permission.
 */
export function requirePermission(
  perms: UserPermissions,
  slug: PermissionSlug | string,
): void {
  if (!hasPermission(perms, slug)) {
    throw new Error(`Forbidden: missing permission '${slug}'`);
  }
}
