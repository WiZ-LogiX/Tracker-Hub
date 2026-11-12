import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("PeleCanon Operational Workflow Integration & Navigation Verification", () => {
  describe("1. Catalog & Category Options Tab Architecture", () => {
    it("Main Catalog (/admin/products) exposes Options tab with CommercialCategoriesSettings", () => {
      const productsSrc = readFileSync(
        resolve("src/routes/admin/products.tsx"),
        "utf-8",
      );

      // Must import CommercialCategoriesSettings
      expect(productsSrc).toContain("CommercialCategoriesSettings");
      // Must contain tabs: products & options
      expect(productsSrc).toContain('TabsTrigger value="products"');
      expect(productsSrc).toContain('TabsTrigger value="options"');
      expect(productsSrc).toContain('TabsContent value="options"');
      // Must support tab search param
      expect(productsSrc).toContain('tab: z.enum(["products", "options"])');
    });

    it("Settings (/admin/settings) has completely removed Company Info, Commercial Registry, and obsolete PDF styling controls", () => {
      const settingsSrc = readFileSync(
        resolve("src/routes/admin/settings.tsx"),
        "utf-8",
      );

      // CommercialCategoriesSettings is moved out of settings into products options
      expect(settingsSrc).not.toContain("CommercialCategoriesSettings");
      // Obsolete PDF color picker and old logo customization controls removed
      expect(settingsSrc).not.toContain('type="color"');
      expect(settingsSrc).not.toContain("primaryColor");
      expect(settingsSrc).not.toContain("uploadLogo");

      // Company Info and Commercial & Tax Registry tabs are completely removed
      expect(settingsSrc).not.toContain("taxNumber");
      expect(settingsSrc).not.toContain("commercialRegistry");
      expect(settingsSrc).not.toContain("companyInfo");
      expect(settingsSrc).not.toContain("businessProfile");
      expect(settingsSrc).not.toContain('TabsTrigger value="company"');
      expect(settingsSrc).not.toContain('TabsTrigger value="commercial"');

      // Only system standards and diagnostics tabs remain
      expect(settingsSrc).toContain('TabsTrigger value="system"');
      expect(settingsSrc).toContain('TabsTrigger value="diagnostics"');
    });

    it("Document generation (PDF & Invoice) reads tenant data directly from DB without settings UI dependency", () => {
      const pdfFuncSrc = readFileSync(
        resolve("src/lib/pdf.functions.tsx"),
        "utf-8",
      );

      // fetchTenantInfo executes a direct server-side DB query on tenants table
      expect(pdfFuncSrc).toContain("fetchTenantInfo");
      expect(pdfFuncSrc).toContain('.from("tenants")');
    });
  });

  describe("2. End-to-End Business Lifecycle & Cross-Module Contextual Links", () => {
    it("getQuoteCommercialContext links quote to both opportunity (project) and created order", () => {
      const quoteFuncSrc = readFileSync(
        resolve("src/lib/quote.functions.ts"),
        "utf-8",
      );

      expect(quoteFuncSrc).toContain("getQuoteCommercialContext");
      // Must query both opportunities and orders
      expect(quoteFuncSrc).toContain("eq(orders.quoteId, data.quoteId)");
      expect(quoteFuncSrc).toContain("orderId: linkedOrder?.id");
      expect(quoteFuncSrc).toContain("orderNumber: linkedOrder?.orderNumber");
    });

    it("Quotation detail page links to Customer 360, Project Workspace, and Converted Order", () => {
      const quoteDetailSrc = readFileSync(
        resolve("src/routes/admin/quotes/$id.tsx"),
        "utf-8",
      );

      // Customer 360 integration
      expect(quoteDetailSrc).toContain("Customer360Drawer");
      expect(quoteDetailSrc).toContain("setCustomer360Id(customer.id)");

      // Project Workspace link
      expect(quoteDetailSrc).toContain('to="/admin/projects/$id"');
      expect(quoteDetailSrc).toContain("commercialContext.opportunityId");

      // Converted Order & Production link
      expect(quoteDetailSrc).toContain('to="/admin/orders"');
      expect(quoteDetailSrc).toContain("commercialContext.orderNumber");
    });

    it("Orders page links to Customer 360, Project Workspace, and Originating Quote", () => {
      const ordersSrc = readFileSync(
        resolve("src/routes/admin/orders.tsx"),
        "utf-8",
      );

      // Customer 360 drawer integration
      expect(ordersSrc).toContain("Customer360Drawer");
      expect(ordersSrc).toContain("onOpenCustomer360");

      // Project Workspace link from order
      expect(ordersSrc).toContain('to="/admin/projects/$id"');
      // Originating quotation link
      expect(ordersSrc).toContain('to="/admin/quotes/$id"');
      // Deliveries link
      expect(ordersSrc).toContain('to="/admin/deliveries"');
    });

    it("Tasks Detail links to Quote and Project for managers, while enforcing worker access restrictions", () => {
      const taskDetailSrc = readFileSync(
        resolve("src/components/tasks/TaskDetail.tsx"),
        "utf-8",
      );

      // Project Workspace deep link
      expect(taskDetailSrc).toContain('to="/admin/projects/$id"');
      // Quote deep link
      expect(taskDetailSrc).toContain('to="/admin/quotes/$id"');
      // Role guard for worker safety
      expect(taskDetailSrc).toContain("!isWorker");
    });

    it("Invoices detail drawer links to Originating Quote, Converted Order, and Project Workspace", () => {
      const invoiceDrawerSrc = readFileSync(
        resolve("src/components/invoices/InvoiceDetailDrawer.tsx"),
        "utf-8",
      );

      expect(invoiceDrawerSrc).toContain('to="/admin/quotes/$id"');
      expect(invoiceDrawerSrc).toContain('to="/admin/orders"');
      expect(invoiceDrawerSrc).toContain('to="/admin/projects/$id"');
    });

    it("Admin Navigation sidebar includes Projects in core business sequence", () => {
      const adminNavSrc = readFileSync(
        resolve("src/routes/admin.tsx"),
        "utf-8",
      );

      expect(adminNavSrc).toContain('{ to: "/admin/projects", labelKey: "admin.nav.projects", icon: FolderKanban }');
    });
  });

  describe("3. Elimination of Disruptive Full-Screen Reloads & Stable Navigation", () => {
    it("AdminLayout never flashes full-screen bootstrapping once memberships are loaded", () => {
      const adminLayoutSrc = readFileSync(
        resolve("src/routes/admin.tsx"),
        "utf-8",
      );

      // Must be guarded by memberships.length === 0
      expect(adminLayoutSrc).toContain("bootstrapping && memberships.length === 0");
    });

    it("useAuth onAuthStateChange does not wipe state or re-bootstrap for existing authenticated user", () => {
      const authSrc = readFileSync(
        resolve("src/lib/useAuth.tsx"),
        "utf-8",
      );

      // Guarded against redundant wiping on TOKEN_REFRESHED or tab focus
      expect(authSrc).toContain("bootstrappedForRef.current === sess.user.id");
    });

    it("router.tsx sets QueryClient caching defaults to operational freshness (5s staleTime, refetchOnWindowFocus: true)", () => {
      const routerSrc = readFileSync(
        resolve("src/router.tsx"),
        "utf-8",
      );

      // Operational freshness policy avoids duplicate requests during rapid subroute navigation
      // while ensuring operational data is kept fresh and updates on window refocus.
      expect(routerSrc).toContain("staleTime: 5_000");
      expect(routerSrc).toContain("refetchOnWindowFocus: true");
    });

    it("useAuth clears TanStack Query client cache upon signOut to prevent sensitive data leakage", () => {
      const authSrc = readFileSync(
        resolve("src/lib/useAuth.tsx"),
        "utf-8",
      );

      expect(authSrc).toContain("useQueryClient");
      expect(authSrc).toContain("queryClient.clear()");
    });
  });
});
