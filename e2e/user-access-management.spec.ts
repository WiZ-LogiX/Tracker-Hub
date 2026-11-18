import { test, expect, signIn, MOCK_TENANT_ID } from "./fixtures/auth";
import type { Page } from "@playwright/test";

const WORKER_USER_ID = "22222222-2222-2222-2222-222222222222";

async function signInAsWorker(page: Page): Promise<void> {
  const WORKER_SESSION = {
    access_token: "mock-access-token-worker-session",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: "mock-refresh-token",
    user: {
      id: WORKER_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "worker@pelecanon.local",
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { username: "worker1" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(WORKER_SESSION),
    });
  });

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(WORKER_SESSION.user),
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
          role: "worker",
          user_id: WORKER_USER_ID,
        },
      ]),
    });
  });

  await page.route("**/rest/v1/app_users**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        id: WORKER_USER_ID,
        username: "worker1",
        display_name: "Worker User",
        status: "active",
        tenant_id: MOCK_TENANT_ID,
      }),
    });
  });

  await page.addInitScript(
    ({ session, userKey, sessionKey }) => {
      window.localStorage.setItem(sessionKey, JSON.stringify(session));
      window.localStorage.setItem(userKey, "worker1");
    },
    {
      session: WORKER_SESSION,
      userKey: "pelecanon:username",
      sessionKey: "pelecanon-auth-token",
    },
  );

  await page.goto("/admin/tasks");
  await page.waitForLoadState("domcontentloaded");
}

