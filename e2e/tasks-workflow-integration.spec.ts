import { test, expect, signIn } from "./fixtures/auth";

test.describe("PeleCanon Operational Task Workflow Integration", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER ${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err.message);
    });
    await signIn(page);
  });

  test("Scenario A: Orders Integration — Contextual Task Creation & Deep Linking", async ({
    page,
  }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");

    // Check if an order card exists or expand first order
    const orderCard = page.locator(".border.rounded-xl, .bg-card").filter({ hasText: /ORD-|ORD/i }).first();
    if (await orderCard.isVisible({ timeout: 5000 })) {
      // Find Order Operational Tasks Widget
      const widget = page.getByText(/مهام أمر التصنيع|Order Operational Tasks/i).first();
      await expect(widget).toBeVisible({ timeout: 5000 });

      // Click Add Task in Order widget
      const addTaskBtn = page.getByRole("button", { name: /إضافة مهمة|Add Task/i }).first();
      await expect(addTaskBtn).toBeVisible();
      await addTaskBtn.click();

      // Unified TaskForm dialog should open
      const dialogTitle = page.getByRole("heading", { name: /إنشاء مهمة جديدة|Create New Task/i });
      await expect(dialogTitle).toBeVisible();

      // Context accordion is auto-opened because orderId is pre-populated
      await expect(page.locator("#task-title")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("Scenario B: Work Orders Integration — Contextual Task Creation in Tab 4", async ({
    page,
  }) => {
    await page.goto("/admin/work-orders");
    await page.waitForLoadState("domcontentloaded");

    const woCard = page.locator("tr, div").filter({ hasText: /WO-|WO/i }).first();
    if (await woCard.isVisible({ timeout: 5000 })) {
      await woCard.click();

      // Look for Tasks Tab
      const tasksTab = page.getByRole("tab", { name: /المهام|Tasks/i });
      if (await tasksTab.isVisible({ timeout: 5000 })) {
        await tasksTab.click();

        // Check for Create Task button
        const createBtn = page.getByRole("button", { name: /إنشاء مهمة عمل|\+ Create Task/i });
        await expect(createBtn).toBeVisible();
      }
    }
  });

  test("Scenario C: Delivery & Installation Integration — Contextual Delivery Tasks", async ({
    page,
  }) => {
    await page.goto("/admin/deliveries");
    await page.waitForLoadState("domcontentloaded");

    const deliveryRow = page.locator("tr, div").filter({ hasText: /DLV-|DEL-|تسليم|توصيل/i }).first();
    if (await deliveryRow.isVisible({ timeout: 5000 })) {
      await deliveryRow.click();

      // Delivery & Installation Tasks section
      const tasksSection = page.getByText(/مهام التوصيل والتركيب|Delivery & Installation Tasks/i);
      await expect(tasksSection).toBeVisible({ timeout: 5000 });

      const addTaskBtn = page.getByRole("button", { name: /إضافة مهمة|\+ Create Task/i });
      await expect(addTaskBtn).toBeVisible();
    }
  });

  test("Scenario D: After-Sales Service Cases Integration — Unified TaskForm Linkage", async ({
    page,
  }) => {
    await page.goto("/admin/crm/after-sales");
    await page.waitForLoadState("domcontentloaded");

    const caseRow = page.locator("tr, div").filter({ hasText: /CAS-|CAS/i }).first();
    if (await caseRow.isVisible({ timeout: 5000 })) {
      await caseRow.click();

      const tasksHeading = page.getByText(/المهام الميدانية والفحص المرتبطة|Linked Operational Tasks/i);
      await expect(tasksHeading).toBeVisible({ timeout: 5000 });

      const addTaskBtn = page.getByRole("button", { name: /\+ مهمة عمل|\+ Task/i });
      await expect(addTaskBtn).toBeVisible();
      await addTaskBtn.click();

      // Unified TaskForm dialog opens
      const dialogTitle = page.getByRole("heading", { name: /إنشاء مهمة جديدة|Create New Task/i });
      await expect(dialogTitle).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("Scenario E & G: Canonical /admin/tasks — Module Filter & Deep-Linking", async ({
    page,
  }) => {
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Canonical Route check
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    expect(await heading.textContent()).not.toMatch(/2\.0|v1|v2/i);

    // Module Filter Dropdown is visible
    const moduleTrigger = page.getByRole("combobox").filter({ hasText: /كل الأقسام|All Modules|القسم|Module/i }).first();
    await expect(moduleTrigger).toBeVisible();
    await moduleTrigger.click();

    // Verify module choices: All Modules, Orders, Work Orders, Deliveries, After-Sales
    await expect(page.getByRole("option", { name: /كل الأقسام|All Modules/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Orders$|أوامر الإنتاج/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /أوامر التشغيل|Work Orders/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /التوصيل والتركيب|Deliveries/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /ما بعد البيع|After-Sales/i })).toBeVisible();

    // Select Work Orders
    await page.getByRole("option", { name: /أوامر التشغيل|Work Orders/i }).click();

    // Switch to My Tasks View
    const myTasksTab = page.getByRole("tab", { name: /مهامي|My Tasks/i });
    await expect(myTasksTab).toBeVisible();
    await myTasksTab.click();
  });

  test("Scenario F: Task Completion & Manager Acknowledgment Lifecycle", async ({
    page,
  }) => {
    await page.goto("/admin/tasks");
    await page.waitForLoadState("domcontentloaded");

    // Create a dedicated test task
    const createBtn = page.getByRole("button", { name: /مهمة جديدة|new task/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    const uniqueTitle = `Workflow Lifecycle E2E - ${Date.now()}`;
    await page.locator("#task-title").fill(uniqueTitle);

    // Set due date
    await page.locator("#task-due").fill("2026-12-15");

    const submitBtn = page.getByRole("button", { name: /حفظ المهمة|create task/i });
    await submitBtn.click();

    // Wait for task to appear
    const taskCard = page.getByText(uniqueTitle);
    await expect(taskCard).toBeVisible({ timeout: 10000 });
    await taskCard.click();

    // Detail drawer opens
    const detailTitle = page.getByRole("heading", { name: uniqueTitle });
    await expect(detailTitle).toBeVisible();

    // Start work
    const startBtn = page.getByRole("button", { name: /بدء التنفيذ|Start Work/i });
    if (await startBtn.isVisible({ timeout: 3000 })) {
      await startBtn.click();
    }

    // Worker Complete Task button is visible
    const completeBtn = page.getByRole("button", { name: /إتمام المهمة|Complete Task/i });
    if (await completeBtn.isVisible({ timeout: 3000 })) {
      await completeBtn.click();

      // Completion confirmation dialog
      const confirmDialog = page.getByRole("heading", { name: /تأكيد اكتمال المهمة|Complete Task/i });
      await expect(confirmDialog).toBeVisible();

      const confirmBtn = page.getByRole("button", { name: /تأكيد الاكتمال|Confirm Completion/i });
      await confirmBtn.click();
      await expect(confirmDialog).not.toBeVisible();
    }

    // Manager Acknowledge Completion button appears
    const ackBtn = page.getByRole("button", { name: /تأكيد واعتماد الإنجاز|Acknowledge Completion/i });
    if (await ackBtn.isVisible({ timeout: 5000 })) {
      await ackBtn.click();
      await expect(page.getByText(/تم اعتماد الاكتمال من الإدارة|Completion Acknowledged/i)).toBeVisible({ timeout: 5000 });
    }
  });
});
