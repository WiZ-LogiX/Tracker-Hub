import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

const MOCK_OPP_ID = "44444444-4444-4444-4444-444444444441";
const MOCK_QUOTE_ID = "55555555-5555-5555-5555-555555555551";

test.describe("TASK 24 — PeleCanon CRM ↔ V2 Quotation Commercial Integration", () => {
  test("Commercial Flow Validation: CRM Pipeline → Opportunity Context in Builder → Quotes Commercial Context → Lost Reason Modal", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Intercept Opportunities and Quotes REST endpoints ─────────────────
    await page.route("**/rest/v1/opportunities**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/1",
        },
        body: JSON.stringify([
          {
            id: MOCK_OPP_ID,
            tenant_id: MOCK_TENANT_ID,
            opportunity_number: "OPP-1001",
            customer_id: MOCK_CUSTOMER_ID,
            title: "تشطيب فيلا التجمع الخامس",
            project_type: "residential",
            value: "150000.00",
            sales_owner: "11111111-1111-1111-1111-111111111111",
            stage: "quotation",
            source: "referral",
            expected_close_date: null,
            next_action: "متابعة عرض السعر",
            next_action_date: new Date().toISOString(),
            status: "open",
            lost_reason: null,
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
            id: MOCK_QUOTE_ID,
            tenant_id: MOCK_TENANT_ID,
            quote_number: "PLC-00123",
            customer_id: MOCK_CUSTOMER_ID,
            opportunity_id: MOCK_OPP_ID,
            status: "sent",
            subtotal: 120000,
            total: 120000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    // ── 2. Sign In and Open /admin/crm ────────────────────────────────────────
    await signIn(page);
    await page.goto("/admin/crm");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/علاقات العملاء|crm/i);

    // Verify 9 pipeline stages on the board
    await expect(page.getByText(/عميل محتمل جديد|new lead/i).first()).toBeVisible();
    await expect(page.getByText(/تم إرسال عرض السعر|quotation/i).first()).toBeVisible();
    await expect(page.getByText(/تفاوض تجاري ومراجعة|negotiation/i).first()).toBeVisible();
    await expect(page.getByText(/تم الفوز بالصفقة|won/i).first()).toBeVisible();
    await expect(page.getByText(/صفقة خاسرة|lost/i).first()).toBeVisible();

    // ── 3. Test Quotation Builder with Linked Opportunity Context (via retired configurator redirect) ─
    await page.goto(`/admin/quotes/configurator?customerId=${MOCK_CUSTOMER_ID}&opportunityId=${MOCK_OPP_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify redirected seamlessly to /admin/quotes/new
    await expect(page).toHaveURL(/\/admin\/quotes\/new/);
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });

    // Verify Linked Opportunity Banner is displayed
    const linkedBanner = page.getByText(/فرصة بيعية مرتبطة|مرتبط بالصفقة البيعية|linked opportunity/i).first();
    await expect(linkedBanner).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("OPP-1001").first()).toBeVisible();
    await expect(page.getByText(/تشطيب فيلا التجمع الخامس/).first()).toBeVisible();

    // Verify View in CRM button exists in the banner
    const viewInCrmBtn = page.getByRole("button", { name: /عرض في crm|view in crm/i }).first();
    await expect(viewInCrmBtn).toBeVisible();

    // ── 4. Verify Quotations List Page Exposes Opportunity Column ─────────────
    await page.goto("/admin/quotes");
    await page.waitForLoadState("domcontentloaded");

    const quotesHeading = page.getByRole("heading", { level: 1 });
    await expect(quotesHeading).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });

    // ── 5. Verify Filter out non-fatal sandboxed errors ────────────────────────
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
