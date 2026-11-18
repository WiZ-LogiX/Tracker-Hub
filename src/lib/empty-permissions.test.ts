import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  resolveEffectivePermissions,
  hasEffectivePermission,
  invalidateRolePermissionsCache,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSION_SLUGS,
} from "./tenant-context";
import { db } from "@/db/client.server";
import { tenantRoles, rolePermissions, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const TEST_TENANT_ID = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
const CUSTOM_ROLE_SLUG = "audit_custom_empty_role";

describe("RBAC Audit Item 1: Explicitly Empty Permission Sets", () => {
  // Store backup of original permissions to restore after tests
  let originalAdminPerms: string[] = [];
  let originalSalesPerms: string[] = [];
  let originalWorkerPerms: string[] = [];

  beforeAll(async () => {
    // 1. Ensure test tenant exists
    await db.insert(tenants).values({
      id: TEST_TENANT_ID,
      slug: "pelecanon",
      name: "PeleCanon",
    }).onConflictDoNothing();

    // 2. Read original permissions to restore later
    const adminRows = await db
      .select({ slug: rolePermissions.permissionSlug })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "admin")));
    originalAdminPerms = adminRows.map((r) => r.slug);

    const salesRows = await db
      .select({ slug: rolePermissions.permissionSlug })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "sales")));
    originalSalesPerms = salesRows.map((r) => r.slug);

    const workerRows = await db
      .select({ slug: rolePermissions.permissionSlug })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "worker")));
    originalWorkerPerms = workerRows.map((r) => r.slug);

    // 3. Create a custom role in tenant_roles
    await db
      .insert(tenantRoles)
      .values({
        tenantId: TEST_TENANT_ID,
        slug: CUSTOM_ROLE_SLUG,
        label: "دور مخصص تحت الاختبار (Audit Custom Role)",
        description: "Test role for empty permissions verification",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // Restore original permissions
    if (originalAdminPerms.length > 0) {
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "admin")));
      await db.insert(rolePermissions).values(
        originalAdminPerms.map((slug) => ({ tenantId: TEST_TENANT_ID, role: "admin", permissionSlug: slug }))
      );
    }
    if (originalSalesPerms.length > 0) {
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "sales")));
      await db.insert(rolePermissions).values(
        originalSalesPerms.map((slug) => ({ tenantId: TEST_TENANT_ID, role: "sales", permissionSlug: slug }))
      );
    }
    if (originalWorkerPerms.length > 0) {
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "worker")));
      await db.insert(rolePermissions).values(
        originalWorkerPerms.map((slug) => ({ tenantId: TEST_TENANT_ID, role: "worker", permissionSlug: slug }))
      );
    }
    // Clean up test custom role
    await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, CUSTOM_ROLE_SLUG)));
    await db.delete(tenantRoles).where(and(eq(tenantRoles.tenantId, TEST_TENANT_ID), eq(tenantRoles.slug, CUSTOM_ROLE_SLUG)));

    // Clear caches
    invalidateRolePermissionsCache(TEST_TENANT_ID, "admin");
    invalidateRolePermissionsCache(TEST_TENANT_ID, "sales");
    invalidateRolePermissionsCache(TEST_TENANT_ID, "worker");
    invalidateRolePermissionsCache(TEST_TENANT_ID, CUSTOM_ROLE_SLUG);
  });

  it("1. Administrator intentionally configured with zero permissions resolves to empty set (NO default fallback)", async () => {
    // Explicitly wipe permissions for admin role in DB
    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "admin")));
    invalidateRolePermissionsCache(TEST_TENANT_ID, "admin");

    const perms = await resolveEffectivePermissions(TEST_TENANT_ID, "admin", { skipCache: true });

    expect(perms.size).toBe(0);
    expect(perms.has("crm.view")).toBe(false);
    expect(perms.has("quotes.view")).toBe(false);
    expect(perms.has("orders.view")).toBe(false);
    expect(perms.has("team.manage")).toBe(false);

    // Verify guard denies access
    const ctx = {
      userId: "test-user-id",
      tenantId: TEST_TENANT_ID,
      role: "admin" as const,
      permissions: perms,
    };
    expect(hasEffectivePermission(ctx, "quotes.view")).toBe(false);
    expect(hasEffectivePermission(ctx, "dashboard.view")).toBe(false);
  });

  it("2. Manager (sales) intentionally configured with zero permissions resolves to empty set (NO default fallback)", async () => {
    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "sales")));
    invalidateRolePermissionsCache(TEST_TENANT_ID, "sales");

    const perms = await resolveEffectivePermissions(TEST_TENANT_ID, "sales", { skipCache: true });

    expect(perms.size).toBe(0);
    expect(perms.has("crm.view")).toBe(false);
    expect(perms.has("quotes.view")).toBe(false);
    expect(perms.has("tasks.view_all")).toBe(false);

    const ctx = {
      userId: "test-user-id",
      tenantId: TEST_TENANT_ID,
      role: "sales" as const,
      permissions: perms,
    };
    expect(hasEffectivePermission(ctx, "crm.view")).toBe(false);
  });

  it("3. Task Worker intentionally configured with zero permissions resolves to empty set (NO default fallback)", async () => {
    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, "worker")));
    invalidateRolePermissionsCache(TEST_TENANT_ID, "worker");

    const perms = await resolveEffectivePermissions(TEST_TENANT_ID, "worker", { skipCache: true });

    expect(perms.size).toBe(0);
    expect(perms.has("tasks.view_assigned")).toBe(false);
    expect(perms.has("tasks.status.transition")).toBe(false);

    const ctx = {
      userId: "test-user-id",
      tenantId: TEST_TENANT_ID,
      role: "worker" as const,
      permissions: perms,
    };
    expect(hasEffectivePermission(ctx, "tasks.view_assigned")).toBe(false);
  });

  it("4. Custom role intentionally configured with zero permissions resolves to empty set", async () => {
    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, CUSTOM_ROLE_SLUG)));
    invalidateRolePermissionsCache(TEST_TENANT_ID, CUSTOM_ROLE_SLUG);

    const perms = await resolveEffectivePermissions(TEST_TENANT_ID, CUSTOM_ROLE_SLUG, { skipCache: true });

    expect(perms.size).toBe(0);
    expect(perms.has("inventory.view")).toBe(false);

    const ctx = {
      userId: "test-user-id",
      tenantId: TEST_TENANT_ID,
      role: CUSTOM_ROLE_SLUG as any,
      permissions: perms,
    };
    expect(hasEffectivePermission(ctx, "inventory.view")).toBe(false);
  });

  it("5. Owner role unconditionally retains all permissions regardless of DB state", async () => {
    const perms = await resolveEffectivePermissions(TEST_TENANT_ID, "owner", { skipCache: true });

    expect(perms.size).toBe(ALL_PERMISSION_SLUGS.length);
    expect(perms.has("team.manage")).toBe(true);
    expect(perms.has("settings.manage")).toBe(true);
    expect(perms.has("quotes.delete")).toBe(true);

    const ctx = {
      userId: "test-owner-id",
      tenantId: TEST_TENANT_ID,
      role: "owner" as const,
      permissions: perms,
    };
    expect(hasEffectivePermission(ctx, "anything.really")).toBe(true);
  });

  it("6. Uninitialized built-in role auto-seeds and resolves default permissions", async () => {
    // Generate a fresh temporary tenant ID
    const freshTenantId = "99999999-9999-9999-9999-999999999999";
    await db.insert(tenants).values({
      id: freshTenantId,
      slug: "fresh-test-tenant",
      name: "Fresh Test Tenant",
    }).onConflictDoNothing();

    try {
      // Role 'sales' is uninitialized in this fresh tenant
      const perms = await resolveEffectivePermissions(freshTenantId, "sales", { skipCache: true });

      // Should have auto-seeded defaults
      expect(perms.size).toBeGreaterThan(0);
      expect(perms.has("crm.view")).toBe(true);
      expect(perms.has("quotes.view")).toBe(true);

      // Verify that tenant_roles now contains the role
      const [roleRow] = await db
        .select()
        .from(tenantRoles)
        .where(and(eq(tenantRoles.tenantId, freshTenantId), eq(tenantRoles.slug, "sales")));
      expect(roleRow).toBeDefined();
      expect(roleRow?.slug).toBe("sales");
    } finally {
      // Clean up fresh tenant
      await db.delete(rolePermissions).where(eq(rolePermissions.tenantId, freshTenantId));
      await db.delete(tenantRoles).where(eq(tenantRoles.tenantId, freshTenantId));
      await db.delete(tenants).where(eq(tenants.id, freshTenantId));
    }
  });

  it("7. Roles with explicitly saved non-empty permissions resolve exactly those permissions", async () => {
    // Save exactly two permissions for the custom role
    await db.insert(rolePermissions).values([
      { tenantId: TEST_TENANT_ID, role: CUSTOM_ROLE_SLUG, permissionSlug: "inventory.view" },
      { tenantId: TEST_TENANT_ID, role: CUSTOM_ROLE_SLUG, permissionSlug: "inventory.adjust" },
    ]);
    invalidateRolePermissionsCache(TEST_TENANT_ID, CUSTOM_ROLE_SLUG);

    const perms = await resolveEffectivePermissions(TEST_TENANT_ID, CUSTOM_ROLE_SLUG, { skipCache: true });

    expect(perms.size).toBe(2);
    expect(perms.has("inventory.view")).toBe(true);
    expect(perms.has("inventory.adjust")).toBe(true);
    expect(perms.has("crm.view")).toBe(false);
    expect(perms.has("quotes.view")).toBe(false);
  });
});