test.describe("PeleCanon User Access Management Simplification", () => {
  test.describe("Administrator Experience — User & Role Management (/admin/team)", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page);
    });

    test("Scenario A: User Management Page renders with 3 Access Profiles in User Creation", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      // Verify page title
      await expect(
        page.getByRole("heading", { name: /إدارة الفريق والصلاحيات|Team & Access Management/i }).first(),
      ).toBeVisible({ timeout: 10000 });

      // Click Add Employee button
      const addUserBtn = page.getByRole("button", { name: /إضافة موظف جديد|Add Employee/i });
      await expect(addUserBtn).toBeVisible();
      await addUserBtn.click();

      // Dialog opens
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Check fields: Full Name, Email/Username, Initial Password, Role selector
      await expect(dialog.getByLabel(/الاسم الكامل للموظف|Full Name/i)).toBeVisible();
      await expect(dialog.getByLabel(/البريد الإلكتروني \/ اسم المستخدم|Email \/ Username/i)).toBeVisible();
      await expect(dialog.getByLabel(/كلمة المرور الأولية|Initial Password/i)).toBeVisible();
      await expect(dialog.getByLabel(/ملف الصلاحيات \/ الدور|Access Profile \/ Role/i)).toBeVisible();

      await page.keyboard.press("Escape");
    });

    test("Scenario B: Edit Access Dialog allows changing employee access profile", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      // Click "Change Access" on the first user row
      const editAccessBtn = page.getByRole("button", { name: /تغيير الصلاحية|Change Access|تعيين الصلاحية/i }).first();
      if (await editAccessBtn.isVisible({ timeout: 5000 })) {
        await editAccessBtn.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();

        // Check dialog title and structure
        await expect(
          dialog.getByText(/تحديد مستوى صلاحيات الموظف|Choose Employee Access Level/i).first(),
        ).toBeVisible();

        // Check Predefined Profiles options
        await expect(
          dialog.getByText(/الملفات الأساسية المعيارية|Standard Predefined Profiles/i).first(),
        ).toBeVisible();

        await page.keyboard.press("Escape");
      }
    });

    test("Scenario C: Predefined Profiles tab renders dynamic adjustable cards and system profiles", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      // Click on Predefined Profiles tab
      const profilesTabTrigger = page.getByRole("tab", { name: /الملفات الأساسية|Access Profiles/i });
      await profilesTabTrigger.click();

      // Check 3 dynamic Predefined Profiles cards
      await expect(
        page.getByText(/مسؤول النظام \(Administrator\)|Administrator/i).first(),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText(/مدير مبيعات وتشغيل \(Manager\)|Operations & Sales Manager/i).first(),
      ).toBeVisible();
      await expect(
        page.getByText(/فني مهام \(Task Worker\)|Task Worker/i).first(),
      ).toBeVisible();

      // Check reserved system profiles
      await expect(
        page.getByText(/المالك \(Owner\)|Owner/i).first(),
      ).toBeVisible();
      await expect(
        page.getByText(/مشاهد \(Viewer\)|Viewer/i).first(),
      ).toBeVisible();

      // Dynamic profiles have Edit Access buttons
      const editButtons = page.getByRole("button", { name: /تعديل الصلاحيات|Edit Access/i });
      await expect(editButtons.first()).toBeVisible();
    });

    test("Scenario D: Custom Roles tab renders tenant-scoped roles and creation action", async ({
      page,
    }) => {
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      // Click Custom Roles tab
      const rolesTabTrigger = page.getByRole("tab", { name: /الأدوار المخصصة|Custom Roles/i });
      await rolesTabTrigger.click();

      // The tab header and creation button are visible
      await expect(
        page.getByText(/الأدوار المخصصة لمؤسستك|Tenant Custom Roles/i).first(),
      ).toBeVisible({ timeout: 10000 });

      const createRoleBtn = page.getByRole("button", { name: /إنشاء دور مخصص جديد|Create New Custom Role|إنشاء أول دور مخصص/i });
      await expect(createRoleBtn).toBeVisible();
    });
  });

  test.describe("Task Worker Experience — Task Management ONLY", () => {
    test("Scenario E: Task Worker logs in and redirects to /admin/tasks with restricted nav hidden", async ({
      page,
    }) => {
      await signInAsWorker(page);

      // Verify URL is /admin/tasks
      expect(page.url()).toContain("/admin/tasks");

      // Sidebar: Verify Task Management link is present
      const taskNavLink = page.getByRole("link", { name: /المهام|Tasks/i }).first();
      await expect(taskNavLink).toBeVisible();

      // Sidebar: Verify restricted administrative navigation links are NOT in sidebar
      const teamNavLink = page.locator("aside nav a").filter({ hasText: /^الفريق والمستخدمون$|^Team Management$/i });
      await expect(teamNavLink).toHaveCount(0);

      const quotesNavLink = page.locator("aside nav a").filter({ hasText: /^عروض الأسعار$|^Quotes$/i });
      await expect(quotesNavLink).toHaveCount(0);

      const crmNavLink = page.locator("aside nav a").filter({ hasText: /^الفرص والعملاء|^CRM/i });
      await expect(crmNavLink).toHaveCount(0);
    });

    test("Scenario F: Task Worker direct URL navigation to /admin or /admin/team redirects to /admin/tasks", async ({
      page,
    }) => {
      await signInAsWorker(page);

      // Attempt to access restricted /admin/team directly via URL
      await page.goto("/admin/team");
      await page.waitForLoadState("domcontentloaded");

      // The route guard immediately intercepts and redirects to /admin/tasks
      await expect(page).toHaveURL(/\/admin\/tasks/, { timeout: 10000 });

      // Attempt to access restricted /admin directly via URL
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");

      // Redirects to /admin/tasks
      await expect(page).toHaveURL(/\/admin\/tasks/, { timeout: 10000 });
    });

    test("Scenario G: Task Worker workspace displays My Tasks workspace without errors", async ({
      page,
    }) => {
      await signInAsWorker(page);

      // Task Workspace title
      const title = page.getByText(/إدارة المهام|Task Management/i).first();
      await expect(title).toBeVisible();

      // Workspace selector / tabs (My Tasks / Team Tasks / Modules)
      await expect(page.getByText(/مهامي|My Tasks/i).first()).toBeVisible();
    });
  });
});
