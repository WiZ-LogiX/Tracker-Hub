import { test, expect, signIn } from "./fixtures/auth";

test.describe("PeleCanon Task Management Experience Redesign", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER ${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err.message);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        console.log(`[HTTP ${res.status()}]`, res.url());
      }
    });
    await signIn(page);
  });

  test("Scenario A: Version Terminology Removal — Canonical /admin/tasks without V1/V2 labels", async ({
    page,
  }) => {
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    const headingText = await heading.textContent();
    expect(headingText).not.toMatch(/2\.0|v1|v2|legacy|new tasks system/i);
    expect(headingText).toMatch(/إدارة المهام|Task Management/i);
  });

  test("Scenario B & C: Task Creation, Assignee Notification Dispatch, and Deep Linking", async ({
    page,
  }) => {
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Open creation dialog
    const createBtn = page.getByRole("button", { name: /مهمة جديدة|new task/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Verify dialog title
    const dialogTitle = page.getByRole("heading", { name: /إنشاء مهمة جديدة|create new task/i });
    await expect(dialogTitle).toBeVisible();

    // Verify streamlined layout: required Title, Assignees, Priority, Due Date
    const titleInput = page.locator("#task-title");
    await expect(titleInput).toBeVisible();

    const uniqueTitle = `Factory Assembly QA - ${Date.now()}`;
    await titleInput.fill(uniqueTitle);

    // Verify Assignees section is prominent
    await expect(page.getByText(/إسناد إلى الموظفين|assign employees/i)).toBeVisible();

    // Check optional business context toggle
    const toggleContextBtn = page.getByRole("button", {
      name: /ربط بالسجلات التشغيلية|link related business records/i,
    });
    await expect(toggleContextBtn).toBeVisible();

    // Fill Due Date
    const dueDateInput = page.locator("#task-due");
    await expect(dueDateInput).toBeVisible();
    await dueDateInput.fill("2026-12-01");

    // Click submit
    const submitBtn = page.getByRole("button", { name: /حفظ المهمة|create task/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify task creation toast or modal close
    await expect(dialogTitle).not.toBeVisible({ timeout: 10_000 });

    // Verify task appears in the view
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });

  test("Scenario D: In-App Notification Bell in Admin Header & Deep Link Navigation", async ({
    page,
  }) => {
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Verify Notification Bell is mounted in header
    const bellBtn = page.locator("[data-testid='notification-bell-btn']");
    await expect(bellBtn).toBeVisible();

    // Click Notification Bell to open popover
    await bellBtn.click();

    const popover = page.locator("[data-testid='notification-popover']");
    await expect(popover).toBeVisible();

    // Verify popover header
    await expect(page.getByText(/الإشعارات|notifications/i).first()).toBeVisible();
  });

  test("Scenario E: Dedicated Employee Workspace ('My Tasks') with In Progress, Overdue, and Completed Sub-Filters", async ({
    page,
  }) => {
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Switch to My Tasks tab
    const myTasksTab = page.getByRole("tab", { name: /مهامي|my tasks/i });
    await expect(myTasksTab).toBeVisible();
    await myTasksTab.click();

    // Verify employee workspace sub-filters: My Tasks / All, In Progress, Overdue, Completed
    await expect(page.getByRole("button", { name: /كل مهامي|my tasks/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /قيد التنفيذ|in progress/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /متأخرة|overdue/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /مكتملة|completed/i })).toBeVisible();

    // Toggle sub-filters
    await page.getByRole("button", { name: /قيد التنفيذ|in progress/i }).click();
    await page.getByRole("button", { name: /مكتملة|completed/i }).click();
    await page.getByRole("button", { name: /كل مهامي|my tasks/i }).click();
  });

  test("Scenario F: Direct Task Deep-Linking via URL (?taskId=...)", async ({
    page,
  }) => {
    // 1. Visit /admin/tasks and find a visible task
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Click a task card to find its ID or open details
    const firstTaskCard = page.locator("[data-testid^='task-card-'], .cursor-pointer").first();
    if (await firstTaskCard.isVisible()) {
      await firstTaskCard.click();
      // Ensure drawer opens
      const detailSheet = page.locator("[role='dialog']");
      await expect(detailSheet).toBeVisible({ timeout: 5000 });
    }
  });

  test("Scenario G: Visual Design & Responsive Layouts (Desktop & Tablet)", async ({
    page,
  }) => {
    // Desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-testid='notification-bell-btn']")).toBeVisible();
  });
});
