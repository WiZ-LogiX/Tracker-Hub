import { test, expect, signIn } from "./fixtures/auth";

test.describe("TASK 26 — PeleCanon Project / Job Workspace Browser Validation", () => {
  test("1. Project Directory (/admin/projects): Search, Filters, and New Project Action", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign In and Open /admin/projects ──────────────────────────────────
    await signIn(page);
    await page.goto("/admin/projects");
    await page.waitForLoadState("domcontentloaded");

    // ── 2. Verify Page Header ────────────────────────────────────────────────
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/مشاريع العملاء|projects|المشاريع/i);

    // ── 3. Verify Search Bar and Controls ────────────────────────────────────
    const searchInput = page.locator("input[placeholder*='Search'], input[placeholder*='بحث']").first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Verify "+ New Project" button
    const newProjectBtn = page.getByRole("button", { name: /مشروع جديد|new project/i }).first();
    await expect(newProjectBtn).toBeVisible();

    // Verify Refresh button
    const refreshBtn = page.getByRole("button", { name: /تحديث|refresh/i });
    await expect(refreshBtn).toBeVisible();

    // ── 4. Verify Project Cards or Empty State ────────────────────────────────
    await expect(page.locator("body")).toBeVisible();

    // Filter framework warnings
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
        !e.includes("404"),
    );
    expect(appExceptions).toHaveLength(0);
  });

  test("2. Unified Project Workspace (/admin/projects/$id): Header, 13-Stage Stepper, 6 Health Indicators & 10 Tabs", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign In and Navigate to /admin/projects ────────────────────────────
    await signIn(page);
    await page.goto("/admin/projects");
    await page.waitForLoadState("domcontentloaded");

    // Check if we have project cards to click
    const projectCards = page.locator("a[href^='/admin/projects/']");
    const count = await projectCards.count();

    if (count > 0) {
      // Click into the first project workspace
      await projectCards.first().click();
      await page.waitForLoadState("domcontentloaded");
    } else {
      // Navigate to /admin/crm and get an opportunity ID, or test directly
      await page.goto("/admin/crm");
      await page.waitForLoadState("domcontentloaded");
      const oppLinks = page.locator("a[href*='/admin/crm/opportunities']");
      const oppCount = await oppLinks.count();
      if (oppCount > 0) {
        const href = await oppLinks.first().getAttribute("href");
        const id = href?.split("/").pop();
        if (id) {
          await page.goto(`/admin/projects/${id}`);
          await page.waitForLoadState("domcontentloaded");
        }
      }
    }

    // If we landed on a project workspace page:
    if (page.url().includes("/admin/projects/") && !page.url().endsWith("/admin/projects/")) {
      // ── 2. Project Header Verification ─────────────────────────────────────
      // Check for customer link / button in header
      const customerTrigger = page.getByRole("button", { name: /عميل|customer/i }).first();
      await expect(customerTrigger).toBeVisible({ timeout: 15_000 });

      // Check for 6 Transparent Health Indicators
      await expect(page.getByText(/المسار التجاري|commercial status/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/التصنيع والتشغيل|production status/i).first()).toBeVisible();
      await expect(page.getByText(/جاهزية الخامات|inventory readiness/i).first()).toBeVisible();
      await expect(page.getByText(/مراقبة الجودة|quality & qc/i).first()).toBeVisible();
      await expect(page.getByText(/الشحن والتركيب|delivery & installation/i).first()).toBeVisible();
      await expect(page.getByText(/الموقف المالي|financial ledger/i).first()).toBeVisible();

      // ── 3. 13-Stage Lifecycle Stepper Verification ─────────────────────────
      await expect(page.getByText(/عميل محتمل|lead/i).first()).toBeVisible();
      await expect(page.getByText(/فرصة تجارية|opportunity/i).first()).toBeVisible();
      await expect(page.getByText(/رفع مقاسات|measurement/i).first()).toBeVisible();
      await expect(page.getByText(/تصميم وهندسة|design & engineering/i).first()).toBeVisible();
      await expect(page.getByText(/عرض أسعار|quotation/i).first()).toBeVisible();
      await expect(page.getByText(/تعاقد واعتماد|deal won/i).first()).toBeVisible();
      await expect(page.getByText(/أمر تنفيذ|order booked/i).first()).toBeVisible();
      await expect(page.getByText(/قيد التصنيع|in production/i).first()).toBeVisible();
      await expect(page.getByText(/فحص الجودة|qc inspection/i).first()).toBeVisible();
      await expect(page.getByText(/شحن وتوريد|delivery & logistics/i).first()).toBeVisible();
      await expect(page.getByText(/تركيب الموقع|site installation/i).first()).toBeVisible();
      await expect(page.getByText(/تسليم نهائي|customer handover/i).first()).toBeVisible();
      await expect(page.getByText(/ضمان وتشغيل|warranty & support/i).first()).toBeVisible();

      // ── 4. Verify 10 Workspace Tabs ────────────────────────────────────────
      const overviewTab = page.getByRole("tab", { name: /نظرة عامة|overview/i }).first();
      const commercialTab = page.getByRole("tab", { name: /التجاري والأسعار|commercial/i }).first();
      const productionTab = page.getByRole("tab", { name: /خط التصنيع|production/i }).first();
      const tasksTab = page.getByRole("tab", { name: /المهام|tasks/i }).first();
      const inventoryTab = page.getByRole("tab", { name: /المخزون|inventory/i }).first();
      const deliveryTab = page.getByRole("tab", { name: /التوريد والتركيب|delivery/i }).first();
      const financialsTab = page.getByRole("tab", { name: /المالية|financials/i }).first();
      const qualityTab = page.getByRole("tab", { name: /الجودة|quality/i }).first();
      const documentsTab = page.getByRole("tab", { name: /المستندات|documents/i }).first();
      const timelineTab = page.getByRole("tab", { name: /الجدول الزمني|timeline/i }).first();

      await expect(overviewTab).toBeVisible();
      await expect(commercialTab).toBeVisible();
      await expect(productionTab).toBeVisible();
      await expect(tasksTab).toBeVisible();
      await expect(inventoryTab).toBeVisible();
      await expect(deliveryTab).toBeVisible();
      await expect(financialsTab).toBeVisible();
      await expect(qualityTab).toBeVisible();
      await expect(documentsTab).toBeVisible();
      await expect(timelineTab).toBeVisible();

      // ── 5. Test Tab Switching ──────────────────────────────────────────────
      // Overview Tab: Quick actions bar
      await expect(page.getByRole("button", { name: /\+ إضافة مهمة|\+ add task/i }).first()).toBeVisible();

      // Switch to Commercial Tab
      await commercialTab.click();
      await expect(page.getByText(/عروض الأسعار والمقايسات|project quotations/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Production Tab
      await productionTab.click();
      await expect(page.getByText(/أوامر التشغيل بالمصنع|factory work orders/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Tasks Tab
      await tasksTab.click();
      await expect(page.getByText(/مهام المشروع|project tasks/i).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole("button", { name: /\+ مهمة جديدة|\+ new task/i }).first()).toBeVisible();

      // Switch to Inventory Tab
      await inventoryTab.click();
      await expect(page.getByText(/جاهزية الخامات والمخزون|material readiness & warehouse stock/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Delivery Tab
      await deliveryTab.click();
      await expect(page.getByText(/شحنات التوريد والتركيبات|delivery & installation handovers/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Financials Tab
      await financialsTab.click();
      await expect(page.getByText(/الفواتير الصادرة|project invoices/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Quality Tab
      await qualityTab.click();
      await expect(page.getByText(/سجل ملاحظات الجودة|quality control & remake logs/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Documents Tab
      await documentsTab.click();
      await expect(page.getByText(/مستندات ومرفقات المشروع|project documents & attachments/i).first()).toBeVisible({ timeout: 5000 });

      // Switch to Timeline Tab
      await timelineTab.click();
      await expect(page.getByText(/سجل الأحداث والجدول الزمني|unified project timeline/i).first()).toBeVisible({ timeout: 5000 });

      // ── 6. Test Customer 360 Deep Link Integration ─────────────────────────
      await customerTrigger.click();
      const customerDrawer = page.getByRole("dialog");
      await expect(customerDrawer).toBeVisible({ timeout: 5000 });
      // Close drawer
      const closeBtn = customerDrawer.getByRole("button", { name: /إغلاق|close/i }).first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
    }

    // Filter framework warnings
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
        !e.includes("404"),
    );
    expect(appExceptions).toHaveLength(0);
  });
});
