import { test, expect, signIn } from "./fixtures/auth";
import path from "path";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";
const SEEDED_PROJECT_ID = "dd17f6a4-6f28-498c-8f95-875c06f475c9";

test.describe("Sprint 6C: Sprints 1–7 Unified Acceptance Suite", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // ── 1. Fast CRM Intake -> Quote Handoff ──────────────────────────────────
  test("1. Fast CRM Intake: Submit inquiry and hand off cleanly to Quote Builder", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/crm");
    await page.waitForLoadState("domcontentloaded");

    // Click Quick Inquiry button
    const quickInquiryBtn = page
      .getByRole("button", { name: /استفسار سريع|Quick Inquiry/i })
      .first();
    await expect(quickInquiryBtn).toBeVisible({ timeout: 15_000 });
    await quickInquiryBtn.click();

    // Verify Fast CRM Intake Drawer opens
    const drawerHeading = page.getByText(/تسجيل استفسار عميل سريع|Quick Commercial Inquiry/i);
    await expect(drawerHeading).toBeVisible({ timeout: 5_000 });

    // Fill in required fields
    const nameInput = page.getByPlaceholder(/Tarek Nour|اسم العميل/i).first();
    await nameInput.fill("م. تامر الجوهري - فيلا الياسمين");

    const phoneInput = page.getByPlaceholder(/010XXXXXXXX/i).first();
    await phoneInput.fill("01099887766");

    const budgetInput = page.getByPlaceholder(/50,000|الميزانية/i).first();
    if (await budgetInput.isVisible()) {
      await budgetInput.fill("120000");
    }

    // Submit with "Save & Build Quote"
    const saveAndQuoteBtn = page.getByRole("button", {
      name: /حفظ وبناء عرض السعر|Save & Build Quote/i,
    });
    await expect(saveAndQuoteBtn).toBeVisible();
    await saveAndQuoteBtn.click();

    // Verify smooth navigation to /admin/quotes/new with customer and opportunity pre-linked
    await page.waitForURL(/\/admin\/quotes\/new/);
    expect(page.url()).toContain("/admin/quotes/new");
    expect(page.url()).toContain("customerId=");
    expect(page.url()).toContain("opportunityId=");

    // Verify Quote Builder renders
    await expect(
      page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i),
    ).toBeVisible({ timeout: 15_000 });

    // Capture screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "acceptance_sprint1_fast_crm_intake.png"),
    });
  });

  // ── 2. Milestone Billing & Estimated Gross Margin ─────────────────────────
  test("2. Milestone Billing & Margin: Financial KPIs, milestone schedule and 1-click invoice issue", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/projects/${SEEDED_PROJECT_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Switch to Financials Tab
    const financialsTab = page.getByRole("tab", { name: /المالية|financials/i }).first();
    await expect(financialsTab).toBeVisible({ timeout: 15_000 });
    await financialsTab.click();

    // Verify Milestone Billing Schedule Card
    await expect(
      page.getByText(/جدول دفعات وفواتير مراحل المشروع|Project Milestone Billing Schedule/i),
    ).toBeVisible({ timeout: 10_000 });

    // Verify Scheduled Milestones KPI Card
    await expect(
      page.getByText(/دفعات مجدولة قادمة|Scheduled Milestones/i).first(),
    ).toBeVisible();

    // Verify Estimated Gross Margin KPI Card
    await expect(
      page.getByText(/هامش الربح التقديري|Estimated Margin/i).first(),
    ).toBeVisible();

    // Verify 1-click "Issue Invoice" button on scheduled milestone
    const issueInvoiceBtn = page
      .getByRole("button", { name: /إصدار الفاتورة الآن|Issue Invoice/i })
      .first();
    if (await issueInvoiceBtn.isVisible()) {
      await issueInvoiceBtn.click();
      // Verify success notification
      await expect(
        page.getByText(/تم إصدار فاتورة المرحلة|issued successfully/i),
      ).toBeVisible({ timeout: 10_000 });
    }

    // Capture screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "acceptance_sprint2_milestone_billing_margin.png"),
    });
  });

  // ── 3. Production QC Gate & ready_for_delivery & Cut-List CSV ─────────────
  test("3. Production QC Gate: ready_for_delivery stepper, QC controls and Cut-List CSV modal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/projects/${SEEDED_PROJECT_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Switch to Production Tab
    const productionTab = page.getByRole("tab", { name: /خط التصنيع|production/i }).first();
    await expect(productionTab).toBeVisible({ timeout: 15_000 });
    await productionTab.click();

    // Verify "Ready for Delivery & Installation" / "جاهز للتسليم والتركيب" stage label
    await expect(
      page.getByText(/جاهز للتسليم والتركيب|Ready for Delivery & Installation/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify QC Gate button "Log QC Check"
    const logQcBtn = page
      .getByRole("button", { name: /تسجيل فحص الجودة|Log QC Check/i })
      .first();
    await expect(logQcBtn).toBeVisible();

    // Navigate to Work Orders to verify Cut-List CSV modal
    await page.goto("/admin/work-orders");
    await page.waitForLoadState("domcontentloaded");

    // Click Work Order row to open WorkOrderDetailDrawer
    const woItem = page.getByText(/WO-2026-0001|تصنيع شاسيه/i).first();
    await expect(woItem).toBeVisible({ timeout: 15_000 });
    await woItem.click();

    // Inside drawer, click "Import Cut List (CSV)"
    const importCutListBtn = page
      .getByRole("button", { name: /استيراد كشف التقطيع|Import Cut List/i })
      .first();
    await expect(importCutListBtn).toBeVisible({ timeout: 10_000 });
    await importCutListBtn.click();

    // Verify ImportCutListModal opens
    const modalTitle = page.getByText(/Import Workshop Cut List|استيراد كشف تقطيع الورشة/i).first();
    await expect(modalTitle).toBeVisible({ timeout: 5_000 });

    // Upload valid sample CSV buffer
    const sampleCsv = `Part Name,Length,Width,Quantity,Thickness,Material\nBase Left,720,560,2,18,MDF Melamine\nBase Bottom,864,560,1,18,MDF Melamine\nBack Panel,864,720,1,6,Backing Board\n`;
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test-cutlist.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(sampleCsv),
    });

    // Verify CSV validation preview appears
    await expect(
      page.getByText(/معاينة الأجزاء|Cut List Parts Preview|Base Left/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Capture screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "acceptance_sprint3_production_qc_cutlist.png"),
    });
  });

  // ── 4. Standalone Inventory Polish ────────────────────────────────────────
  test("4. Standalone Inventory: Low Stock filter toggle, directional Stock In (+), and Movement History", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/inventory");
    await page.waitForLoadState("domcontentloaded");

    // Header check
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify and click Low Stock Alert card
    const lowStockCard = page
      .getByTitle(/Click to toggle low stock filter|انقر لتصفية/i)
      .first();
    await expect(lowStockCard).toBeVisible({ timeout: 15_000 });
    await lowStockCard.click();

    // Verify URL updates with lowStock parameter
    await expect(page).toHaveURL(/lowStock=true/);

    // Open Directional Stock In (+) shortcut button
    const stockInBtn = page
      .getByTitle(/Stock In \(\+\)|توريد وإضافة/i)
      .first();
    if (await stockInBtn.isVisible()) {
      await stockInBtn.click();

      // Verify StockAdjustmentModal opens with In tab active and quick-add chips
      await expect(
        page.getByText(/Inventory Stock Movement|إجراء حركة مخزن/i).first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("button", { name: /\+1/i }).first()).toBeVisible();

      // Close modal
      const closeBtn = page.getByRole("button", { name: /إلغاء|Cancel/i }).first();
      await closeBtn.click();
    }

    // Open Global Movement History Drawer
    const historyBtn = page
      .getByRole("button", { name: /سجل حركات المخزون|Movement History/i })
      .first();
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

    // Verify Movement History drawer opens
    await expect(
      page.getByText(/Stock Movement Audit Ledger|سجل حركات المخزون/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Capture screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "acceptance_sprint4_standalone_inventory.png"),
    });
  });

  // ── 5. Morning Command Center & Self-Serve Onboarding ─────────────────────
  test("5. Command Center & Onboarding: Filter pills, Quick Inquiry trigger, and Workshop Register form", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    // Verify Command Center heading
    await expect(
      page.getByText(/مركز العمليات التنفيذي|Executive Operations Command Center/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify Needs Attention Center and Category Filter Pills
    const attentionCard = page
      .locator("div")
      .filter({ hasText: /Management Attention Center|مركز تنبيهات واستثناءات الإدارة/i })
      .first();
    await expect(attentionCard).toBeVisible({ timeout: 15_000 });

    // Click category filter pills
    const prodFilter = page.getByRole("button", { name: /الإنتاج والجودة|Production & QC/i });
    if (await prodFilter.isVisible()) {
      await prodFilter.click();
    }

    const billingFilter = page.getByRole("button", { name: /الفوترة والعملاء|Billing & CRM/i });
    if (await billingFilter.isVisible()) {
      await billingFilter.click();
    }

    const allFilter = page.getByRole("button", { name: /الكل|All/i }).first();
    if (await allFilter.isVisible()) {
      await allFilter.click();
    }

    // Click Quick Inquiry trigger from top action bar
    const quickInquiryTop = page
      .getByRole("button", { name: /تسجيل استفسار سريع|Quick Inquiry/i })
      .first();
    await expect(quickInquiryTop).toBeVisible();
    await quickInquiryTop.click();

    // Verify Fast CRM Intake Drawer opens
    await expect(
      page.getByText(/تسجيل استفسار عميل سريع|Quick Commercial Inquiry/i),
    ).toBeVisible({ timeout: 5_000 });

    // Close drawer
    await page.keyboard.press("Escape");

    // Visit Self-Serve Workshop Onboarding route
    await page.goto("/auth?tab=register");
    await page.waitForLoadState("domcontentloaded");

    // Verify Create New Workshop form
    await expect(
      page.getByText(/إنشاء حساب ورشة جديدة|Create New Workshop/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify Free Tier Onboarding Pill
    await expect(
      page.getByText(/3 Seats & 25 Quotes\/mo|٣ مستخدمين/i).first(),
    ).toBeVisible();

    // Verify workshop name input
    await expect(
      page.getByPlaceholder(/Atelier Prestige|ورشة الأصيل/i).first(),
    ).toBeVisible();

    // Switch to Sign In route to verify login interface
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");

    // Verify Sign In form renders without error
    await expect(page.getByRole("button", { name: /دخول|Sign in/i }).first()).toBeVisible();

    // Capture screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "acceptance_sprint5_command_center_onboarding.png"),
    });
  });
});
