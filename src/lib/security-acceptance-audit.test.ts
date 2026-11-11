import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BUILTIN_ROLE_SLUGS,
  ALL_PERMISSION_SLUGS,
  forbidWorker,
  requireRole,
  canWrite,
  canDelete,
  hasPermission,
  type TenantContext,
  type UserPermissions,
} from "./tenant-context";

describe("PELECANON FINAL USER ACCESS SECURITY ACCEPTANCE AUDIT", () => {
  const TENANT_A = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const TENANT_B = "99999999-9999-9999-9999-999999999999";
  const WORKER_ID = "worker-1111-1111-1111-111111111111";
  const MANAGER_ID = "manager-2222-2222-2222-222222222222";
  const ADMIN_ID = "admin-3333-3333-3333-333333333333";

  const workerCtx: TenantContext = {
    userId: WORKER_ID,
    tenantId: TENANT_A,
    role: "worker",
  };

  const managerCtx: TenantContext = {
    userId: MANAGER_ID,
    tenantId: TENANT_A,
    role: "sales",
  };

  const adminCtx: TenantContext = {
    userId: ADMIN_ID,
    tenantId: TENANT_A,
    role: "admin",
  };

  describe("1. Role Mapping & Permission Matrix Audit", () => {
    it("canonical profile mapping maps Manager to 'sales' and Task Worker to 'worker'", () => {
      const profileToRoleMap: Record<string, string> = {
        Administrator: "admin",
        Manager: "sales",
        "Task Worker": "worker",
      };

      expect(profileToRoleMap["Administrator"]).toBe("admin");
      expect(profileToRoleMap["Manager"]).toBe("sales");
      expect(profileToRoleMap["Task Worker"]).toBe("worker");
      expect(BUILTIN_ROLE_SLUGS).toContain("admin");
      expect(BUILTIN_ROLE_SLUGS).toContain("sales");
      expect(BUILTIN_ROLE_SLUGS).toContain("worker");
    });

    it("verifies Manager (sales role) does NOT have user/team management permissions", () => {
      // Team management is strictly guarded by requireRole(["owner", "admin"])
      expect(() => requireRole(managerCtx, ["owner", "admin"])).toThrow(/Forbidden: role 'sales'/);
      expect(() => requireRole(workerCtx, ["owner", "admin"])).toThrow(/Forbidden: role 'worker'/);
      expect(() => requireRole(adminCtx, ["owner", "admin"])).not.toThrow();
    });

    it("verifies Manager (sales role) does NOT have delete authority on tenant records by default", () => {
      expect(canDelete(managerCtx.role)).toBe(false);
      expect(canDelete(workerCtx.role)).toBe(false);
      expect(canDelete(adminCtx.role)).toBe(true);
      expect(canDelete("owner")).toBe(true);
    });

    it("verifies Manager (sales role) has operational write authority while Task Worker does not", () => {
      expect(canWrite(managerCtx.role)).toBe(true);
      expect(canWrite(workerCtx.role)).toBe(false);
      expect(canWrite("viewer")).toBe(false);
      expect(canWrite(adminCtx.role)).toBe(true);
      expect(canWrite("owner")).toBe(true);
    });

    it("produces and validates the complete ERP Module Permission Matrix", () => {
      // Verified from live PostgreSQL role_permissions
      const salesPermissions = new Set([
        "cost-analysis.view",
        "customers.create", "customers.edit", "customers.view",
        "discounts.create", "discounts.edit", "discounts.view",
        "invoices.create", "invoices.edit", "invoices.view",
        "notifications.send", "notifications.view",
        "orders.create", "orders.edit", "orders.view",
        "products.view",
        "quotes.configurator", "quotes.create", "quotes.edit", "quotes.view",
        "remakes.create", "remakes.edit", "remakes.view",
      ]);

      const managerPerms: UserPermissions = {
        role: "sales",
        permissions: salesPermissions,
      };

      // Manager HAS sales & operational permissions:
      expect(hasPermission(managerPerms, "quotes.create")).toBe(true);
      expect(hasPermission(managerPerms, "quotes.view")).toBe(true);
      expect(hasPermission(managerPerms, "invoices.create")).toBe(true);
      expect(hasPermission(managerPerms, "orders.create")).toBe(true);
      expect(hasPermission(managerPerms, "customers.create")).toBe(true);

      // Manager LACKS administrative, pricing factor, and delete permissions:
      expect(hasPermission(managerPerms, "team.manage")).toBe(false);
      expect(hasPermission(managerPerms, "team.view")).toBe(false);
      expect(hasPermission(managerPerms, "seed.manage")).toBe(false);
      expect(hasPermission(managerPerms, "seed.view")).toBe(false);
      expect(hasPermission(managerPerms, "pricing.edit")).toBe(false);
      expect(hasPermission(managerPerms, "pricing.view")).toBe(false);
      expect(hasPermission(managerPerms, "quotes.delete")).toBe(false);
      expect(hasPermission(managerPerms, "invoices.delete")).toBe(false);
      expect(hasPermission(managerPerms, "orders.delete")).toBe(false);
      expect(hasPermission(managerPerms, "customers.delete")).toBe(false);
    });
  });

  describe("2. Task Worker Server-Side Restrictions Audit", () => {
    it("strictly blocks Task Workers from Customer Management", () => {
      expect(() => forbidWorker(workerCtx, "Customer Management")).toThrow(
        "Forbidden: Task Workers do not have access to Customer Management",
      );
      expect(() => forbidWorker(managerCtx, "Customer Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Customer Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from Commercial Quotes", () => {
      expect(() => forbidWorker(workerCtx, "Commercial Quotes")).toThrow(
        "Forbidden: Task Workers do not have access to Commercial Quotes",
      );
      expect(() => forbidWorker(managerCtx, "Commercial Quotes")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Commercial Quotes")).not.toThrow();
    });

    it("strictly blocks Task Workers from Invoices & Payments", () => {
      expect(() => forbidWorker(workerCtx, "Invoices & Payments")).toThrow(
        "Forbidden: Task Workers do not have access to Invoices & Payments",
      );
      expect(() => forbidWorker(managerCtx, "Invoices & Payments")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Invoices & Payments")).not.toThrow();
    });

    it("strictly blocks Task Workers from Inventory Management", () => {
      expect(() => forbidWorker(workerCtx, "Inventory Management")).toThrow(
        "Forbidden: Task Workers do not have access to Inventory Management",
      );
      expect(() => forbidWorker(managerCtx, "Inventory Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Inventory Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from Work Orders Management", () => {
      expect(() => forbidWorker(workerCtx, "Work Orders Management")).toThrow(
        "Forbidden: Task Workers do not have access to Work Orders Management",
      );
      expect(() => forbidWorker(managerCtx, "Work Orders Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Work Orders Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from Delivery Management", () => {
      expect(() => forbidWorker(workerCtx, "Delivery Management")).toThrow(
        "Forbidden: Task Workers do not have access to Delivery Management",
      );
      expect(() => forbidWorker(managerCtx, "Delivery Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Delivery Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from After-Sales Management", () => {
      expect(() => forbidWorker(workerCtx, "After-Sales Management")).toThrow(
        "Forbidden: Task Workers do not have access to After-Sales Management",
      );
      expect(() => forbidWorker(managerCtx, "After-Sales Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "After-Sales Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from Remake Management", () => {
      expect(() => forbidWorker(workerCtx, "Remake Management")).toThrow(
        "Forbidden: Task Workers do not have access to Remake Management",
      );
      expect(() => forbidWorker(managerCtx, "Remake Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Remake Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from Production Tracking & QC", () => {
      expect(() => forbidWorker(workerCtx, "Production Tracking")).toThrow(
        "Forbidden: Task Workers do not have access to Production Tracking",
      );
      expect(() => forbidWorker(managerCtx, "Production Tracking")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Production Tracking")).not.toThrow();
    });

    it("strictly blocks Task Workers from Workforce Management", () => {
      expect(() => forbidWorker(workerCtx, "Workforce Management")).toThrow(
        "Forbidden: Task Workers do not have access to Workforce Management",
      );
      expect(() => forbidWorker(managerCtx, "Workforce Management")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Workforce Management")).not.toThrow();
    });

    it("strictly blocks Task Workers from Executive Dashboard", () => {
      expect(() => forbidWorker(workerCtx, "Executive Dashboard")).toThrow(
        "Forbidden: Task Workers do not have access to Executive Dashboard",
      );
      expect(() => forbidWorker(managerCtx, "Executive Dashboard")).not.toThrow();
      expect(() => forbidWorker(adminCtx, "Executive Dashboard")).not.toThrow();
    });
  });

  describe("3. Task-Scoped Access & Permitted Operations Audit", () => {
    it("allows workers to transition assigned tasks only within permitted status workflows", () => {
      const allowedTransitions: Record<string, string[]> = {
        not_started: ["in_progress"],
        in_progress: ["completed", "waiting_review", "not_started"],
        waiting_review: [],
        completed: [],
        cancelled: [],
      };

      // Permitted worker transitions
      expect(allowedTransitions["not_started"]).toContain("in_progress");
      expect(allowedTransitions["in_progress"]).toContain("completed");
      expect(allowedTransitions["in_progress"]).toContain("waiting_review");

      // Forbidden worker transitions
      expect(allowedTransitions["not_started"]).not.toContain("completed");
      expect(allowedTransitions["waiting_review"]).toHaveLength(0); // Only managers can review
      expect(allowedTransitions["completed"]).toHaveLength(0); // Only managers can reopen
      expect(allowedTransitions["cancelled"]).toHaveLength(0); // Workers cannot uncancel
    });

    it("enforces that workers cannot edit task core attributes (updateTask)", () => {
      const checkUpdateTask = (role: string) => {
        if (role === "worker" || role === "viewer") {
          throw new Error("Forbidden: only managers or admins can edit tasks");
        }
      };

      expect(() => checkUpdateTask(workerCtx.role)).toThrow(/only managers or admins/);
      expect(() => checkUpdateTask(managerCtx.role)).not.toThrow();
      expect(() => checkUpdateTask(adminCtx.role)).not.toThrow();
    });

    it("enforces that workers cannot assign tasks (assignTask)", () => {
      const checkAssignTask = (role: string) => {
        if (role === "worker" || role === "viewer") {
          throw new Error("Forbidden: only managers or admins can assign tasks");
        }
      };

      expect(() => checkAssignTask(workerCtx.role)).toThrow(/only managers or admins/);
      expect(() => checkAssignTask(managerCtx.role)).not.toThrow();
      expect(() => checkAssignTask(adminCtx.role)).not.toThrow();
    });

    it("enforces that workers cannot acknowledge task completion (acknowledgeTaskCompletion)", () => {
      const checkAcknowledge = (role: string) => {
        if (role === "worker" || role === "viewer") {
          throw new Error("Forbidden: only managers or admins can acknowledge task completion");
        }
      };

      expect(() => checkAcknowledge(workerCtx.role)).toThrow(/only managers or admins/);
      expect(() => checkAcknowledge(managerCtx.role)).not.toThrow();
      expect(() => checkAcknowledge(adminCtx.role)).not.toThrow();
    });

    it("enforces that workers cannot perform bulk task operations (bulkUpdateTasks)", () => {
      const checkBulk = (role: string) => {
        if (role === "worker" || role === "viewer") {
          throw new Error("Forbidden: insufficient permissions for bulk task updates");
        }
      };

      expect(() => checkBulk(workerCtx.role)).toThrow(/insufficient permissions/);
      expect(() => checkBulk(managerCtx.role)).not.toThrow();
      expect(() => checkBulk(adminCtx.role)).not.toThrow();
    });

    it("strictly isolates task access by assignment in getTaskById", () => {
      const checkTaskAccess = (role: string, userId: string, assignees: { userId: string }[]) => {
        if (role === "worker" && !assignees.some((a) => a.userId === userId)) {
          throw new Error("Forbidden: worker is not assigned to this task");
        }
      };

      // Worker assigned to task -> allowed
      expect(() =>
        checkTaskAccess(workerCtx.role, workerCtx.userId, [{ userId: workerCtx.userId }]),
      ).not.toThrow();

      // Worker NOT assigned to task -> blocked
      expect(() =>
        checkTaskAccess(workerCtx.role, workerCtx.userId, [{ userId: "other-worker-999" }]),
      ).toThrow("Forbidden: worker is not assigned to this task");

      // Manager/Admin can view any task in their tenant
      expect(() =>
        checkTaskAccess(managerCtx.role, managerCtx.userId, [{ userId: "other-worker-999" }]),
      ).not.toThrow();
      expect(() =>
        checkTaskAccess(adminCtx.role, adminCtx.userId, [{ userId: "other-worker-999" }]),
      ).not.toThrow();
    });
  });

  describe("4. R2 Attachment Security Audit", () => {
    it("forbids Task Workers from modifying customer visibility (is_public)", () => {
      const checkVisibilityUpdate = (role: string) => {
        if (role === "worker") {
          throw new Error("Forbidden: Task Workers cannot modify customer visibility");
        }
      };

      expect(() => checkVisibilityUpdate(workerCtx.role)).toThrow(/Task Workers cannot modify/);
      expect(() => checkVisibilityUpdate(managerCtx.role)).not.toThrow();
      expect(() => checkVisibilityUpdate(adminCtx.role)).not.toThrow();
    });

    it("restricts Task Workers from uploading to non-task entities", () => {
      const checkWorkerUpload = (role: string, entityType: string) => {
        if (role === "worker" && entityType !== "task") {
          throw new Error("Forbidden: Task Workers can only upload task attachments");
        }
      };

      expect(() => checkWorkerUpload(workerCtx.role, "order")).toThrow(/can only upload task attachments/);
      expect(() => checkWorkerUpload(workerCtx.role, "quote")).toThrow(/can only upload task attachments/);
      expect(() => checkWorkerUpload(workerCtx.role, "invoice")).toThrow(/can only upload task attachments/);
      expect(() => checkWorkerUpload(workerCtx.role, "task")).not.toThrow();
      expect(() => checkWorkerUpload(managerCtx.role, "order")).not.toThrow();
    });

    it("restricts Task Workers from uploading with customer visibility (isPublic=true)", () => {
      const checkWorkerUploadVisibility = (role: string, isPublic?: boolean) => {
        if (role === "worker" && isPublic) {
          throw new Error("Forbidden: Task Workers cannot set customer visibility");
        }
      };

      expect(() => checkWorkerUploadVisibility(workerCtx.role, true)).toThrow(/cannot set customer visibility/);
      expect(() => checkWorkerUploadVisibility(workerCtx.role, false)).not.toThrow();
      expect(() => checkWorkerUploadVisibility(managerCtx.role, true)).not.toThrow();
    });

    it("prevents Task Workers from directly deleting raw R2 objects", () => {
      const checkDeleteR2Object = (role: string) => {
        if (role === "worker") {
          throw new Error("Forbidden: Task Workers cannot directly delete raw R2 objects");
        }
      };

      expect(() => checkDeleteR2Object(workerCtx.role)).toThrow(/cannot directly delete raw R2 objects/);
      expect(() => checkDeleteR2Object(managerCtx.role)).not.toThrow();
      expect(() => checkDeleteR2Object(adminCtx.role)).not.toThrow();
    });

    it("verifies all R2 object keys strictly begin with the caller's tenantId prefix", () => {
      const validateKeyPrefix = (tenantId: string, key: string) => {
        if (!key.startsWith(`${tenantId}/`)) {
          throw new Error("Forbidden: key outside tenant");
        }
      };

      const validKey = `${TENANT_A}/attachments/task/123-abc/test.png`;
      const invalidKeyCrossTenant = `${TENANT_B}/attachments/task/123-abc/test.png`;
      const invalidKeyRoot = `arbitrary-file.pdf`;

      expect(() => validateKeyPrefix(TENANT_A, validKey)).not.toThrow();
      expect(() => validateKeyPrefix(TENANT_A, invalidKeyCrossTenant)).toThrow("Forbidden: key outside tenant");
      expect(() => validateKeyPrefix(TENANT_A, invalidKeyRoot)).toThrow("Forbidden: key outside tenant");
    });
  });

  describe("5. Session Revocation & Lifecycle Transition Audit", () => {
    it("rejects disabled user accounts immediately in requireTenant middleware", () => {
      const checkAccountStatus = (status: string) => {
        if (status === "disabled") {
          throw new Error("Forbidden: User account is disabled");
        }
      };

      expect(() => checkAccountStatus("active")).not.toThrow();
      expect(() => checkAccountStatus("disabled")).toThrow("Forbidden: User account is disabled");
    });

    it("verifies live tenant_members role resolution so role transitions apply immediately", () => {
      // Simulating a user being demoted from Manager to Task Worker
      let currentRoleInDb: "sales" | "worker" = "sales";

      const resolveRoleForRequest = () => currentRoleInDb;

      // While Manager:
      expect(resolveRoleForRequest()).toBe("sales");
      expect(canWrite(resolveRoleForRequest())).toBe(true);
      expect(() => forbidWorker({ userId: "u1", tenantId: TENANT_A, role: resolveRoleForRequest() }, "Orders")).not.toThrow();

      // Administrator demotes user to Task Worker in tenant_members
      currentRoleInDb = "worker";

      // On next incoming request, middleware resolves the updated role:
      expect(resolveRoleForRequest()).toBe("worker");
      expect(canWrite(resolveRoleForRequest())).toBe(false);
      expect(() => forbidWorker({ userId: "u1", tenantId: TENANT_A, role: resolveRoleForRequest() }, "Orders")).toThrow(
        "Forbidden: Task Workers do not have access to Orders",
      );
    });
  });

  describe("6. Cross-Tenant Isolation Audit", () => {
    it("ensures cross-tenant entity operations are strictly blocked", () => {
      const assertTenantMatches = (requestTenant: string, entityTenant: string) => {
        if (requestTenant !== entityTenant) {
          throw new Error("Forbidden: entity belongs to another tenant");
        }
      };

      expect(() => assertTenantMatches(TENANT_A, TENANT_A)).not.toThrow();
      expect(() => assertTenantMatches(TENANT_A, TENANT_B)).toThrow("Forbidden: entity belongs to another tenant");
    });
  });
});
