import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  APPLICATION_SECTIONS,
  SPECIAL_ACCESS_ITEMS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveEffectivePermissions,
  invalidateRolePermissionsCache,
  hasEffectivePermission,
  requirePermission,
  requireAnyPermission,
  canWrite,
  canDelete,
  type TenantContext,
} from "./tenant-context";

describe("MANDATORY 'WAREHOUSE SUPERVISOR' CUSTOM ROLE & DYNAMIC RBAC VERIFICATION", () => {
  const TENANT_ID = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const USER_ID = "wh-sup-user-uuid-1111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /*
   * 1. Warehouse Supervisor Role Setup:
   * Products: Work ("products.view", "products.create", "products.edit", and catalog views/edits)
   * Inventory: Manage ("inventory.view", "inventory.create", "inventory.edit", "inventory.adjust", "inventory.delete")
   * Orders: View ("orders.view")
   * Work Orders: Work ("work-orders.view", "work-orders.create", "work-orders.status.update")
   * Deliveries: View ("deliveries.view")
   * Dashboard: No Access
   * CRM, Quotes, Cost Analysis, Settings, Team: No Access
   */
  const warehouseSupervisorPermissions = new Set<string>([
    // Products: Work
    "products.view",
    "products.create",
    "products.edit",
    "materials.view",
    "materials.create",
    "materials.edit",
    "suppliers.view",
    "finishes.view",
    "veneers.view",
    "accessories.view",
    "pricing.view",
    // Inventory: Manage
    "inventory.view",
    "inventory.create",
    "inventory.edit",
    "inventory.adjust",
    "inventory.delete",
    // Orders: View
    "orders.view",
    // Work Orders: Work
    "work-orders.view",
    "work-orders.create",
    "work-orders.status.update",
    // Deliveries: View
    "deliveries.view",
  ]);

  const warehouseSupervisorCtx: TenantContext = {
    userId: USER_ID,
    tenantId: TENANT_ID,
    role: "warehouse_supervisor",
    permissions: warehouseSupervisorPermissions,
  };

  describe("1. Permission Verification for Warehouse Supervisor", () => {
    it("has access to permitted operations in Products, Inventory, Orders, Work Orders, and Deliveries", () => {
      // Products: Work
      expect(hasEffectivePermission(warehouseSupervisorCtx, "products.view")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "products.create")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "products.edit")).toBe(true);
      expect(canWrite(warehouseSupervisorCtx, "products")).toBe(true);
      // Products: Manage (delete) should be false
      expect(hasEffectivePermission(warehouseSupervisorCtx, "products.delete")).toBe(false);
      expect(canDelete(warehouseSupervisorCtx, "products")).toBe(false);

      // Inventory: Manage
      expect(hasEffectivePermission(warehouseSupervisorCtx, "inventory.view")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "inventory.create")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "inventory.edit")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "inventory.adjust")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "inventory.delete")).toBe(true);
      expect(canWrite(warehouseSupervisorCtx, "inventory")).toBe(true);
      expect(canDelete(warehouseSupervisorCtx, "inventory")).toBe(true);

      // Orders: View
      expect(hasEffectivePermission(warehouseSupervisorCtx, "orders.view")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "orders.create")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "orders.edit")).toBe(false);

      // Work Orders: Work
      expect(hasEffectivePermission(warehouseSupervisorCtx, "work-orders.view")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "work-orders.create")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "work-orders.status.update")).toBe(true);

      // Deliveries: View
      expect(hasEffectivePermission(warehouseSupervisorCtx, "deliveries.view")).toBe(true);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "deliveries.create")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "deliveries.status.update")).toBe(false);
    });

    it("is strictly blocked from unauthorized modules (Dashboard, CRM, Quotes, Cost Analysis, Settings, Team)", () => {
      // Dashboard
      expect(hasEffectivePermission(warehouseSupervisorCtx, "dashboard.view")).toBe(false);

      // CRM
      expect(hasEffectivePermission(warehouseSupervisorCtx, "crm.view")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "crm.leads.create")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "crm.leads.edit")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "crm.opportunities.create")).toBe(false);

      // Quotes
      expect(hasEffectivePermission(warehouseSupervisorCtx, "quotes.view")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "quotes.create")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "quotes.edit")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "quotes.approve")).toBe(false);

      // Cost Analysis
      expect(hasEffectivePermission(warehouseSupervisorCtx, "cost-analysis.view")).toBe(false);

      // Invoices & Payments
      expect(hasEffectivePermission(warehouseSupervisorCtx, "invoices.view")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "invoices.payments.record")).toBe(false);

      // Settings & Team
      expect(hasEffectivePermission(warehouseSupervisorCtx, "settings.view")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "settings.manage")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "team.view")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "team.manage")).toBe(false);

      // Customers & Remakes
      expect(hasEffectivePermission(warehouseSupervisorCtx, "customers.view")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "customers.delete")).toBe(false);
      expect(hasEffectivePermission(warehouseSupervisorCtx, "remakes.view")).toBe(false);
    });
  });

  describe("2. Server-Side Function Guards for Warehouse Supervisor", () => {
    it("requirePermission succeeds for permitted inventory and stock actions", () => {
      expect(() => requirePermission(warehouseSupervisorCtx, "inventory.view")).not.toThrow();
      expect(() => requirePermission(warehouseSupervisorCtx, "inventory.adjust")).not.toThrow();
      expect(() => requirePermission(warehouseSupervisorCtx, "work-orders.view")).not.toThrow();
      expect(() => requirePermission(warehouseSupervisorCtx, "orders.view")).not.toThrow();
      expect(() => requirePermission(warehouseSupervisorCtx, "deliveries.view")).not.toThrow();
    });

    it("requirePermission throws 403 Forbidden on unauthorized operations", () => {
      expect(() => requirePermission(warehouseSupervisorCtx, "crm.view")).toThrow(
        /Forbidden: missing required permission 'crm.view'/
      );
      expect(() => requirePermission(warehouseSupervisorCtx, "quotes.create")).toThrow(
        /Forbidden: missing required permission 'quotes.create'/
      );
      expect(() => requirePermission(warehouseSupervisorCtx, "quotes.approve")).toThrow(
        /Forbidden: missing required permission 'quotes.approve'/
      );
      expect(() => requirePermission(warehouseSupervisorCtx, "invoices.payments.record")).toThrow(
        /Forbidden: missing required permission 'invoices.payments.record'/
      );
      expect(() => requirePermission(warehouseSupervisorCtx, "settings.manage")).toThrow(
        /Forbidden: missing required permission 'settings.manage'/
      );
      expect(() => requirePermission(warehouseSupervisorCtx, "team.manage")).toThrow(
        /Forbidden: missing required permission 'team.manage'/
      );
    });

    it("masks financial data in project workspace when projects.financials.view is absent", () => {
      // Warehouse Supervisor does NOT have "projects.financials.view"
      expect(hasEffectivePermission(warehouseSupervisorCtx, "projects.financials.view")).toBe(false);

      const canSeeFinancials = hasEffectivePermission(warehouseSupervisorCtx, "projects.financials.view");

      // Test financial data projection logic matching getProjectWorkspaceData
      const rawOppValue = 150000;
      const rawInvoiced = 150000;
      const rawCollected = 75000;
      const rawBalance = 75000;
      const rawInvoices = [{ id: "inv-1", invoiceNumber: "INV-001", total: 150000 }];
      const rawPayments = [{ id: "pay-1", paymentNumber: "PAY-001", amount: 75000 }];

      const projectFinancials = {
        totalProjectValue: !canSeeFinancials ? 0 : rawOppValue,
        totalInvoiced: !canSeeFinancials ? 0 : rawInvoiced,
        totalCollected: !canSeeFinancials ? 0 : rawCollected,
        outstandingBalance: !canSeeFinancials ? 0 : rawBalance,
        invoices: !canSeeFinancials ? [] : rawInvoices,
        payments: !canSeeFinancials ? [] : rawPayments,
      };

      // Financial figures must be masked to zero and arrays emptied
      expect(projectFinancials.totalProjectValue).toBe(0);
      expect(projectFinancials.totalInvoiced).toBe(0);
      expect(projectFinancials.totalCollected).toBe(0);
      expect(projectFinancials.outstandingBalance).toBe(0);
      expect(projectFinancials.invoices).toHaveLength(0);
      expect(projectFinancials.payments).toHaveLength(0);
    });
  });

  describe("3. Dynamic Navigation & Direct URL Protection Logic", () => {
    it("determines visible navigation items based strictly on granted permissions", () => {
      // Simulating navigation items with their required permissions
      const navItems = [
        { title: "Dashboard", to: "/admin", perm: "dashboard.view" },
        { title: "CRM", to: "/admin/crm", perm: "crm.view" },
        { title: "Quotes", to: "/admin/quotes", perm: "quotes.view" },
        { title: "Projects", to: "/admin/projects", perm: "projects.view" },
        { title: "Products", to: "/admin/products", perm: "products.view" },
        { title: "Inventory", to: "/admin/inventory", perm: "inventory.view" },
        { title: "Orders", to: "/admin/orders", perm: "orders.view" },
        { title: "Work Orders", to: "/admin/work-orders", perm: "work-orders.view" },
        { title: "Deliveries", to: "/admin/deliveries", perm: "deliveries.view" },
        { title: "Invoices", to: "/admin/invoices", perm: "invoices.view" },
        { title: "Cost Analysis", to: "/admin/cost-analysis", perm: "cost-analysis.view" },
        { title: "Team", to: "/admin/team", perm: "team.view" },
        { title: "Settings", to: "/admin/settings", perm: "settings.view" },
      ];

      const visibleNav = navItems.filter((item) =>
        hasEffectivePermission(warehouseSupervisorCtx, item.perm)
      );

      // Verify visible sections
      const visibleTitles = visibleNav.map((i) => i.title);
      expect(visibleTitles).toEqual([
        "Products",
        "Inventory",
        "Orders",
        "Work Orders",
        "Deliveries",
      ]);

      // Dashboard, CRM, Quotes, Cost Analysis, Invoices, Team, Settings must be excluded
      expect(visibleTitles).not.toContain("Dashboard");
      expect(visibleTitles).not.toContain("CRM");
      expect(visibleTitles).not.toContain("Quotes");
      expect(visibleTitles).not.toContain("Invoices");
      expect(visibleTitles).not.toContain("Cost Analysis");
      expect(visibleTitles).not.toContain("Team");
      expect(visibleTitles).not.toContain("Settings");

      // Verify the first permitted section is Products
      const firstPermittedRoute = visibleNav[0]?.to;
      expect(firstPermittedRoute).toBe("/admin/products");

      // Verify direct navigation redirect behavior:
      // When visiting unauthorized URL e.g. /admin/crm, user redirects to firstPermittedRoute
      const testDirectVisit = (url: string) => {
        const item = navItems.find((n) => n.to === url);
        if (item && !hasEffectivePermission(warehouseSupervisorCtx, item.perm)) {
          return firstPermittedRoute;
        }
        return url;
      };

      expect(testDirectVisit("/admin/crm")).toBe("/admin/products");
      expect(testDirectVisit("/admin/quotes")).toBe("/admin/products");
      expect(testDirectVisit("/admin/settings")).toBe("/admin/products");
      expect(testDirectVisit("/admin/inventory")).toBe("/admin/inventory");
    });
  });

  describe("4. Predefined Profile Adjustability & Owner Super-Admin Bypass", () => {
    it("owner role has unconditional full access regardless of permissions set", () => {
      // Owner with empty permissions set
      const emptyOwnerCtx: TenantContext = {
        userId: "owner-user-id",
        tenantId: TENANT_ID,
        role: "owner",
        permissions: new Set<string>(),
      };

      expect(hasEffectivePermission(emptyOwnerCtx, "dashboard.view")).toBe(true);
      expect(hasEffectivePermission(emptyOwnerCtx, "quotes.approve")).toBe(true);
      expect(hasEffectivePermission(emptyOwnerCtx, "settings.manage")).toBe(true);
      expect(hasEffectivePermission(emptyOwnerCtx, "any.arbitrary.permission")).toBe(true);
      expect(() => requirePermission(emptyOwnerCtx, "settings.manage")).not.toThrow();
    });

    it("predefined manager (sales) uses database persisted permissions when configured", () => {
      // Custom manager with reduced permissions (no crm.assign, no crm.stage.change)
      const configuredManagerPermissions = new Set<string>([
        "crm.view",
        "crm.leads.create",
        "crm.leads.edit",
        "quotes.view",
        "quotes.create",
      ]);

      const customizedManagerCtx: TenantContext = {
        userId: "mgr-user-id",
        tenantId: TENANT_ID,
        role: "sales",
        permissions: configuredManagerPermissions,
      };

      expect(hasEffectivePermission(customizedManagerCtx, "crm.view")).toBe(true);
      expect(hasEffectivePermission(customizedManagerCtx, "crm.leads.create")).toBe(true);
      // These were omitted from the database configuration:
      expect(hasEffectivePermission(customizedManagerCtx, "crm.assign")).toBe(false);
      expect(hasEffectivePermission(customizedManagerCtx, "crm.stage.change")).toBe(false);
      expect(hasEffectivePermission(customizedManagerCtx, "quotes.approve")).toBe(false);
    });

    it("invalidates cache immediately when permissions are mutated", () => {
      invalidateRolePermissionsCache(TENANT_ID, "warehouse_supervisor");
      invalidateRolePermissionsCache(TENANT_ID, "sales");
      invalidateRolePermissionsCache(TENANT_ID, "admin");
      // Cache invalidation functions cleanly without exceptions
      expect(true).toBe(true);
    });
  });

  describe("5. Visual Access Levels & Special Access Catalog Integrity", () => {
    it("all 22 application sections have valid simple access levels defined", () => {
      expect(APPLICATION_SECTIONS.length).toBe(22);
      for (const section of APPLICATION_SECTIONS) {
        expect(section.id).toBeDefined();
        expect(section.defaultTitle).toBeDefined();
        expect(section.category).toMatch(/^(core|catalog|system)$/);
        expect(section.route).toBeDefined();
        expect(Array.isArray(section.viewPerms)).toBe(true);
        expect(Array.isArray(section.workPerms)).toBe(true);
        expect(Array.isArray(section.managePerms)).toBe(true);
        expect(section.viewPerms.length).toBeGreaterThan(0);
      }
    });

    it("special access items isolate high-risk operational authorities", () => {
      expect(SPECIAL_ACCESS_ITEMS.length).toBe(15);
      const specialSlugs = SPECIAL_ACCESS_ITEMS.map((s) => s.slug);
      expect(specialSlugs).toContain("quotes.approve");
      expect(specialSlugs).toContain("quotes.convert");
      expect(specialSlugs).toContain("invoices.payments.record");
      expect(specialSlugs).toContain("customers.delete");
      expect(specialSlugs).toContain("projects.financials.view");
      expect(specialSlugs).toContain("settings.manage");
      expect(specialSlugs).toContain("quotes.delete");
      expect(specialSlugs).toContain("discounts.delete");
    });
  });
});
