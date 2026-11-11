import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID, MOCK_USER_ID } from "./fixtures/auth";

const MOCK_OPP_1 = "11111111-2222-3333-4444-555555555551";
const MOCK_OPP_2 = "11111111-2222-3333-4444-555555555552";
const MOCK_LEAD_1 = "22222222-3333-4444-5555-666666666661";
const MOCK_QUOTE_1 = "33333333-4444-5555-6666-777777777771";

test.describe("TASK 25 — PeleCanon Sales Team & Follow-Up Operations", () => {
  test("Sales Workspace: KPIs, Team Workload, Attention Board, My Sales, and Action Modals", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Intercept Sales Workspace RPC / REST endpoints ────────────────────
    await page.route("**/rest/v1/opportunities**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-1/2",
        },
        body: JSON.stringify([
          {
            id: MOCK_OPP_1,
            tenant_id: MOCK_TENANT_ID,
            opportunity_number: "OPP-5001",
            customer_id: MOCK_CUSTOMER_ID,
            title: "مشروع أبراج النيل للألومنيوم",
            project_type: "commercial",
            value: "250000.00",
            sales_owner: MOCK_USER_ID,
            stage: "quotation",
            status: "open",
            next_action: "متابعة اعتماد عرض الأسعار",
            next_action_date: new Date(Date.now() - 86400000).toISOString(), // Overdue
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: MOCK_OPP_2,
            tenant_id: MOCK_TENANT_ID,
            opportunity_number: "OPP-5002",
            customer_id: MOCK_CUSTOMER_ID,
            title: "فيلا الشيخ زايد قطاع بي إس",
            project_type: "residential",
            value: "180000.00",
            sales_owner: null, // Unassigned
            stage: "negotiation",
            status: "open",
            next_action: null, // No next action
            next_action_date: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/rest/v1/leads**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/1",
        },
        body: JSON.stringify([
          {
            id: MOCK_LEAD_1,
            tenant_id: MOCK_TENANT_ID,
            lead_number: "LD-2001",
            first_name: "طارق",
            last_name: "محمود",
            company: "شركة الأهرام للإنشاءات",
            phone: "+201001234567",
            email: "tarek@ahram.eg",
            status: "new",
            sales_owner: MOCK_USER_ID,
            next_action: "مكالمة هاتفية أولية",
            next_action_date: new Date().toISOString(), // Due today
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/1",
        },
        body: JSON.stringify([
          {
            id: MOCK_QUOTE_1,
            tenant_id: MOCK_TENANT_ID,
            quote_number: "PLC-00501",
            customer_id: MOCK_CUSTOMER_ID,
            opportunity_id: MOCK_OPP_1,
            status: "sent",
            subtotal: 250000,
            total: 250000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    // ── 2. Sign In and Navigate to Sales Workspace ───────────────────────────
    await signIn(page);
    await page.goto("/admin/crm/sales");
    await page.waitForLoadState("domcontentloaded");

    // ── 3. Check Workspace Header & 8 KPIs ───────────────────────────────────
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/فريق المبيعات والمتابعة|sales team/i);

    // Verify 8 KPI cards are rendered
    await expect(page.getByText(/عملاء جدد|new leads/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/فرص نشطة|open deals/i).first()).toBeVisible();
    await expect(page.getByText(/قيمة مسار المبيعات|pipeline value/i).first()).toBeVisible();
    await expect(page.getByText(/مطلوب اليوم|due today/i).first()).toBeVisible();
    await expect(page.getByText(/متأخرات|overdue/i).first()).toBeVisible();
    await expect(page.getByText(/عروض بانتظار رد|awaiting quote/i).first()).toBeVisible();
    await expect(page.getByText(/تم الفوز|deals won/i).first()).toBeVisible();
    await expect(page.getByText(/صفقات خاسرة|deals lost/i).first()).toBeVisible();

    // ── 4. Verify 4 Workspace Tabs ──────────────────────────────────────────
    const workloadTab = page.getByRole("tab", { name: /حمولة فريق المبيعات|team workload/i }).first();
    const attentionTab = page.getByRole("tab", { name: /التحكم بالمتابعات والتنبيهات|follow-up control/i }).first();
    const mySalesTab = page.getByRole("tab", { name: /مساحة المسؤول التجاري|my sales/i }).first();
    const bulkTab = page.getByRole("tab", { name: /توزيع وإسناد الصفقات|assignment/i }).first();

    await expect(workloadTab).toBeVisible();
    await expect(attentionTab).toBeVisible();
    await expect(mySalesTab).toBeVisible();
    await expect(bulkTab).toBeVisible();

    // ── 5. Test Workload Table Content ──────────────────────────────────────
    await expect(page.getByText(/مصفوفة حمولة فريق المبيعات|sales team workload/i).first()).toBeVisible();

    // ── 6. Test Attention Board Tab & Filter Chips ──────────────────────────
    await attentionTab.click();
    await expect(page.getByText(/لوحة التحكم بالمتابعات|follow-up control/i).first()).toBeVisible({ timeout: 10_000 });

    // Verify Attention Filter Buttons
    await expect(page.getByRole("button", { name: /الكل|all/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /متأخر|overdue/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /اليوم|today/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /بدون إجراء|no action/i }).first()).toBeVisible();

    // ── 7. Test "Log Activity" Modal ────────────────────────────────────────
    const logActivityBtn = page.getByRole("button", { name: /تسجيل نشاط|log activity/i }).first();
    await expect(logActivityBtn).toBeVisible({ timeout: 5_000 });
    await logActivityBtn.click();

    const modalHeading = page.getByText(/تسجيل نشاط ومتابعة تجارية|log sales activity/i).first();
    await expect(modalHeading).toBeVisible({ timeout: 5_000 });

    // Check form fields
    await expect(page.getByText(/نوع النشاط التجاري|activity type/i).first()).toBeVisible();
    await expect(page.getByText(/تفاصيل ونتيجة التواصل|outcome/i).first()).toBeVisible();
    await expect(page.getByText(/الإجراء القادم المخطط|next action/i).first()).toBeVisible();

    // Close modal
    const cancelBtn = page.getByRole("button", { name: /إلغاء|cancel/i }).first();
    await cancelBtn.click();
    await expect(modalHeading).not.toBeVisible();

    // ── 8. Test "My Sales" Personal Slice Tab ───────────────────────────────
    await mySalesTab.click();
    // Sub-tabs in My Sales View
    await expect(page.getByRole("tab", { name: /صفقاتي|my deals/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: /عملائي المحتملون|my leads/i }).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /مهام المتابعة|follow-ups/i }).first()).toBeVisible();

    // ── 9. Test Bulk Assignment Tab ─────────────────────────────────────────
    await bulkTab.click();
    await expect(page.getByText(/مركز توزيع وإسناد الفرص والعملاء|assignment & lead routing center/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /الصفقات \/ المشاريع|deals/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /العملاء المحتملون|leads/i }).first()).toBeVisible();

    // ── 10. Filter out non-fatal sandboxed errors ───────────────────────────
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
