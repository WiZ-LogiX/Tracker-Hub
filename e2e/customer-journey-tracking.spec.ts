import { test, expect, signIn, MOCK_TENANT_ID, MOCK_CUSTOMER_ID } from "./fixtures/auth";

test.describe("PELECANON CUSTOMER-CENTRIC QUOTATION LIFECYCLE & TRACKING E2E", () => {
  const REAL_QUOTE_ID = "b36acb62-f1f7-42ee-831c-6947fca97079"; // PLC-5NIEJ in DB
  const REAL_ORDER_ID = "e11166ae-cc4f-4f36-a791-ebb7eea122da"; // PLC-KR721 in cutting stage

  test("1. Public Tracking Page loads with dual search modes (phone & reference)", async ({ page }) => {
    await page.goto("/track");
    await page.waitForLoadState("domcontentloaded");

    // Header & Titles (bilingual support)
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(/تتبع الطلبات وعروض الأسعار|Track your order/i);

    // Search cards
    await expect(page.getByText(/البحث السريع برقم الهاتف|By phone number only/i).first()).toBeVisible();
    await expect(page.getByText(/البحث برقم الطلب أو المقايسة والهاتف|By order number \+ phone/i).first()).toBeVisible();

    // Form inputs
    const phoneInput = page.getByPlaceholder("01xxxxxxxxx أو +201xxxxxxxxx");
    await expect(phoneInput).toBeVisible();

    const orderInput = page.getByPlaceholder("ORD-... أو QUO-...");
    await expect(orderInput).toBeVisible();
  });

  test("2. Token capability access to quotation renders Quote View, Decision Buttons & Stepper", async ({ page }) => {
    await page.goto(`/track?ref=${REAL_QUOTE_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify Quote Card & Number
    await expect(page.getByText("PLC-5NIEJ")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/بانتظار قرار العميل|Awaiting Customer Decision/i).first()).toBeVisible();
    await expect(page.getByText(/Nuha/i)).toBeVisible();

    // Verify Decision Actions
    const acceptBtn = page.getByRole("button", { name: /قبول عرض السعر|Accept Quote/i });
    const revisionBtn = page.getByRole("button", { name: /طلب تعديل|Request Revision/i });
    const rejectBtn = page.getByRole("button", { name: /رفض العرض|Reject Quote/i });

    await expect(acceptBtn).toBeVisible();
    await expect(revisionBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();

    // Verify PDF download button
    const pdfBtn = page.getByRole("button", { name: /تحميل مستند PDF|تحميل.*PDF|Download.*PDF/i });
    await expect(pdfBtn).toBeVisible();

    // Click 'طلب تعديل' and verify interactive textarea opens
    await revisionBtn.click();
    await expect(page.getByPlaceholder(/اكتب ملاحظاتك هنا|Enter your notes here/i)).toBeVisible();

    // Verify Journey Stepper
    await expect(page.getByText(/سجل رحلة عرض السعر والتصنيع|مسار عرض السعر والاعتماد|Quotation Timeline/i)).toBeVisible();
    await expect(page.getByText(/إعداد وتجهيز المقايسة|Quotation Preparation/i)).toBeVisible();
  });

  test("3. Order View on /track displays 6-Stage Customer Model with Internal Sub-Stage badge", async ({ page }) => {
    await page.goto(`/track?ref=${REAL_ORDER_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify Order Header
    await expect(page.getByText("PLC-KR721")).toBeVisible({ timeout: 10_000 });

    // Verify 6 customer tracking stages in the stepper
    await expect(page.getByText(/تم تأكيد الطلب|Order Confirmed/i).first()).toBeVisible();
    await expect(page.getByText(/اعتماد التصميم|Design Approval/i).first()).toBeVisible();
    await expect(page.getByText(/قيد التصنيع|In Production/i).first()).toBeVisible();
    await expect(page.getByText(/فحص الجودة|Quality Check/i).first()).toBeVisible();
    await expect(page.getByText(/جاهز للتسليم|Ready for Delivery/i).first()).toBeVisible();
    await expect(page.getByText(/تم التسليم|Delivered/i).first()).toBeVisible();

    // Verify internal sub-stage indicator badge for 'cutting'
    await expect(page.getByText(/العمل الحالي: قص الخامات|قص الخامات|Cutting/i).first()).toBeVisible();
  });

  test("4. Admin Quotation details renders 7-step Progressive Stepper and Lifecycle Actions", async ({ page }) => {
    // Intercept quotes REST query for admin view
    await page.route("**/rest/v1/quotes**", async (route) => {
      const accept = route.request().headers()["accept"] || "";
      const quoteObj = {
        id: REAL_QUOTE_ID,
        tenant_id: MOCK_TENANT_ID,
        quote_number: "PLC-5NIEJ",
        status: "sent",
        subtotal: 28428.75,
        total: 28428.75,
        vat_amount: 0,
        discount_amount: 0,
        deposit_pct: 50,
        valid_until: "2026-07-06",
        created_at: new Date().toISOString(),
        snapshot: {
          version: 1,
          lifecycle: {
            stage: "awaiting_customer_decision",
            approved_at: new Date().toISOString(),
            confirmation_requested_at: new Date().toISOString(),
            consented_at: new Date().toISOString(),
            pdf_sent_at: new Date().toISOString(),
          },
        },
        customers: {
          id: MOCK_CUSTOMER_ID,
          name: "Nuha",
          phone: "01027921877",
        },
      };

      const body = accept.includes("vnd.pgrst.object+json")
        ? JSON.stringify(quoteObj)
        : JSON.stringify([quoteObj]);

      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/1",
        },
        body,
      });
    });

    await page.route("**/rest/v1/quote_items**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([
          {
            id: "qi-1",
            quote_id: REAL_QUOTE_ID,
            product_name: "مطبخ خشب زان",
            line_total: 28428.75,
            qty: 1,
            material_name: "خشب طبيعي",
            finish_name: "دهان أرو",
            dimension_value: "300x60",
          },
        ]),
      });
    });

    await page.route("**/rest/v1/quotation_products**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([]),
      });
    });

    await signIn(page);

    await page.goto(`/admin/quotes/${REAL_QUOTE_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify Stepper Card Title
    await expect(page.getByText(/مسار اعتماد وتأكيد عرض السعر|Quotation Lifecycle & Customer Confirmation/i)).toBeVisible({ timeout: 15_000 });

    // Verify Progressive Stepper Steps
    await expect(page.getByText("المسودة").first()).toBeVisible();
    await expect(page.getByText("تأكيد واتساب").first()).toBeVisible();
    await expect(page.getByText("الموافقة ع الاستلام").first()).toBeVisible();
    await expect(page.getByText("إرسال المستند").first()).toBeVisible();
    await expect(page.getByText("قرار العميل").first()).toBeVisible();
    await expect(page.getByText("معتمد تجارياً").first()).toBeVisible();
    await expect(page.getByText("أمر الإنتاج").first()).toBeVisible();

    // Verify Action Bar Title
    await expect(page.getByText(/إجراءات دورة حياة عرض السعر|Quotation Lifecycle Actions/i)).toBeVisible();

    // For quotation in awaiting_customer_decision:
    // Action buttons allow recording customer decision
    const acceptDecisionBtn = page.getByRole("button", { name: /اعتماد قبول العميل|Record Acceptance/i });
    const revisionDecisionBtn = page.getByRole("button", { name: /طلب تعديل من العميل|Record Revision Request/i });
    const rejectDecisionBtn = page.getByRole("button", { name: /تسجيل رفض العميل|Record Rejection/i });

    await expect(acceptDecisionBtn).toBeVisible();
    await expect(revisionDecisionBtn).toBeVisible();
    await expect(rejectDecisionBtn).toBeVisible();

    // Verify "Convert to Order" is NOT visible until explicitly accepted
    const convertBtn = page.getByRole("button", { name: /تحويل إلى أمر إنتاج|Convert to Order/i });
    await expect(convertBtn).toHaveCount(0);
  });
});
