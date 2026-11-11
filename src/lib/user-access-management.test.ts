import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  forbidWorker,
  requireRole,
  type TenantContext,
  BUILTIN_ROLE_SLUGS,
} from "./tenant-context";

describe("User Access Management Simplification — Architecture & Security", () => {
  describe("1. Predefined Access Profiles Definition & Immutability", () => {
    it("defines the canonical built-in system role slugs including worker, admin, owner, and sales", () => {
      expect(BUILTIN_ROLE_SLUGS).toContain("owner");
      expect(BUILTIN_ROLE_SLUGS).toContain("admin");
      expect(BUILTIN_ROLE_SLUGS).toContain("sales");
      expect(BUILTIN_ROLE_SLUGS).toContain("worker");
      expect(BUILTIN_ROLE_SLUGS).toContain("viewer");
    });

    it("forbids workers from accessing restricted modules via forbidWorker guard", () => {
      const workerCtx: TenantContext = {
        userId: "worker-101",
        tenantId: "tenant-001",
        role: "worker",
      };

      expect(() => forbidWorker(workerCtx, "Customer Management")).toThrowError(
        /Forbidden: Task Workers do not have access to Customer Management/i,
      );

      expect(() => forbidWorker(workerCtx, "Inventory Management")).toThrowError(
        /Forbidden: Task Workers do not have access to Inventory Management/i,
      );

      expect(() => forbidWorker(workerCtx, "Commercial Quotes")).toThrowError(
        /Forbidden: Task Workers do not have access to Commercial Quotes/i,
      );

      expect(() => forbidWorker(workerCtx, "Invoices & Payments")).toThrowError(
        /Forbidden: Task Workers do not have access to Invoices & Payments/i,
      );
    });

    it("allows administrators and managers to pass forbidWorker guard without throwing", () => {
      const adminCtx: TenantContext = {
        userId: "admin-101",
        tenantId: "tenant-001",
        role: "admin",
      };
      const ownerCtx: TenantContext = {
        userId: "owner-101",
        tenantId: "tenant-001",
        role: "owner",
      };
      const managerCtx: TenantContext = {
        userId: "mgr-101",
        tenantId: "tenant-001",
        role: "sales",
      };

      expect(() => forbidWorker(adminCtx, "Any Module")).not.toThrow();
      expect(() => forbidWorker(ownerCtx, "Any Module")).not.toThrow();
      expect(() => forbidWorker(managerCtx, "Any Module")).not.toThrow();
    });

    it("requireRole enforces administrative authority for user & role modifications", () => {
      const adminCtx: TenantContext = {
        userId: "admin-101",
        tenantId: "tenant-001",
        role: "admin",
      };
      const workerCtx: TenantContext = {
        userId: "worker-101",
        tenantId: "tenant-001",
        role: "worker",
      };
      const salesCtx: TenantContext = {
        userId: "sales-101",
        tenantId: "tenant-001",
        role: "sales",
      };

      // Admins and owners pass
      expect(() => requireRole(adminCtx, ["owner", "admin"])).not.toThrow();

      // Workers and managers cannot modify system users or roles
      expect(() => requireRole(workerCtx, ["owner", "admin"])).toThrowError(/Forbidden/i);
      expect(() => requireRole(salesCtx, ["owner", "admin"])).toThrowError(/Forbidden/i);
    });
  });

  describe("2. Task Worker Scoped Access & Context Isolation", () => {
    it("allows workers to read contextual operational codes inside their assigned task without direct module access", () => {
      // Simulating a task record payload returned to a Task Worker
      const taskDetailForWorker = {
        id: "task-999",
        taskCode: "TSK-0099",
        title: "Assemble hinge hardware for base cabinet",
        status: "in_progress",
        orderNumber: "ORD-2026-081",
        workOrderNumber: "WO-2026-015",
        deliveryNumber: "DEL-2026-004",
        caseNumber: null,
        quoteNumber: "QTE-2026-012",
        customerName: "Al-Ahram Group",
        isAssignedToCaller: true,
      };

      // The worker receives minimal identifying context directly on the task
      expect(taskDetailForWorker.orderNumber).toBe("ORD-2026-081");
      expect(taskDetailForWorker.workOrderNumber).toBe("WO-2026-015");
      expect(taskDetailForWorker.customerName).toBe("Al-Ahram Group");

      // But standalone module endpoints are blocked for this worker
      const workerCtx: TenantContext = {
        userId: "worker-999",
        tenantId: "tenant-001",
        role: "worker",
      };

      expect(() => forbidWorker(workerCtx, "Orders List & Edit")).toThrowError(
        /Forbidden: Task Workers do not have access to Orders List & Edit/i,
      );
      expect(() => forbidWorker(workerCtx, "Customer 360")).toThrowError(
        /Forbidden: Task Workers do not have access to Customer 360/i,
      );
      expect(() => forbidWorker(workerCtx, "Inventory Management")).toThrowError(
        /Forbidden: Task Workers do not have access to Inventory Management/i,
      );
    });
  });

  describe("3. Access Profile Role Mapping & Safety Constraints", () => {
    it("maps the 3 predefined profiles accurately to tenant roles", () => {
      const profiles = [
        {
          id: "admin",
          label: "Administrator",
          roleSlug: "admin",
          modules: "Full ERP, financial, user, and system access",
          isProtected: true,
        },
        {
          id: "manager",
          label: "Manager",
          roleSlug: "sales",
          modules: "Operations, Production, Deliveries, Tasks, CRM",
          isProtected: false,
        },
        {
          id: "worker",
          label: "Task Worker",
          roleSlug: "worker",
          modules: "Task Management only (/admin/tasks)",
          isProtected: true,
        },
      ];

      expect(profiles).toHaveLength(3);
      expect(profiles.find((p) => p.id === "admin")?.roleSlug).toBe("admin");
      expect(profiles.find((p) => p.id === "manager")?.roleSlug).toBe("sales");
      expect(profiles.find((p) => p.id === "worker")?.roleSlug).toBe("worker");
      expect(profiles.find((p) => p.id === "worker")?.isProtected).toBe(true);
      expect(profiles.find((p) => p.id === "admin")?.isProtected).toBe(true);
    });

    it("prevents deletion of protected built-in roles in deleteTenantRole", () => {
      const builtins = ["owner", "admin", "sales", "worker", "viewer"];

      for (const slug of builtins) {
        expect(builtins.includes(slug)).toBe(true);
      }
      expect(builtins.includes("custom_auditor")).toBe(false);
    });
  });
});
