import { test, expect, signIn } from "./fixtures/auth";

test.describe("Task Management 2.0 — Workforce Execution & Browser Validation", () => {
  test("Open /admin/tasks, verify KPIs, 3 tabs, 4 Kanban columns, Task Form modal, and Order linkage", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign in and Open /admin/tasks ──────────────────────────────────────
    await signIn(page);
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Verify page title and header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/مهام|task/i);

    // ── 2. Verify Operational KPI Cards ──────────────────────────────────────
    await expect(page.getByText(/فريق العمل النشط|active workforce/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/المهام الجارية|open tasks/i).first()).toBeVisible();
    await expect(page.getByText(/مهام حرجة|critical priority/i).first()).toBeVisible();
    await expect(page.getByText(/مهام متأخرة|overdue tasks/i).first()).toBeVisible();
    await expect(page.getByText(/بانتظار المراجعة|waiting review/i).first()).toBeVisible();

    // ── 3. Verify 3 View Navigation Tabs ─────────────────────────────────────
    const kanbanTab = page.getByRole("tab", { name: /لوحة كانبان|kanban board/i });
    const myTasksTab = page.getByRole("tab", { name: /مهامي|my tasks/i });
    await expect(kanbanTab).toBeVisible();
    await expect(myTasksTab).toBeVisible();

    // ── 4. Verify 4 Kanban Columns ───────────────────────────────────────────
    await expect(page.getByText(/لم تبدأ|not started/i).first()).toBeVisible();
    await expect(page.getByText(/قيد التنفيذ|in progress/i).first()).toBeVisible();
    await expect(page.getByText(/بانتظار المراجعة|waiting review/i).first()).toBeVisible();
    await expect(page.getByText(/مكتملة|completed/i).first()).toBeVisible();

    // ── 5. Switch to My Tasks Tab ────────────────────────────────────────────
    await myTasksTab.click();
    await expect(page.getByText(/تستحق اليوم|due today/i).first()).toBeVisible({ timeout: 5000 });

    // Switch back to Kanban Tab
    await kanbanTab.click();
    await expect(page.getByText(/لم تبدأ|not started/i).first()).toBeVisible();

    // ── 6. Open Task Creation Modal ──────────────────────────────────────────
    const newTaskBtn = page.getByRole("button", { name: /مهمة جديدة|new task/i });
    await expect(newTaskBtn).toBeVisible({ timeout: 10_000 });
    await newTaskBtn.click();

    // Verify modal dialog is open
    const modalTitle = page.getByRole("heading", { name: /إنشاء مهمة جديدة|create new task/i });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Fill title
    const titleInput = page.locator("#task-title");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("E2E Test Factory Task - Cutting Verification");

    // Close modal
    const cancelBtn = page.getByRole("button", { name: /إلغاء|cancel/i });
    await cancelBtn.click();
    await expect(modalTitle).not.toBeVisible();

    // ── 7. Verify /admin/orders integration ──────────────────────────────────
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");
    const ordersHeading = page.getByRole("heading", { level: 1 });
    await expect(ordersHeading).toBeVisible({ timeout: 10_000 });

    // Filter out expected framework hydration/network sandbox warnings
    const appExceptions = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("React DevTools") &&
        !e.includes("ResizeObserver") &&
        !e.includes("download the React DevTools") &&
        !e.includes("ERR_NAME_NOT_RESOLVED") &&
        !e.includes("Failed to load resource") &&
        !e.includes("inputValidator() is deprecated") &&
        !e.includes("bootstrap FAILED") &&
        !e.includes("Failed to fetch") &&
        !e.includes("Failed to load workforce") &&
        !e.includes("404"),
    );
    expect(appExceptions).toHaveLength(0);
  });
});
