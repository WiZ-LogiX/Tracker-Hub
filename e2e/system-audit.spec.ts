import { test, expect } from "./fixtures/auth";

const routesToTest = [
  { path: "/admin", name: "Admin Dashboard" },
  { path: "/admin/quotes", name: "Quotes List" },
  { path: "/admin/quotes/new", name: "New Quote Builder" },
  { path: "/admin/orders", name: "Orders" },
  { path: "/admin/customers", name: "Customers" },
  { path: "/admin/crm", name: "CRM Leads & Pipeline" },
  { path: "/admin/crm/after-sales", name: "After Sales" },
  { path: "/admin/crm/analytics", name: "CRM Analytics" },
  { path: "/admin/crm/sales", name: "CRM Sales" },
  { path: "/admin/inventory", name: "Inventory" },
  { path: "/admin/invoices", name: "Invoices" },
  { path: "/admin/deliveries", name: "Deliveries" },
  { path: "/admin/remakes", name: "Remakes" },
  { path: "/admin/tasks", name: "Tasks" },
  { path: "/admin/work-orders", name: "Work Orders" },
  { path: "/admin/cost-analysis", name: "Cost Analysis" },
  { path: "/admin/settings", name: "Settings" },
  { path: "/admin/catalog", name: "Catalog" },
  { path: "/admin/rate-card", name: "Rate Card" },
  { path: "/admin/projects", name: "Projects" },
  { path: "/admin/products", name: "Products" },
  { path: "/admin/pricing-factors", name: "Pricing Factors" },
  { path: "/admin/wastage-rules", name: "Wastage Rules" },
  { path: "/admin/discounts", name: "Discounts" },
  { path: "/admin/notifications", name: "Notifications" },
  { path: "/admin/team", name: "Team" },
  { path: "/track", name: "Public Track" },
];

test.describe("System-wide error audit", () => {
  test.setTimeout(180000);

  for (const r of routesToTest) {
    test(`route ${r.name} (${r.path})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      const badResponses: { url: string; status: number }[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });

      page.on("requestfailed", (req) => {
        failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
      });

      page.on("response", (res) => {
        if (res.status() >= 400) {
          badResponses.push({ url: res.url(), status: res.status() });
        }
      });

      const response = await page.goto(r.path, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      console.log(`[ROUTE AUDIT] ${r.name} (${r.path}) => HTTP ${response?.status()}`);
      if (consoleErrors.length > 0) {
        console.log(`  Console Errors (${consoleErrors.length}):`, consoleErrors);
      }
      if (pageErrors.length > 0) {
        console.log(`  Page Errors (${pageErrors.length}):`, pageErrors);
      }
      if (failedRequests.length > 0) {
        console.log(`  Failed Requests (${failedRequests.length}):`, failedRequests);
      }
      if (badResponses.length > 0) {
        console.log(`  Bad Responses (${badResponses.length}):`, badResponses);
      }
    });
  }
});
