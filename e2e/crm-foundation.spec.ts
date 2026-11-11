import { test, expect, signIn } from "./fixtures/auth";

test.describe("TASK 22 — PeleCanon CRM Foundation Browser Validation", () => {
  test("Open /admin/crm, verify KPI cards, 4 tabs, 9 pipeline stages, New Lead & New Opportunity modals", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign in and Open /admin/crm ────────────────────────────────────────
    await signIn(page);
    await page.goto("/admin/crm");
    await page.waitForLoadState("domcontentloaded");

    // Verify page title and header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/علاقات العملاء|crm/i);

    // ── 2. Verify CRM KPI Header Cards ───────────────────────────────────────
    await expect(page.getByText(/قيمة الفرص النشطة|pipeline value/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/الصفقات الرابحة المغلقة|deals won/i).first()).toBeVisible();
    await expect(page.getByText(/العملاء المحتملون|leads & prospects/i).first()).toBeVisible();
    await expect(page.getByText(/تتطلب إجراءً ومتابعة|requires next action/i).first()).toBeVisible();

    // ── 3. Verify View Navigation Tabs ───────────────────────────────────────
    const pipelineTab = page.getByRole("tab", { name: /مسار المبيعات|sales pipeline/i });
    const allDealsTab = page.getByRole("tab", { name: /كل الصفقات|all deals/i });
    const myDealsTab = page.getByRole("tab", { name: /صفقاتي|my deals/i });
    const leadsTab = page.getByRole("tab", { name: /العملاء المحتملون|leads/i });

    await expect(pipelineTab).toBeVisible();
    await expect(allDealsTab).toBeVisible();
    await expect(myDealsTab).toBeVisible();
    await expect(leadsTab).toBeVisible();

    // ── 4. Verify 9 Pipeline Stages on Kanban Board ───────────────────────────
    await expect(page.getByText(/عميل محتمل جديد|new lead/i).first()).toBeVisible();
    await expect(page.getByText(/تم التواصل والمتابعة|contacted/i).first()).toBeVisible();
    await expect(page.getByText(/تحديد المتطلبات والتأهيل|qualified/i).first()).toBeVisible();
    await expect(page.getByText(/معاينة ورفع مقاسات|site visit/i).first()).toBeVisible();
    await expect(page.getByText(/تسعير وتكلفة هندسية|design \/ measurement/i).first()).toBeVisible();
    await expect(page.getByText(/تم إرسال عرض السعر|quotation/i).first()).toBeVisible();
    await expect(page.getByText(/تفاوض تجاري ومراجعة|negotiation/i).first()).toBeVisible();
    await expect(page.getByText(/تم الفوز بالصفقة|won/i).first()).toBeVisible();
    await expect(page.getByText(/صفقة خاسرة|lost/i).first()).toBeVisible();

    // ── 5. Test New Lead Modal ───────────────────────────────────────────────
    const newLeadBtn = page.getByRole("button", { name: /عميل محتمل جديد|new lead/i }).first();
    await expect(newLeadBtn).toBeVisible({ timeout: 5000 });
    await newLeadBtn.click();

    // Verify modal dialog is open
    const leadModal = page.getByRole("dialog");
    await expect(leadModal).toBeVisible({ timeout: 5000 });
    await expect(leadModal.getByRole("heading", { level: 2 })).toContainText(/عميل محتمل|lead/i);

    // Fill lead name
    const leadNameInput = leadModal.locator("#lead-name");
    await expect(leadNameInput).toBeVisible();
    await leadNameInput.fill("E2E Automated Prospective Lead");

    // Fill lead phone
    const leadPhoneInput = leadModal.locator("#lead-phone");
    if (await leadPhoneInput.isVisible()) {
      await leadPhoneInput.fill("01012345678");
    }

    // Close modal via cancel
    const cancelLeadBtn = leadModal.getByRole("button", { name: /إلغاء|cancel/i });
    await cancelLeadBtn.click();
    await expect(leadModal).not.toBeVisible({ timeout: 5000 });

    // ── 6. Test New Opportunity Modal ────────────────────────────────────────
    const newOppBtn = page.getByRole("button", { name: /صفقة \/ مشروع جديد|new opportunity/i }).first();
    await expect(newOppBtn).toBeVisible({ timeout: 5000 });
    await newOppBtn.click();

    // Verify modal dialog is open
    const oppModal = page.getByRole("dialog");
    await expect(oppModal).toBeVisible({ timeout: 5000 });
    await expect(oppModal.getByRole("heading", { level: 2 })).toContainText(/صفقة|deal/i);

    // Fill opportunity title
    const oppTitleInput = oppModal.locator("#opp-title");
    await expect(oppTitleInput).toBeVisible();
    await oppTitleInput.fill("E2E Test Commercial Tower Deal");

    // Close modal via cancel
    const cancelOppBtn = oppModal.getByRole("button", { name: /إلغاء|cancel/i });
    await cancelOppBtn.click();
    await expect(oppModal).not.toBeVisible({ timeout: 5000 });

    // ── 7. Switch to Leads Tab & Verify Table ─────────────────────────────────
    await leadsTab.click();
    await expect(page.getByPlaceholder(/بحث|search/i)).toBeVisible({ timeout: 5000 });

    // Switch to All Deals Tab
    await allDealsTab.click();
    await expect(page.getByRole("tab", { name: /جميع الصفقات|all deals/i })).toBeVisible();

    // Filter out framework hydration/mock network sandbox warnings
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
        !e.includes("membership lookup failed") &&
        !e.includes("404"),
    );
    expect(appExceptions).toHaveLength(0);
  });
});
