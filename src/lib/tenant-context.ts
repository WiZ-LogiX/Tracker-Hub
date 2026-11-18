/**
 * Unified Tenant context, RBAC & Permissions Engine for PeleCanon.
 *
 * Implements the single source of truth for Role-Based Access Control:
 * User -> Tenant Membership -> Assigned Role -> Saved Role Permissions.
 *
 * Predefined Profiles:
 *   - Administrator (admin)
 *   - Manager (sales)
 *   - Task Worker (worker)
 * Reserved System Roles:
 *   - Owner (owner): Immutable super-administrator with unconditional bypass
 *   - Viewer (viewer): Backward-compatible read-only profile
 * Custom Roles:
 *   - Tenant-scoped roles with independent slugs and configurable permissions.
 */



export * from "./tenant-permissions-data";
import {
  ALL_PERMISSION_SLUGS,
  DEFAULT_ROLE_PERMISSIONS,
  type TenantRole,
  type TenantContext,
  type UserPermissions,
  type PermissionSlug,
} from "./tenant-permissions-data";

/* ──────────────────────────────────────────────────────────────────────────
   Effective Permissions Resolution Engine & Invalidation Cache
   ────────────────────────────────────────────────────────────────────────── */

interface CachedPerms {
  perms: Set<string>;
  timestamp: number;
}

// 60-second TTL in-memory cache per (tenantId:role)
const permissionsCache = new Map<string, CachedPerms>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Invalidate the in-memory cache for a tenant or specific role.
 * Call this immediately upon saving role permissions, user role update, or role deletion.
 */
export function invalidateRolePermissionsCache(tenantId?: string, role?: string): void {
  if (!tenantId) {
    permissionsCache.clear();
    return;
  }
  if (!role) {
    for (const key of permissionsCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        permissionsCache.delete(key);
      }
    }
    return;
  }
  permissionsCache.delete(`${tenantId}:${role}`);
}

/**
 * Resolves the authoritative effective permissions for a role in a tenant.
 *
 * Rules:
 * 1. Owner always gets unconditional full access across everything.
 * 2. Checks in-memory cache first (invalidated on any update).
 * 3. Queries saved rows from `role_permissions` table in DB.
 * 4. If saved rows exist in DB, they are the SOLE SOURCE OF TRUTH (customizable profiles).
 * 5. If NO rows exist in DB yet, safely falls back to DEFAULT_ROLE_PERMISSIONS.
 */
export async function resolveEffectivePermissions(
  tenantId: string,
  role: string,
  options?: { skipCache?: boolean },
): Promise<Set<string>> {
  if (role === "owner") {
    return new Set(ALL_PERMISSION_SLUGS);
  }

  const cacheKey = `${tenantId}:${role}`;
  if (!options?.skipCache) {
    const cached = permissionsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.perms;
    }
  }

  try {
    const { db } = await import("@/db/client.server");
    const { rolePermissions, tenantRoles } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");

    // 1. Verify if the role is registered in tenant_roles for this tenant
    const [roleRow] = await db
      .select({ slug: tenantRoles.slug })
      .from(tenantRoles)
      .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.slug, role)))
      .limit(1);

    let effectiveSet: Set<string>;

    if (!roleRow) {
      // UNINITIALIZED ROLE: The role is not yet registered or seeded in tenant_roles.
      // Auto-seed default permissions if this is a known profile.
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role];
      if (defaultPerms && defaultPerms.length > 0) {
        try {
          const roleLabels: Record<string, string> = {
            admin: "مدير النظام (Administrator)",
            sales: "مشرف عمليات (Manager)",
            worker: "فني مهام (Task Worker)",
            viewer: "مشاهد (Viewer)",
          };
          await db.transaction(async (tx) => {
            await tx
              .insert(tenantRoles)
              .values({
                tenantId,
                slug: role,
                label: roleLabels[role] || role,
                description: "تمت التهيئة التلقائية للأدوار الافتراضية",
              })
              .onConflictDoNothing();

            const rowsToInsert = defaultPerms.map((slug) => ({
              tenantId,
              role,
              permissionSlug: slug,
            }));
            await tx.insert(rolePermissions).values(rowsToInsert).onConflictDoNothing();
          });
        } catch (seedErr) {
          console.warn("[resolveEffectivePermissions] Auto-seed failed:", seedErr);
        }
        effectiveSet = new Set(defaultPerms);
      } else {
        effectiveSet = new Set<string>();
      }
    } else {
      // INITIALIZED ROLE: Persisted permissions in role_permissions are STRICTLY AUTHORITATIVE.
      const rows = await db
        .select({ permissionSlug: rolePermissions.permissionSlug })
        .from(rolePermissions)
        .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.role, role)));

      // If rows exist, use them.
      // If 0 rows exist, this role was INTENTIONALLY CONFIGURED WITH ZERO PERMISSIONS (or created with zero).
      // Under NO circumstances should this fall back to DEFAULT_ROLE_PERMISSIONS.
      effectiveSet = new Set(rows.map((r) => r.permissionSlug));
    }

    permissionsCache.set(cacheKey, {
      perms: effectiveSet,
      timestamp: Date.now(),
    });

    return effectiveSet;
  } catch (err: unknown) {
    console.error("[resolveEffectivePermissions] DB lookup failed, failing closed:", err);
    // Security fail-closed: do NOT grant default elevated permissions on unexpected database failure
    return new Set<string>();
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Universal Authorization Guards
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Check whether a TenantContext or UserPermissions has the required permission slug.
 * Owner role always returns true unconditionally.
 */
export function hasEffectivePermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slug: PermissionSlug | string,
): boolean {
  if (ctxOrPerms.role === "owner") return true;

  if ("permissions" in ctxOrPerms && ctxOrPerms.permissions instanceof Set) {
    return ctxOrPerms.permissions.has(slug);
  }

  // Fallback for mock contexts without loaded Set
  const defaults = DEFAULT_ROLE_PERMISSIONS[ctxOrPerms.role] || [];
  return defaults.includes(slug);
}

