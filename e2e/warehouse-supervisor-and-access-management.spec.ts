import { test, expect, signIn, MOCK_TENANT_ID } from "./fixtures/auth";
import type { Page } from "@playwright/test";

const WAREHOUSE_USER_ID = "44444444-4444-4444-4444-444444444444";

async function signInAsWarehouseSupervisor(page: Page): Promise<void> {
  const WAREHOUSE_SESSION = {
    access_token: "mock-access-token-warehouse-session",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: "mock-refresh-token",
    user: {
      id: WAREHOUSE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "warehouse_user@pelecanon.local",
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { username: "warehouse_user" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(WAREHOUSE_SESSION),
    });
  });

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(WAREHOUSE_SESSION.user),
    });
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

  await page.route("**/rest/v1/tenant_members**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify([
        {
          tenant_id: MOCK_TENANT_ID,
          role: "warehouse_supervisor",
          user_id: WAREHOUSE_USER_ID,
        },
      ]),
    });
  });

  await page.route("**/rest/v1/app_users**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        id: WAREHOUSE_USER_ID,
        username: "warehouse_user",
        display_name: "Warehouse Supervisor",
        status: "active",
        tenant_id: MOCK_TENANT_ID,
      }),
    });
  });

  await page.addInitScript(
    ({ session, userKey, sessionKey }) => {
      window.localStorage.setItem(sessionKey, JSON.stringify(session));
      window.localStorage.setItem(userKey, "warehouse_user");
    },
    {
      session: WAREHOUSE_SESSION,
      userKey: "pelecanon:username",
      sessionKey: "pelecanon-auth-token",
    },
  );

  await page.goto("/admin");
  await page.waitForLoadState("domcontentloaded");
}

