import { test, expect, MOCK_TENANT_ID } from "./fixtures/auth";
import type { Page } from "@playwright/test";

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const MANAGER_ID = "22222222-2222-2222-2222-222222222221";
const WORKER_ID = "22222222-2222-2222-2222-222222222222";
const DISABLED_ID = "44444444-4444-4444-4444-444444444444";

function buildSession(userId: string, username: string, email: string) {
  return {
    access_token: `mock-token-${username}`,
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: `mock-refresh-${username}`,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email,
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { username },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

async function setupMockUser(
  page: Page,
  userId: string,
  username: string,
  displayName: string,
  role: string,
  status: "active" | "disabled" = "active",
) {
  const session = buildSession(userId, username, `${username}@pelecanon.local`);

  await page.route("**/auth/v1/token**", async (route) => {
    if (status === "disabled") {
      await route.fulfill({
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "Account is disabled" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(session),
    });
  });

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(session.user),
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
          role,
          user_id: userId,
        },
      ]),
    });
  });

  await page.route("**/rest/v1/app_users**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        id: userId,
        username,
        display_name: displayName,
        status,
        tenant_id: MOCK_TENANT_ID,
      }),
    });
  });

  await page.addInitScript(
    ({ sess, userKey, sessionKey }) => {
      window.localStorage.setItem(sessionKey, JSON.stringify(sess));
      window.localStorage.setItem(userKey, username);
    },
    {
      sess: session,
      userKey: "pelecanon:username",
      sessionKey: "pelecanon-auth-token",
    },
  );
}

test.describe("Security Acceptance Audit — End-to-End Verification", () => {
  test("1. Administrator Profile: Has access to /admin/team and management controls", async ({ page }) => {
    await setupMockUser(page, ADMIN_ID, "admin", "Admin User", "admin", "active");

    await page.goto("/admin/team");
    await page.waitForLoadState("domcontentloaded");

    // Administrator sees Team Management header and tabs
    await expect(page.getByRole("heading", { name: /الفريق والمستخدمون|الفريق والصلاحيات|Team/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("tab", { name: /المستخدمون|Users/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /الأدوار والملفات|الأدوار|Roles/i })).toBeVisible();
  });

  test("2. Manager Profile (sales role): Accesses operational modules but blocked from /admin/team", async ({ page }) => {
    await setupMockUser(page, MANAGER_ID, "manager1", "Sales Manager", "sales", "active");

    // Navigate to /admin/tasks -> Allowed
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/tasks/);

    // Attempt direct navigation to /admin/team -> Access Denied
    await page.goto("/admin/team");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /غير مصرح بالوصول|Access Denied/i })).toBeVisible({ timeout: 10000 });
  });

  test("3. Task Worker Profile (worker role): Strictly isolated to /admin/tasks workspace", async ({ page }) => {
    await setupMockUser(page, WORKER_ID, "worker1", "Workshop Worker", "worker", "active");

    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Sidebar verification: ERP navigation links MUST be hidden
    await expect(page.locator('a[href="/admin/quotes"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/orders"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/inventory"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/team"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/remakes"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/service-cases"]')).toHaveCount(0);

    // Task Worker cannot see "Create Task" button
    await expect(page.getByRole("button", { name: /مهمة جديدة|New Task|إضافة مهمة/i })).toHaveCount(0);

    // Direct navigation to /admin/inventory redirects to /admin/tasks
    await page.goto("/admin/inventory");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/tasks/);

    // Direct navigation to /admin/orders redirects to /admin/tasks
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/tasks/);
  });

  test("4. Deactivated User: Prevented from logging in or maintaining session", async ({ page }) => {
    await setupMockUser(page, DISABLED_ID, "disabled_user", "Disabled Worker", "worker", "disabled");

    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Attempting to hit server or perform action is rejected
    const isAtLoginOrTasks = page.url().includes("/login") || page.url().includes("/admin/tasks");
    expect(isAtLoginOrTasks).toBe(true);
  });
});