/** Legacy alias for backward compatibility with existing tests. */
export const hasPermission = hasEffectivePermission;

/**
 * Check whether the context holds AT LEAST ONE of the specified permission slugs.
 */
export function hasAnyEffectivePermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slugs: (PermissionSlug | string)[],
): boolean {
  if (ctxOrPerms.role === "owner") return true;
  return slugs.some((s) => hasEffectivePermission(ctxOrPerms, s));
}

/**
 * Guard that throws a 403 Forbidden error if the user lacks the required permission.
 */
export function requirePermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slug: PermissionSlug | string,
  moduleName?: string,
): void {
  if (!hasEffectivePermission(ctxOrPerms, slug)) {
    throw new Error(
      `Forbidden: missing required permission '${slug}'${moduleName ? ` to access ${moduleName}` : ""}`,
    );
  }
}

/**
 * Guard that throws if the user lacks ALL of the specified permissions.
 */
export function requireAnyPermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slugs: (PermissionSlug | string)[],
  moduleName?: string,
): void {
  if (!hasAnyEffectivePermission(ctxOrPerms, slugs)) {
    throw new Error(
      `Forbidden: insufficient permissions${moduleName ? ` to access ${moduleName}` : ""}`,
    );
  }
}

/**
 * A guard for places where we expect exactly one canonical role-check.
 */
export function requireRole(ctx: TenantContext, allowed: string[]): void {
  if (ctx.role === "owner") return;
  if (!allowed.includes(ctx.role)) {
    throw new Error(`Forbidden: role '${ctx.role}' not in [${allowed.join(", ")}]`);
  }
}

/**
 * Guard that strictly forbids Task Workers from accessing non-task ERP modules.
 * Verifies both role string and absence of managerial privileges.
 */
export function forbidWorker(ctx: TenantContext, moduleName?: string): void {
  if (ctx.role === "owner" || ctx.role === "admin") return;
  if (ctx.role === "worker") {
    throw new Error(
      `Forbidden: Task Workers do not have access to ${moduleName || "this module"}`,
    );
  }
}

/**
 * Decide whether `roleOrCtx` is allowed to perform a write on a tenant table/resource.
 * Supports both legacy string checks and modern permission-aware contexts.
 */
export function canWrite(roleOrCtx: TenantRole | TenantContext, resource?: string): boolean {
  if (typeof roleOrCtx === "string") {
    return roleOrCtx === "owner" || roleOrCtx === "admin" || roleOrCtx === "sales";
  }
  const ctx = roleOrCtx;
  if (ctx.role === "owner") return true;

  if (resource && ctx.permissions) {
    return (
      ctx.permissions.has(`${resource}.create`) ||
      ctx.permissions.has(`${resource}.edit`) ||
      ctx.permissions.has(`${resource}.manage`)
    );
  }
  if (ctx.permissions) {
    for (const p of ctx.permissions) {
      if (p.endsWith(".create") || p.endsWith(".edit") || p.endsWith(".manage")) return true;
    }
    return false;
  }
  return ctx.role === "admin" || ctx.role === "sales";
}

/**
 * Decide whether `roleOrCtx` is allowed to delete on a tenant table/resource.
 */
export function canDelete(roleOrCtx: TenantRole | TenantContext, resource?: string): boolean {
  if (typeof roleOrCtx === "string") {
    return roleOrCtx === "owner" || roleOrCtx === "admin";
  }
  const ctx = roleOrCtx;
  if (ctx.role === "owner") return true;

  if (resource && ctx.permissions) {
    return ctx.permissions.has(`${resource}.delete`);
  }
  if (ctx.permissions) {
    for (const p of ctx.permissions) {
      if (p.endsWith(".delete")) return true;
    }
    return false;
  }
  return ctx.role === "admin";
}