test.describe("MANDATORY 'WAREHOUSE SUPERVISOR' CUSTOM ROLE & ACCESS MANAGEMENT E2E", () => {
  test.describe("1. Administrator Access Management Interface (/admin/team)", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page);
    });

    test("renders the 3 main tabs: Team Members, Predefined Profiles, and Custom Roles", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      // Verify Page Title
      await expect(
        page.getByRole("heading", { name: /إدارة الفريق والصلاحيات|Team & Access Management/i }).first(),
      ).toBeVisible({ timeout: 10000 });

      // Verify the 3 Tabs Triggers
      const membersTab = page.getByRole("tab", { name: /الموظفون|Team Members/i });
      const profilesTab = page.getByRole("tab", { name: /الملفات الأساسية|Access Profiles/i });
      const rolesTab = page.getByRole("tab", { name: /الأدوار المخصصة|Custom Roles/i });

      await expect(membersTab).toBeVisible();
      await expect(profilesTab).toBeVisible();
      await expect(rolesTab).toBeVisible();
    });

    test("Predefined Profiles tab displays 3 dynamic adjustable cards and 2 system profiles", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      const profilesTab = page.getByRole("tab", { name: /الملفات الأساسية|Access Profiles/i });
      await profilesTab.click();

      // Check Administrator, Manager, Task Worker cards
      await expect(
        page.getByText(/مسؤول النظام \(Administrator\)|Administrator/i).first(),
      ).toBeVisible({ timeout: 10000 });

      await expect(
        page.getByText(/مدير مبيعات وتشغيل \(Manager\)|Operations & Sales Manager/i).first(),
      ).toBeVisible();

      await expect(
        page.getByText(/فني مهام \(Task Worker\)|Task Worker/i).first(),
      ).toBeVisible();

      // Check Owner and Viewer cards
      await expect(
        page.getByText(/المالك \(Owner\)|Owner/i).first(),
      ).toBeVisible();

      await expect(
        page.getByText(/مشاهد \(Viewer\)|Viewer/i).first(),
      ).toBeVisible();

      // Dynamic profiles have "Edit Access" button
      const editButtons = page.getByRole("button", { name: /تعديل الصلاحيات|Edit Access/i });
      await expect(editButtons.first()).toBeVisible();
    });

    test("Custom Roles tab displays Warehouse Supervisor and allows creating custom roles", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      const rolesTab = page.getByRole("tab", { name: /الأدوار المخصصة|Custom Roles/i });
      await rolesTab.click();

      // Check Custom Role creation button
      const createRoleBtn = page.getByRole("button", { name: /إنشاء دور مخصص جديد|Create New Custom Role|إنشاء أول دور مخصص/i });
      await expect(createRoleBtn).toBeVisible({ timeout: 10000 });

      // Check Warehouse Supervisor card
      await expect(
        page.getByText(/مشرف المستودع والإنتاج|Warehouse Supervisor/i).first(),
      ).toBeVisible({ timeout: 10000 });
    });

    test("Visual Access Editor dialog opens with 4 simple access levels and Special Access", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      const profilesTab = page.getByRole("tab", { name: /الملفات الأساسية|Access Profiles/i });
      await profilesTab.click();

      // Click "Edit Access" on the Manager card
      const editButtons = page.getByRole("button", { name: /تعديل الصلاحيات|Edit Access/i });
      await editButtons.first().click();

      // Visual Access Editor dialog is open
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10000 });

      // Verifies 4 Simple Access Level button options (No Access, View, Work, Manage)
      await expect(dialog.getByRole("button", { name: /لا وصول|No Access/i }).first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: /عرض فقط|View/i }).first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: /تشغيل|Work/i }).first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: /إدارة|Manage/i }).first()).toBeVisible();

      // Verifies Special Access Card for sensitive authorities
      await expect(
        dialog.getByText(/صلاحيات حساسة إضافية|Special Sensitive Access/i).first(),
      ).toBeVisible();

      // Close dialog
      await page.keyboard.press("Escape");
    });
  });

  test.describe("2. Mandatory Warehouse Supervisor Execution & Direct URL Protection", () => {
    test("Warehouse Supervisor logs in and automatically redirects to permitted section (/admin/orders)", async ({
      page,
    }) => {
      await signInAsWarehouseSupervisor(page);

      // Verify redirect target: Dashboard is not permitted, so redirects to permitted section
      await expect(page).toHaveURL(/\/admin\/(orders|products)/, { timeout: 10000 });
    });

    test("Warehouse Supervisor sidebar renders ONLY permitted sections and excludes restricted modules", async ({
      page,
    }) => {
      await signInAsWarehouseSupervisor(page);
      await page.waitForURL(/\/admin\/(orders|products)/, { timeout: 10000 });

      const sidebarNav = page.locator("aside nav");

      // Permitted links MUST be visible
      await expect(sidebarNav.locator('a[href="/admin/products"]')).toBeVisible();
      await expect(sidebarNav.locator('a[href="/admin/inventory"]')).toBeVisible();
      await expect(sidebarNav.locator('a[href="/admin/orders"]')).toBeVisible();
      await expect(sidebarNav.locator('a[href="/admin/work-orders"]')).toBeVisible();
      await expect(sidebarNav.locator('a[href="/admin/deliveries"]')).toBeVisible();

      // Restricted links MUST NOT exist in the sidebar
      await expect(sidebarNav.locator('a[href="/admin"]')).toHaveCount(0); // Dashboard
      await expect(sidebarNav.locator('a[href="/admin/crm"]')).toHaveCount(0); // CRM
      await expect(sidebarNav.locator('a[href="/admin/quotes"]')).toHaveCount(0); // Quotes
      await expect(sidebarNav.locator('a[href="/admin/invoices"]')).toHaveCount(0); // Invoices
      await expect(sidebarNav.locator('a[href="/admin/cost-analysis"]')).toHaveCount(0); // Cost Analysis
      await expect(sidebarNav.locator('a[href="/admin/team"]')).toHaveCount(0); // Team
      await expect(sidebarNav.locator('a[href="/admin/settings"]')).toHaveCount(0); // Settings
    });

    test("Direct URL visits to /admin/crm, /admin/quotes, and /admin/settings redirect cleanly without error", async ({
      page,
    }) => {
      await signInAsWarehouseSupervisor(page);
      await page.waitForURL(/\/admin\/(orders|products)/, { timeout: 10000 });

      // 1. Direct visit to /admin/crm
      await page.goto("/admin/crm");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/admin\/(orders|products)/, { timeout: 10000 });

      // 2. Direct visit to /admin/quotes
      await page.goto("/admin/quotes");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/admin\/(orders|products)/, { timeout: 10000 });

      // 3. Direct visit to /admin/settings
      await page.goto("/admin/settings");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/admin\/(orders|products)/, { timeout: 10000 });

      // 4. Direct visit to /admin/team
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/admin\/(orders|products)/, { timeout: 10000 });

      // 5. Direct visit to /admin/inventory succeeds because Inventory is permitted!
      await page.goto("/admin/inventory");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/admin\/inventory/, { timeout: 10000 });
      await expect(
        page.getByRole("heading", { name: /إدارة المخزون|Inventory/i }).first(),
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
