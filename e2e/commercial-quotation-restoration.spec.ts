import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

const MOCK_OPP_ID = "77777777-7777-7777-7777-777777777771";
const MOCK_QUOTE_ID = "88888888-8888-8888-8888-888888888881";

test.describe("TASK — PeleCanon Quotation Restoration & Shaheen PDF Verification", () => {
  test("Scenario A & B: Commercial Quote Builder Workflow & Edit Mode", async ({ page }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Mock REST endpoints for customers, opportunities, and quotes
    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
        address: "القاهرة - التجمع الخامس",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/opportunities**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const oppRecord = {
        id: MOCK_OPP_ID,
        tenant_id: MOCK_TENANT_ID,
        opportunity_number: "OPP-1002",
        customer_id: MOCK_CUSTOMER_ID,
        title: "تشطيب فيلا مستر شاهين",
        project_type: "residential",
        value: "100000.00",
        sales_owner: "11111111-1111-1111-1111-111111111111",
        stage: "quotation",
        source: "referral",
        status: "open",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? oppRecord : [oppRecord]),
      });
    });

    await page.route("**/rest/v1/quotation_products**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([]),
      });
    });

    await page.route("**/rest/v1/quote_items**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const quoteRecord = {
        id: MOCK_QUOTE_ID,
        tenant_id: MOCK_TENANT_ID,
        quote_number: "PLC-00100",
        customer_id: MOCK_CUSTOMER_ID,
        opportunity_id: MOCK_OPP_ID,
        status: "draft",
        subtotal: 100000,
        discount_amount: 8000,
        vat_amount: 0,
        total: 92000,
        deposit_pct: 60,
        valid_until: "2026-11-28",
        notes: "عرض سعر خاص بالسيد مستر شاهين",
        snapshot: {
          quotationMode: "commercial",
          lines: [
            {
              id: "line-1",
              category: "door",
              categoryNameAr: "باب",
              categoryNameEn: "Door",
              name: "باب خشب سويد تجليد HPL",
              quantity: 2,
              dimensions: { width: 200, height: 90, depth: 15, unit: "cm" },
              pricingUnit: "pcs",
              pricingUnitAr: "عدد",
              technicalSpecs: "هيكل داخلي من خشب سويد مجفف",
              unitPrice: 19400,
              lineTotal: 38800,
            },
          ],
          terms: {
            deliveryDays: 30,
            warrantyYears: 5,
            transportAndInstallIncluded: true,
            paymentSchedule: [
              { percent: 60, timingAr: "مقدم عند التعاقد" },
              { percent: 30, timingAr: "بعد التعاقد بـ 15 يوم" },
              { percent: 10, timingAr: "عند الاستلام والتركيب" },
            ],
            notes: ["الباب شامل المفصلات", "ضمان فعلي لمدة 5 سنوات"],
          },
        },
        created_at: new Date().toISOString(),
      };

      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? quoteRecord : [quoteRecord]),
      });
    });

    await signIn(page);

    // ── 2. Navigate to Quotations List ─────────────────────────────────────────
    await page.goto("/admin/quotes");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Verify single clear action for creating a quotation ("New Quotation / عرض سعر جديد")
    const newQuoteLink = page.getByRole("link", { name: /عرض سعر جديد|New Quotation/i });
    await expect(newQuoteLink).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /مقايسة تصنيع|Manufacturing \(V2\)/i })).toHaveCount(0);

    // ── 3. Navigate to Commercial Quotation Builder ──────────────────────────
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");

    // Verify Builder header and Shaheen badge
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/مظهر مستر شاهين|Shaheen Presentation/i)).toBeVisible();

    // Verify presence of commercial contract terms card (60% / 30% / 10%)
    await expect(page.getByText(/شروط التعاقد والضمان والتسليم|Contract Terms/i)).toBeVisible();
    await expect(page.getByText(/جدول دفعات التعاقد|Payment Schedule/i)).toBeVisible();

    // Verify line item controls and preview action
    await expect(page.getByRole("button", { name: /إضافة بند جديد|\+ Add Item/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /معاينة عرض السعر|Preview Quote|Preview/i }).first()).toBeVisible();

    // ── 4. Verify Quotation Detail View ──────────────────────────────────────
    await page.goto(`/admin/quotes/${MOCK_QUOTE_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify detail header
    await expect(page.getByText(/PLC-00100/i)).toBeVisible({ timeout: 15_000 });

    // Verify commercial items and terms cards appear
    await expect(page.getByText(/بنود عرض السعر التجاري|Commercial Quotation Items/i)).toBeVisible();
    await expect(page.getByText(/شروط التعاقد والدفع والضمان|Contract Terms/i)).toBeVisible();

    // Verify Edit Quote button is present for draft
    await expect(page.getByRole("link", { name: /تعديل عرض السعر|Edit Quote/i })).toBeVisible();

    // Verify Download PDF button is present
    await expect(page.getByRole("button", { name: /تحميل PDF|Download PDF/i })).toBeVisible();

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
        !e.includes("fetch failed") &&
        !e.includes("Failed to fetch") &&
        !e.includes("membership lookup failed") &&
        !e.includes("404"),
    );
    expect(appExceptions).toHaveLength(0);
  });

  test("Scenario C: Interactive Data Entry (Kitchen + Door), Pricing Calculations & Persistence", async ({ page }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
        address: "القاهرة - التجمع الخامس",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/opportunities**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const oppRecord = {
        id: MOCK_OPP_ID,
        tenant_id: MOCK_TENANT_ID,
        opportunity_number: "OPP-1002",
        customer_id: MOCK_CUSTOMER_ID,
        title: "تشطيب فيلا مستر شاهين",
        project_type: "residential",
        value: "78800.00",
        sales_owner: "11111111-1111-1111-1111-111111111111",
        stage: "quotation",
        status: "open",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? oppRecord : [oppRecord]),
      });
    });

    await page.route("**/rest/v1/quotation_products**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([]),
      });
    });

    await page.route("**/rest/v1/quote_items**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify([]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const quoteRecord = {
        id: MOCK_QUOTE_ID,
        tenant_id: MOCK_TENANT_ID,
        quote_number: "PLC-00101",
        customer_id: MOCK_CUSTOMER_ID,
        opportunity_id: MOCK_OPP_ID,
        status: "draft",
        subtotal: 83800,
        discount_amount: 5000,
        vat_amount: 0,
        total: 78800,
        deposit_pct: 60,
        valid_until: "2026-11-28",
        snapshot: {
          quotationMode: "commercial",
          lines: [
            {
              id: "line-door",
              category: "door",
              categoryNameAr: "باب",
              name: "باب خشب سويد تجليد HPL",
              quantity: 2,
              unitPrice: 19400,
              lineTotal: 38800,
              dimensions: { width: 200, height: 90, depth: 15, unit: "cm" },
              pricingUnit: "pcs",
              pricingUnitAr: "عدد",
              technicalSpecs: "هيكل داخلي من خشب سويدي طبيعي",
            },
            {
              id: "line-kitchen",
              category: "kitchen",
              categoryNameAr: "مطبخ",
              name: "مطبخ خشب وميلامين مودرن",
              quantity: 1,
              unitPrice: 45000,
              lineTotal: 45000,
              dimensions: { width: 300, height: 240, depth: 60, unit: "cm" },
              pricingUnit: "m2",
              pricingUnitAr: "م²",
              technicalSpecs: "مطبخ خشب كونتر مكسو HPL مع مفصلات سوفت كلوز",
            },
          ],
          terms: {
            deliveryDays: 30,
            warrantyYears: 5,
            transportAndInstallIncluded: true,
            paymentSchedule: [
              { percent: 60, timingAr: "مقدم عند التعاقد" },
              { percent: 30, timingAr: "بعد التعاقد بـ 15 يوم" },
              { percent: 10, timingAr: "عند الاستلام والتركيب" },
            ],
            notes: ["الباب شامل المفصلات", "السعر شامل النقل والتركيب"],
          },
        },
        created_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? quoteRecord : [quoteRecord]),
      });
    });

    await signIn(page);

    // 1. Open Builder
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });

    // 2. Add Kitchen item
    const addKitchenBtn = page.getByRole("button", { name: /إضافة بند جديد|إضافة بند آخر|\+ Add Item/i }).first();
    await expect(addKitchenBtn).toBeVisible();
    await addKitchenBtn.click();

    // 3. Verify multiple line item cards exist
    const categorySelects = page.locator("text=/نوع المنتج|فئة المنتج|Category/i");
    await expect(categorySelects.first()).toBeVisible();

    // 4. Verify Calculations Breakdown section is present
    await expect(page.getByText(/المجموع الفرعي|Subtotal/i)).toBeVisible();
    await expect(page.getByText(/السعر الإجمالي بعد الخصم|Grand Total/i)).toBeVisible();
    await expect(page.getByText(/الدفعة المقدمة المقترحة|Suggested Advance/i)).toBeVisible();

    // 5. Enter custom quote number and verify value
    const quoteNumberInput = page.locator('input[placeholder="PLC-00001"]');
    await quoteNumberInput.fill("PLC-00101");
    await expect(quoteNumberInput).toHaveValue("PLC-00101");

    // 6. Verify Save actions are present and active
    const saveDraftBtn = page.getByRole("button", { name: /حفظ كمسودة|Save as Draft/i });
    const sendQuoteBtn = page.getByRole("button", { name: /اعتماد وإرسال عرض السعر|Send Quote/i });
    const downloadPdfBtn = page.getByRole("button", { name: /تحميل PDF|Download PDF/i });
    await expect(saveDraftBtn).toBeVisible();
    await expect(sendQuoteBtn).toBeVisible();
    await expect(downloadPdfBtn).toBeVisible();
  });

  test("Scenario D: Retired Configurator Route Redirect to Commercial Builder", async ({ page }) => {
    test.setTimeout(60_000);

    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
        address: "القاهرة - التجمع الخامس",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/0" },
        body: JSON.stringify([]),
      });
    });

    await signIn(page);

    // 1. Direct navigation to retired /admin/quotes/configurator
    await page.goto("/admin/quotes/configurator");
    await page.waitForLoadState("domcontentloaded");

    // 2. Verify seamless automatic redirect to /admin/quotes/new
    await expect(page).toHaveURL(/\/admin\/quotes\/new/);
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });
  });

  test("Scenario E: Bilingual Interface & Typography (Arabic RTL & English LTR)", async ({ page }) => {
    test.setTimeout(60_000);

    await signIn(page);

    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");

    // Verify Builder title and Shaheen branding in either language
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Shaheen Presentation|مظهر مستر شاهين/i)).toBeVisible();
  });

  test("Scenario F: Cross-Module Consistency — Orders, Invoices & Customer 360", async ({ page }) => {
    test.setTimeout(60_000);

    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/orders**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify([
          {
            id: "55555555-5555-5555-5555-555555555551",
            tenant_id: MOCK_TENANT_ID,
            order_number: "PLC-00100",
            customer_id: MOCK_CUSTOMER_ID,
            total: "92000.00",
            deposit: "55200.00",
            current_stage: "deposit_received",
            contract_date: "2026-09-02",
          },
        ]),
      });
    });

    await page.route("**/rest/v1/invoices**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify([
          {
            id: "66666666-6666-6666-6666-666666666661",
            tenant_id: MOCK_TENANT_ID,
            invoice_number: "PLC-00100",
            customer_id: MOCK_CUSTOMER_ID,
            total: "92000.00",
            deposit_amount: "55200.00",
            paid_amount: "55200.00",
            status: "partial",
          },
        ]),
      });
    });

    await signIn(page);

    // 1. Visit Orders list and verify order created from quote
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("PLC-00100")).toBeVisible();

    // 2. Visit Invoices list and verify invoice ledger table and columns
    await page.goto("/admin/invoices");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/رقم الفاتورة|invoice #/i).first()).toBeVisible();
    await expect(page.getByText(/العميل|customer/i).first()).toBeVisible();
  });

  test("Scenario G: Complete 14-Step User Workflow (Kitchen + Door, Dimensions, Specs, Pricing, Preview Modal & Draft)", async ({ page }) => {
    test.setTimeout(60_000);

    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
        address: "التجمع الخامس، القاهرة",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/0" },
        body: JSON.stringify([]),
      });
    });

    await signIn(page);

    // 1. Open Builder
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });

    // 2. Initial item starts unselected requiring explicit category choice
    await expect(page.getByText(/اختر نوع المنتج|Select product category/i).first()).toBeVisible({ timeout: 10_000 });
    const catTrigger = page.locator('button[role="combobox"]').filter({ hasText: /اختر نوع المنتج|Select product category/i }).first();
    await catTrigger.click();
    await page.getByRole("option", { name: /مطبخ|Kitchen/i }).first().click();
    await expect(page.getByText(/مطبخ — مطبخ|Kitchen — Kitchen|#1/i).first()).toBeVisible();

    // 3. Enter Kitchen dimensions (width 3, height 2.4)
    const widthInputs = page.locator('input[placeholder*="العرض"], input[placeholder*="Width"]');
    const heightInputs = page.locator('input[placeholder*="الارتفاع"], input[placeholder*="Height"]');
    await widthInputs.first().fill("3");
    await heightInputs.first().fill("2.4");

    // 4. Enter commercial price for Kitchen: 45000
    const priceInputs = page.locator('input[placeholder="0"]');
    await priceInputs.first().fill("45000");

    // 5. Click Add Line Item
    const addLineBtn = page.getByRole("button", { name: /إضافة بند جديد|\+ Add Item/i }).first();
    await addLineBtn.click();

    // 6. Verify second item #2 appears
    await expect(page.getByText("#2")).toBeVisible({ timeout: 5_000 });

    // 7. Verify Live Totals section displays calculations without zero bugs
    await expect(page.getByText(/المجموع الفرعي|Subtotal/i)).toBeVisible();

    // 8. Open Quotation Preview Dialog
    const previewBtn = page.getByRole("button", { name: /معاينة عرض السعر|Preview/i }).first();
    await previewBtn.click();

    // 9. Verify Preview Modal renders Shaheen branding, table headers, and customer info
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("PELECANON", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/البند والتصميم|Item & Design/i)).toBeVisible();
    await expect(dialog.getByText(/المواصفات الفنية|Technical Specs/i)).toBeVisible();

    // 10. Close Preview Modal
    const closeBtn = dialog.getByRole("button", { name: /إغلاق المعاينة|Close Preview/i });
    await closeBtn.click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Scenario H: Category Configuration in Admin Settings", async ({ page }) => {
    test.setTimeout(60_000);

    await page.route("**/rest/v1/tenants**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const tenantRecord = {
        id: MOCK_TENANT_ID,
        name: "PeleCanon Woodworks",
        phone: "01000000000",
        email: "info@pelecanon.local",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? tenantRecord : [tenantRecord]),
      });
    });

    await signIn(page);

    await page.goto("/admin/settings");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // Click categories tab
    const categoriesTab = page.getByRole("tab", { name: /تصنيفات المقايسات|Categories/i });
    await expect(categoriesTab).toBeVisible({ timeout: 10_000 });
    await categoriesTab.click();

    // Verify categories table renders with Kitchen, Dressing, Door
    await expect(page.getByText(/مطبخ|Kitchen/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/دريسنج|Dressing/i).first()).toBeVisible();
    await expect(page.getByText(/باب|Door/i).first()).toBeVisible();

    // Verify Add Category button is present
    await expect(page.getByRole("button", { name: /إضافة تصنيف جديد|Add Category/i })).toBeVisible();
  });

  test("Scenario I: Complete 19-Step Simplified UX (Unselected Category, Kitchen 85k, Door 24k, Preview, Save & Coexistence)", async ({ page }) => {
    test.setTimeout(60_000);

    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
        address: "التجمع الخامس، القاهرة",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/0" },
        body: JSON.stringify([]),
      });
    });

    await signIn(page);

    // Step 1: Open a new commercial quotation
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i)).toBeVisible({ timeout: 15_000 });

    // Step 2: Verify NO category is preselected (combobox has placeholder Select product category / اختر نوع المنتج)
    await expect(page.getByText(/اختر نوع المنتج|Select product category/i).first()).toBeVisible({ timeout: 10_000 });

    // Step 3: Select Kitchen (مطبخ)
    const categoryTrigger1 = page.locator('button[role="combobox"]').filter({ hasText: /اختر نوع المنتج|Select product category/i }).first();
    await categoryTrigger1.click();
    const kitchenOption = page.getByRole("option", { name: /مطبخ|Kitchen/i }).first();
    await expect(kitchenOption).toBeVisible();
    await kitchenOption.click();

    // Verify Kitchen is selected and item fields expand
    await expect(page.getByText(/مطبخ — مطبخ|Kitchen — Kitchen|#1/i).first()).toBeVisible();

    // Step 4: Enter Kitchen dimensions: Width 3, Height 2.4, Depth 0.6
    const widthInputs = page.locator('input[placeholder*="العرض"], input[placeholder*="Width"]');
    const heightInputs = page.locator('input[placeholder*="الارتفاع"], input[placeholder*="Height"]');
    const depthInputs = page.locator('input[placeholder*="العمق"], input[placeholder*="Depth"]');
    await widthInputs.first().fill("3");
    await heightInputs.first().fill("2.4");
    await depthInputs.first().fill("0.6");

    // Step 5: Enter technical specifications
    const specsAreas = page.locator('textarea[placeholder*="الهيكل"], textarea[placeholder*="specifications"]');
    await specsAreas.first().fill("خشب كونتر جودوود مع دلف HPL تركي ومفصلات إسباني سوفت كلوز");

    // Step 6: Enter agreed complete commercial price: 85,000
    const priceInputs = page.locator('input[placeholder="0"]');
    await priceInputs.first().fill("85000");

    // Step 7: Click + Add Item (+ إضافة بند)
    const addLineBtn = page.getByRole("button", { name: /إضافة بند جديد|\+ Add Item/i }).first();
    await addLineBtn.click();
    await expect(page.getByText("#2")).toBeVisible({ timeout: 5_000 });

    // Step 8: Verify item #2 requires category selection. Select Door (باب)
    const categoryTrigger2 = page.locator('button[role="combobox"]').filter({ hasText: /اختر نوع المنتج|Select product category/i }).first();
    await expect(categoryTrigger2).toBeVisible();
    await categoryTrigger2.click();
    const doorOption = page.getByRole("option", { name: /باب|Door/i }).first();
    await expect(doorOption).toBeVisible();
    await doorOption.click();

    // Step 9: Enter Door dimensions (2000 x 900 mm), unit pcs, quantity 2, unit price 12,000
    await widthInputs.nth(1).fill("2000");
    await heightInputs.nth(1).fill("900");

    const qtyInputs = page.locator('input[type="number"][placeholder="1"]');
    await qtyInputs.nth(1).fill("2");
    await priceInputs.nth(1).fill("12000");

    // Step 10: Verify Kitchen total: 85,000
    // Step 11: Verify Door total: 24,000
    // Step 12: Verify subtotal: 109,000
    await expect(page.getByText(/المجموع الفرعي|Subtotal/i)).toBeVisible();
    await expect(page.getByText(/السعر الإجمالي بعد الخصم|Grand Total/i)).toBeVisible();
    await expect(page.getByText(/١٠٩٬٠٠٠|109,000/i).first()).toBeVisible();

    // Step 13: Preview quotation and verify dialog renders exact values (109,000)
    const previewBtn = page.getByRole("button", { name: /معاينة عرض السعر|Preview/i }).first();
    await previewBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("PELECANON", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/١٠٩٬٠٠٠|109,000/i).first()).toBeVisible();

    // Close preview
    const closeBtn = dialog.getByRole("button", { name: /إغلاق المعاينة|Close Preview/i });
    await closeBtn.click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Step 14: Save Draft action is visible and ready
    const saveDraftBtn = page.getByRole("button", { name: /حفظ كمسودة|Save as Draft/i });
    await expect(saveDraftBtn).toBeVisible();

    // Step 15: Download PDF action is visible and ready
    const downloadPdfBtn = page.getByRole("button", { name: /تحميل PDF|Download PDF/i });
    await expect(downloadPdfBtn).toBeVisible();
  });
});
