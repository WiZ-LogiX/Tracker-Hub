import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  resolveEffectivePermissions,
  hasEffectivePermission,
  requirePermission,
  canWrite,
  canDelete,
  invalidateRolePermissionsCache,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSION_SLUGS,
  type TenantContext,
} from "./tenant-context";
import { db } from "@/db/client.server";
import { tenantRoles, rolePermissions, tenantMembers, appUsers, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const TEST_TENANT_ID = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
const OTHER_TENANT_ID = "88888888-8888-8888-8888-888888888888";
const AUDIT_ROLE_CUSTOM = "audit_sec_integrity_role";

describe("PeleCanon RBAC Security Integrity Audit Suite", () => {
  beforeAll(async () => {
    // Ensure test tenants exist
    await db.insert(tenants).values([
      { id: TEST_TENANT_ID, slug: "pelecanon", name: "PeleCanon" },
      { id: OTHER_TENANT_ID, slug: "other-tenant", name: "Other Tenant" },
    ]).onConflictDoNothing();

    // Register a test custom role
    await db.insert(tenantRoles).values({
      tenantId: TEST_TENANT_ID,
      slug: AUDIT_ROLE_CUSTOM,
      label: "مدقق أمان مخصص (Audit Role)",
      description: "Custom role for security integrity testing",
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    // Clean up test custom role and other tenant
    await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, AUDIT_ROLE_CUSTOM)));
    await db.delete(tenantRoles).where(and(eq(tenantRoles.tenantId, TEST_TENANT_ID), eq(tenantRoles.slug, AUDIT_ROLE_CUSTOM)));
    await db.delete(tenants).where(eq(tenants.id, OTHER_TENANT_ID));
    invalidateRolePermissionsCache();
  });

  /* ──────────────────────────────────────────────────────────────────────────
     DIMENSION 1: Explicitly Empty Permission Sets
     ────────────────────────────────────────────────────────────────────────── */
  describe("Dimension 1: Explicitly Empty Permission Sets", () => {
    it("Admin role with zero saved permissions evaluates to empty Set and denies access", async () => {
      // Create a temporary mock role representing an admin with 0 permissions
      const emptyAdminSlug = "test_empty_admin";
      await db.insert(tenantRoles).values({
        tenantId: TEST_TENANT_ID,
        slug: emptyAdminSlug,
        label: "مدير فارغ (Empty Admin)",
      }).onConflictDoNothing();
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, emptyAdminSlug)));
      invalidateRolePermissionsCache(TEST_TENANT_ID, emptyAdminSlug);

      const perms = await resolveEffectivePermissions(TEST_TENANT_ID, emptyAdminSlug, { skipCache: true });
      expect(perms.size).toBe(0);

      const ctx: TenantContext = {
        userId: "test-user-1",
        tenantId: TEST_TENANT_ID,
        role: emptyAdminSlug as any,
        permissions: perms,
      };

      expect(hasEffectivePermission(ctx, "quotes.view")).toBe(false);
      expect(hasEffectivePermission(ctx, "orders.stage.change")).toBe(false);
      expect(hasEffectivePermission(ctx, "invoices.payments.record")).toBe(false);
      expect(() => requirePermission(ctx, "quotes.approve")).toThrow(/Forbidden/);

      // Clean up
      await db.delete(tenantRoles).where(and(eq(tenantRoles.tenantId, TEST_TENANT_ID), eq(tenantRoles.slug, emptyAdminSlug)));
    });

    it("Manager (sales) with zero permissions evaluates to empty Set and denies access", async () => {
      const emptySalesSlug = "test_empty_sales";
      await db.insert(tenantRoles).values({
        tenantId: TEST_TENANT_ID,
        slug: emptySalesSlug,
        label: "مشرف فارغ (Empty Sales)",
      }).onConflictDoNothing();
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, emptySalesSlug)));
      invalidateRolePermissionsCache(TEST_TENANT_ID, emptySalesSlug);

      const perms = await resolveEffectivePermissions(TEST_TENANT_ID, emptySalesSlug, { skipCache: true });
      expect(perms.size).toBe(0);

      const ctx: TenantContext = {
        userId: "test-user-2",
        tenantId: TEST_TENANT_ID,
        role: emptySalesSlug as any,
        permissions: perms,
      };

      expect(hasEffectivePermission(ctx, "crm.view")).toBe(false);
      expect(hasEffectivePermission(ctx, "quotes.create")).toBe(false);
      expect(() => requirePermission(ctx, "crm.stage.change")).toThrow(/Forbidden/);

      await db.delete(tenantRoles).where(and(eq(tenantRoles.tenantId, TEST_TENANT_ID), eq(tenantRoles.slug, emptySalesSlug)));
    });

    it("Task Worker with zero permissions evaluates to empty Set and cannot view assigned tasks", async () => {
      const emptyWorkerSlug = "test_empty_worker";
      await db.insert(tenantRoles).values({
        tenantId: TEST_TENANT_ID,
        slug: emptyWorkerSlug,
        label: "عامل فارغ (Empty Worker)",
      }).onConflictDoNothing();
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, emptyWorkerSlug)));
      invalidateRolePermissionsCache(TEST_TENANT_ID, emptyWorkerSlug);

      const perms = await resolveEffectivePermissions(TEST_TENANT_ID, emptyWorkerSlug, { skipCache: true });
      expect(perms.size).toBe(0);

      const ctx: TenantContext = {
        userId: "test-user-3",
        tenantId: TEST_TENANT_ID,
        role: emptyWorkerSlug as any,
        permissions: perms,
      };

      expect(hasEffectivePermission(ctx, "tasks.view_assigned")).toBe(false);
      expect(hasEffectivePermission(ctx, "tasks.status.transition")).toBe(false);
      expect(() => requirePermission(ctx, "tasks.notes.add")).toThrow(/Forbidden/);

      await db.delete(tenantRoles).where(and(eq(tenantRoles.tenantId, TEST_TENANT_ID), eq(tenantRoles.slug, emptyWorkerSlug)));
    });

    it("Custom role with zero permissions evaluates to empty Set", async () => {
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, AUDIT_ROLE_CUSTOM)));
      invalidateRolePermissionsCache(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM);

      const perms = await resolveEffectivePermissions(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM, { skipCache: true });
      expect(perms.size).toBe(0);

      const ctx: TenantContext = {
        userId: "test-user-4",
        tenantId: TEST_TENANT_ID,
        role: AUDIT_ROLE_CUSTOM as any,
        permissions: perms,
      };

      expect(hasEffectivePermission(ctx, "inventory.view")).toBe(false);
      expect(() => requirePermission(ctx, "inventory.adjust")).toThrow(/Forbidden/);
    });

    it("Owner role unconditionally passes every permission check regardless of DB rows", async () => {
      const perms = await resolveEffectivePermissions(TEST_TENANT_ID, "owner", { skipCache: true });
      expect(perms.size).toBe(ALL_PERMISSION_SLUGS.length);

      const ctx: TenantContext = {
        userId: "owner-user",
        tenantId: TEST_TENANT_ID,
        role: "owner",
        permissions: perms,
      };

      expect(hasEffectivePermission(ctx, "any.nonexistent.slug")).toBe(true);
      expect(() => requirePermission(ctx, "team.manage")).not.toThrow();
      expect(() => requirePermission(ctx, "settings.manage")).not.toThrow();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
     DIMENSION 2: Remaining Hard-Coded Authorization & Bypass Prevention
     ────────────────────────────────────────────────────────────────────────── */
  describe("Dimension 2: Remaining Hard-Coded Authorization & Bypass Prevention", () => {
    it("canWrite blocks admin and sales when respective write permission is stripped", () => {
      // Admin with stripped permissions
      const strippedAdminCtx: TenantContext = {
        userId: "u-admin",
        tenantId: TEST_TENANT_ID,
        role: "admin",
        permissions: new Set(["quotes.view"]), // only view, no write/edit
      };

      expect(canWrite(strippedAdminCtx, "products")).toBe(false);
      expect(canWrite(strippedAdminCtx, "quotes")).toBe(false);

      // Admin with granted write permission
      const writeAdminCtx: TenantContext = {
        userId: "u-admin-write",
        tenantId: TEST_TENANT_ID,
        role: "admin",
        permissions: new Set(["quotes.create", "quotes.edit"]),
      };
      expect(canWrite(writeAdminCtx, "quotes")).toBe(true);
    });

    it("canDelete blocks admin when delete permission is stripped", () => {
      const noDeleteAdminCtx: TenantContext = {
        userId: "u-admin-nodelete",
        tenantId: TEST_TENANT_ID,
        role: "admin",
        permissions: new Set(["products.view", "products.edit"]),
      };

      expect(canDelete(noDeleteAdminCtx, "products")).toBe(false);

      const canDeleteAdminCtx: TenantContext = {
        userId: "u-admin-delete",
        tenantId: TEST_TENANT_ID,
        role: "admin",
        permissions: new Set(["products.delete"]),
      };
      expect(canDelete(canDeleteAdminCtx, "products")).toBe(true);
    });

    it("canWrite and canDelete allow custom role when appropriate permission is configured", () => {
      const supervisorCtx: TenantContext = {
        userId: "u-supervisor",
        tenantId: TEST_TENANT_ID,
        role: "warehouse_supervisor" as any,
        permissions: new Set(["inventory.create", "inventory.edit", "inventory.delete"]),
      };

      expect(canWrite(supervisorCtx, "inventory")).toBe(true);
      expect(canDelete(supervisorCtx, "inventory")).toBe(true);
      expect(canWrite(supervisorCtx, "quotes")).toBe(false);
      expect(canDelete(supervisorCtx, "quotes")).toBe(false);
    });

    it("Owner unconditionally passes canWrite and canDelete regardless of permissions set", () => {
      const ownerCtx: TenantContext = {
        userId: "u-owner",
        tenantId: TEST_TENANT_ID,
        role: "owner",
        permissions: new Set<string>(), // even with empty set, owner bypasses
      };

      expect(canWrite(ownerCtx, "anything")).toBe(true);
      expect(canDelete(ownerCtx, "anything")).toBe(true);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
     DIMENSION 3: Cache Consistency & Invalidation
     ────────────────────────────────────────────────────────────────────────── */
  describe("Dimension 3: Cache Consistency & Invalidation", () => {
    it("Cache returns cached permissions within TTL and invalidates on demand", async () => {
      // 1. Seed custom permissions
      await db.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, TEST_TENANT_ID), eq(rolePermissions.role, AUDIT_ROLE_CUSTOM)));
      await db.insert(rolePermissions).values([
        { tenantId: TEST_TENANT_ID, role: AUDIT_ROLE_CUSTOM, permissionSlug: "dashboard.view" },
      ]);
      invalidateRolePermissionsCache(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM);

      // 2. First resolution populates cache
      const perms1 = await resolveEffectivePermissions(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM);
      expect(perms1.has("dashboard.view")).toBe(true);
      expect(perms1.has("crm.view")).toBe(false);

      // 3. Mutate DB directly behind the cache
      await db.insert(rolePermissions).values([
        { tenantId: TEST_TENANT_ID, role: AUDIT_ROLE_CUSTOM, permissionSlug: "crm.view" },
      ]);

      // 4. Cache hit should return previous state
      const permsCached = await resolveEffectivePermissions(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM);
      expect(permsCached.has("crm.view")).toBe(false);

      // 5. Invalidate cache
      invalidateRolePermissionsCache(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM);

      // 6. Next resolution should fetch fresh state from DB
      const permsFresh = await resolveEffectivePermissions(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM);
      expect(permsFresh.has("crm.view")).toBe(true);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
     DIMENSION 4: Complete Authorization Coverage for Sensitive Operations
     ────────────────────────────────────────────────────────────────────────── */
  describe("Dimension 4: Complete Authorization Coverage for Sensitive Operations", () => {
    const sensitiveOperations = [
      { name: "Quote Approval", slug: "quotes.approve" },
      { name: "Quote Conversion to Project/Order", slug: "quotes.convert" },
      { name: "Quote Deletion", slug: "quotes.delete" },
      { name: "Project Financial View", slug: "projects.financials.view" },
      { name: "Project Deletion", slug: "projects.delete" },
      { name: "Order Stage Change", slug: "orders.stage.change" },
      { name: "Order Deletion", slug: "orders.delete" },
      { name: "Delivery Signing & Confirmation", slug: "deliveries.status.update" },
      { name: "Payment Recording", slug: "invoices.payments.record" },
      { name: "Invoice Deletion", slug: "invoices.delete" },
      { name: "Task Assignment", slug: "tasks.assign" },
      { name: "Task Acknowledgment", slug: "tasks.acknowledge" },
      { name: "Inventory Adjustment", slug: "inventory.adjust" },
      { name: "Customer Deletion", slug: "customers.delete" },
      { name: "Cost Analysis Edit", slug: "cost-analysis.edit" },
      { name: "Role & Permission Management", slug: "team.manage" },
      { name: "System Settings Management", slug: "settings.manage" },
    ];

    for (const op of sensitiveOperations) {
      it(`enforces permission guard for '${op.name}' (${op.slug})`, () => {
        const authorizedCtx: TenantContext = {
          userId: "auth-user",
          tenantId: TEST_TENANT_ID,
          role: "sales",
          permissions: new Set([op.slug]),
        };
        const unauthorizedCtx: TenantContext = {
          userId: "unauth-user",
          tenantId: TEST_TENANT_ID,
          role: "sales",
          permissions: new Set(["dashboard.view"]), // missing op.slug
        };

        expect(hasEffectivePermission(authorizedCtx, op.slug)).toBe(true);
        expect(() => requirePermission(authorizedCtx, op.slug)).not.toThrow();

        expect(hasEffectivePermission(unauthorizedCtx, op.slug)).toBe(false);
        expect(() => requirePermission(unauthorizedCtx, op.slug)).toThrow(/Forbidden/);
      });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────────
     DIMENSION 5: Data Scope & Multi-Tenant Boundary
     ────────────────────────────────────────────────────────────────────────── */
  describe("Dimension 5: Data Scope & Multi-Tenant Boundary", () => {
    it("distinguishes task worker assigned-only view from manager company-wide view", () => {
      const workerCtx: TenantContext = {
        userId: "worker-1",
        tenantId: TEST_TENANT_ID,
        role: "worker",
        permissions: new Set(["tasks.view_assigned", "tasks.status.transition"]),
      };

      const managerCtx: TenantContext = {
        userId: "mgr-1",
        tenantId: TEST_TENANT_ID,
        role: "sales",
        permissions: new Set(["tasks.view_all", "tasks.assign", "tasks.create"]),
      };

      expect(hasEffectivePermission(workerCtx, "tasks.view_assigned")).toBe(true);
      expect(hasEffectivePermission(workerCtx, "tasks.view_all")).toBe(false);

      expect(hasEffectivePermission(managerCtx, "tasks.view_all")).toBe(true);
      expect(hasEffectivePermission(managerCtx, "tasks.view_assigned")).toBe(false);
    });

    it("masks sensitive financial figures when user lacks projects.financials.view", () => {
      const basicProjectCtx: TenantContext = {
        userId: "pm-1",
        tenantId: TEST_TENANT_ID,
        role: "worker",
        permissions: new Set(["projects.view"]),
      };

      const financeProjectCtx: TenantContext = {
        userId: "exec-1",
        tenantId: TEST_TENANT_ID,
        role: "sales",
        permissions: new Set(["projects.view", "projects.financials.view"]),
      };

      expect(hasEffectivePermission(basicProjectCtx, "projects.financials.view")).toBe(false);
      expect(hasEffectivePermission(financeProjectCtx, "projects.financials.view")).toBe(true);
    });

    it("strictly isolates permissions across tenant boundaries", async () => {
      // In OTHER_TENANT, register custom role with 0 permissions
      await db.insert(tenantRoles).values({
        tenantId: OTHER_TENANT_ID,
        slug: AUDIT_ROLE_CUSTOM,
        label: "دور في مستأجر آخر",
      }).onConflictDoNothing();

      // TEST_TENANT has dashboard.view and crm.view for AUDIT_ROLE_CUSTOM
      const permsTenantA = await resolveEffectivePermissions(TEST_TENANT_ID, AUDIT_ROLE_CUSTOM, { skipCache: true });
      const permsTenantB = await resolveEffectivePermissions(OTHER_TENANT_ID, AUDIT_ROLE_CUSTOM, { skipCache: true });

      expect(permsTenantA.has("dashboard.view")).toBe(true);
      expect(permsTenantB.has("dashboard.view")).toBe(false);
      expect(permsTenantB.size).toBe(0);

      // Clean up
      await db.delete(tenantRoles).where(and(eq(tenantRoles.tenantId, OTHER_TENANT_ID), eq(tenantRoles.slug, AUDIT_ROLE_CUSTOM)));
    });
  });
});
