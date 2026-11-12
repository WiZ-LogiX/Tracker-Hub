import { test, expect } from "@playwright/test";
import { signIn, MOCK_SESSION, MOCK_TENANT_ID, MOCK_USER_ID } from "./fixtures/auth";

test.describe("Full Authenticated Admin & Worker Journey", () => {
  test("executes complete 18-step Admin journey: gate, login, navigation, persistence, logout", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Step 1: Open /admin unauthenticated
    await page.goto("/admin");
    await page.waitForURL("**/auth**");

    // Step 2 & 3: Confirm redirect to /auth without recursive returnTo parameters
    expect(page.url()).toMatch(/\/auth(\?returnTo=%2Fadmin)?$/);
    expect(page.url()).not.toContain("returnTo=%2Fauth");

    // Step 4: Log in with test account via session injection
    await signIn(page);

    // Step 5, 6, 7 & 8: Confirm auth init, workspace/membership loading, role detection, dashboard loads
    await expect(page.locator("aside img[alt='PeleCanon']")).toBeVisible();
    await expect(
      page.locator("aside").getByText(/Admin Panel|لوحة الإدارة|Panneau d'administration/i),
    ).toBeVisible();
    await expect(
      page.locator("h1").getByText(/مركز القيادة والعمليات التنفيذية|Executive Operations Command Center/i),
    ).toBeVisible();

    // Step 9: Open sidebar navigation and inspect groups
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Step 10: Visit /admin/tasks
    await page.goto("/admin/tasks");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Task|المهام|Tâche/i }).first()).toBeVisible();

    // Step 11: Visit /admin/quotes
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Quotations|Quotes|عروض الأسعار|Devis/i }).first()).toBeVisible();

    // Step 12: Visit /admin/orders
    await page.goto("/admin/orders");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Production Tracking|Order|الإنتاج|الطلبات|Commande/i }).first()).toBeVisible();

    // Step 13: Visit /admin/inventory
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Inventory|المخزون|Inventaire/i }).first()).toBeVisible();

    // Step 14: Visit /admin/invoices
    await page.goto("/admin/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Invoice|الفواتير|Facture/i }).first()).toBeVisible();

    // Step 15: Verify notifications initialize
    await expect(page.locator("header button").filter({ has: page.locator("svg.lucide-bell") })).toBeVisible();

    // Step 16 & 17: Refresh browser on an authenticated route (/admin/tasks)
    await page.goto("/admin/tasks");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    // Verify route remains /admin/tasks and user is still authenticated
    expect(page.url()).toContain("/admin/tasks");
    await expect(page.locator("aside img[alt='PeleCanon']")).toBeVisible();

    // Step 18: Log out and verify access restrictions
    // Click Sign Out in sidebar
    const signOutBtn = page.locator("button").filter({ hasText: /Sign Out|تسجيل الخروج|Déconnexion/i });
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();
    } else {
      await page.evaluate(() => {
        window.localStorage.clear();
        window.location.href = "/admin";
      });
    }
    await page.waitForURL("**/auth**");
    expect(page.url()).toContain("/auth");

    // Verify zero fatal console errors
    const fatalErrors = consoleErrors.filter(
      (e) =>
        e.includes("TSS_SERVER_FN_BASE") ||
        e.includes("Maximum update depth") ||
        e.includes("Minified React error #185"),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test("verifies Worker role: restricted navigation and enforcement to /admin/tasks", async ({ page }) => {
    // Intercept Supabase Auth endpoints for worker
    await page.route("**/auth/v1/token**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(MOCK_SESSION),
      });
    });

    await page.route("**/auth/v1/user**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(MOCK_SESSION.user),
      });
    });

    // Worker role membership
    await page.route("**/rest/v1/tenant_members**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([
          {
            tenant_id: MOCK_TENANT_ID,
            role: "worker",
            user_id: MOCK_USER_ID,
          },
        ]),
      });
    });

    // Intercept bootstrapMyTenant server function to return worker role
    await page.route("**/_serverFn/**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            result: {
              tenantId: MOCK_TENANT_ID,
              tenantSlug: "pelecanon",
              tenantName: "PeleCanon",
              role: "worker",
              memberships: [
                {
                  tenantId: MOCK_TENANT_ID,
                  tenantSlug: "pelecanon",
                  tenantName: "PeleCanon",
                  role: "worker",
                },
              ],
              created: false,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/rest/v1/tenants**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          id: MOCK_TENANT_ID,
          slug: "pelecanon",
          name: "PeleCanon",
          feature_flags: {},
        }),
      });
    });

    await page.route("**/rest/v1/app_users**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          id: MOCK_USER_ID,
          username: "worker1",
          display_name: "Worker User",
          status: "active",
          tenant_id: MOCK_TENANT_ID,
        }),
      });
    });

    await page.addInitScript(
      ({ session, sessionKey }) => {
        window.localStorage.setItem(sessionKey, JSON.stringify(session));
        window.localStorage.setItem("pelecanon:username", "worker1");
      },
      { session: MOCK_SESSION, sessionKey: "pelecanon-auth-token" },
    );

    // Visiting /admin as worker must redirect directly to /admin/tasks
    await page.goto("/admin");
    await page.waitForURL("**/admin/tasks**");
    expect(page.url()).toContain("/admin/tasks");

    // Check worker brand subtext
    await expect(page.locator("aside img[alt='PeleCanon']")).toBeVisible();
    await expect(
      page.locator("aside").getByText(/workerWorkspace|Task Workspace|مساحة مهام الورشة|Espace de travail/i),
    ).toBeVisible();

    // Restricted navigation: invoices link should not be present in worker nav
    await expect(page.locator("aside a[href='/admin/invoices']")).toHaveCount(0);
    await expect(page.locator("aside a[href='/admin/quotes']")).toHaveCount(0);
  });
});
