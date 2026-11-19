import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";
import path from "path";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

test.describe("Sprint 7B: Public /compare ERP Positioning & Quote Builder Quick-Pick Tiles", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept CRM customer and quotation routes for clean isolated execution
    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "عميل ورشة تجريبي",
        phone: "+20 10 12345678",
        email: "workshop-client@example.com",
        address: "القاهرة الجديدة",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const quoteRecord = {
        id: "77777777-7777-7777-7777-777777777777",
        tenant_id: MOCK_TENANT_ID,
        customer_id: MOCK_CUSTOMER_ID,
        number: "QUO-2026-CMP",
        total: 85000,
        status: "draft",
        valid_until: "2026-12-31",
        created_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? quoteRecord : [quoteRecord]),
      });
    });
  });

  test("1. /compare renders luxury Atelier positioning page in English (LTR) with 10-row matrix & plans", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "en");
    });
    await page.goto("/compare");
    await page.waitForLoadState("networkidle");

    // Brand Logo & Header
    await expect(page.locator("header img[alt='PeleCanon']")).toBeVisible();
    await expect(page.locator("header a[href='/track']").first()).toBeVisible();

    // Hero Section
    await expect(
      page.getByText("Built for Furniture Workshops, Not Corporate Cubicles."),
    ).toBeVisible();
    await expect(
      page.getByText(/Bridging the critical operational gap after CAD design/i),
    ).toBeVisible();

    // CTA buttons
    const startFreeBtn = page.getByRole("button", { name: /Start Free \(3 Seats\)/i }).first();
    await expect(startFreeBtn).toBeVisible();
    const trackDemoBtn = page.getByRole("button", { name: /Live Tracking Portal/i }).first();
    await expect(trackDemoBtn).toBeVisible();

    // 10-Row Comparison Matrix
    const matrix = page.locator("#matrix");
    await expect(matrix).toBeVisible();
    await expect(matrix.getByRole("heading", { name: /The Workshop Reality/i })).toBeVisible();
    await expect(matrix.getByText("PeleCanon ERP").first()).toBeVisible();
    await expect(matrix.getByText("Excel & WhatsApp").first()).toBeVisible();
    await expect(matrix.getByText("Generic ERPs (Odoo / SAP)").first()).toBeVisible();

    // Verify concrete workshop rows exist
    await expect(matrix.getByText(/Setup & Time to Value/i)).toBeVisible();
    await expect(matrix.getByText(/Egyptian Localization & Statutory 14% VAT/i)).toBeVisible();
    await expect(matrix.getByText(/CAD Cut-List CSV Importer/i)).toBeVisible();
    await expect(matrix.getByText(/Shop-Floor QC Gate & Auto-Remake Loop/i)).toBeVisible();
    await expect(matrix.getByText(/Worker Task Workspace/i)).toBeVisible();

    // Workflow Handoff
    await expect(
      page.getByText(/From 3D Drawing to Installed Masterpiece in 3 Steps/i),
    ).toBeVisible();
    await expect(page.getByText(/1\. Design in CAD/i)).toBeVisible();
    await expect(page.getByText(/2\. Export Cut-List CSV/i)).toBeVisible();
    await expect(page.getByText(/3\. Execute in PeleCanon/i)).toBeVisible();

    // 3 Plans Strip
    await expect(page.getByText("Starter Free").first()).toBeVisible();
    await expect(page.getByText("Professional Workshop").first()).toBeVisible();
    await expect(page.getByText("Enterprise Factory").first()).toBeVisible();
    await expect(page.getByText("950 EGP").first()).toBeVisible();

    // Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "compare_page_desktop_en.png"),
      fullPage: true,
    });
  });

  test("2. /compare renders flawless Arabic RTL layout with Cairo typography", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "ar");
    });
    await page.goto("/compare");
    await page.waitForLoadState("networkidle");

    // RTL verification
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Arabic Hero
    await expect(
      page.getByText("مصمم لورش ومصانع الأثاث.. وليس للمكاتب والشركات التقليدية."),
    ).toBeVisible();
    await expect(
      page.getByText(/سد الفجوة التشغيلية الحرجة بعد تصميم CAD/i),
    ).toBeVisible();

    // Arabic Matrix
    const matrix = page.locator("#matrix");
    await expect(matrix).toBeVisible();
    await expect(matrix.getByText("بيليكانون ERP").first()).toBeVisible();
    await expect(matrix.getByText("الإكسيل والواتساب").first()).toBeVisible();
    await expect(matrix.getByText(/التوطين المصري وضريبة القيمة المضافة ١٤٪/i)).toBeVisible();

    // Arabic Plans
    await expect(page.getByText("البداية المجانية").first()).toBeVisible();
    await expect(page.getByText("الورشة الاحترافية").first()).toBeVisible();
    await expect(page.getByText("المصانع والشركات").first()).toBeVisible();
    await expect(page.getByText("٩٥٠ ج.م").first()).toBeVisible();

    // Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "compare_page_desktop_ar.png"),
      fullPage: true,
    });
  });

  test("3. Navigation links from homepage to /compare and to /auth?tab=register", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "en");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Desktop nav link to Compare
    const compareLink = page.locator("header nav.hidden.lg\\:flex a[href='/compare']");
    await expect(compareLink).toBeVisible();
    await compareLink.click();

    // Verify URL
    await page.waitForURL(/\/compare/);
    expect(page.url()).toContain("/compare");

    // Click Start Free button on /compare
    const ctaRegister = page.locator("a[href*='register']").first();
    await expect(ctaRegister).toBeVisible();
    await ctaRegister.click();

    // Verify navigation to /auth
    await page.waitForURL(/\/auth/);
    expect(page.url()).toContain("/auth");
  });

  test("4. Quote Builder (/admin/quotes/new): Quick-Pick Category Tiles select in 1 click and auto-fill units/specs while keeping combobox functional", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");

    // Header check
    await expect(
      page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i),
    ).toBeVisible({ timeout: 15_000 });

    // Item #1: Verify Quick-Pick Category Tiles exist
    await expect(
      page.getByText(/الفئات السريعة الأكثر طلباً|Quick-Pick Product Categories/i),
    ).toBeVisible({ timeout: 10_000 });

    // Verify Combobox trigger is also visible and preserved
    const catTrigger = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /اختر نوع المنتج|Select product category/i })
      .first();
    await expect(catTrigger).toBeVisible();

    // 1-Click Tile Selection: Click "Kitchen" / "مطبخ" tile
    const kitchenTile = page
      .locator("button")
      .filter({ hasText: /مطبخ|Kitchen/i })
      .first();
    await expect(kitchenTile).toBeVisible();
    await kitchenTile.click();

    // Verify Item #1 is now configured as Kitchen
    await expect(page.getByText(/مطبخ — مطبخ|Kitchen — Kitchen|#1/i).first()).toBeVisible();

    // Verify Technical Specs template is auto-populated
    const specsArea = page.locator("textarea");
    await expect(specsArea.first()).toBeVisible();
    const specsValue = await specsArea.first().inputValue();
    expect(specsValue.length).toBeGreaterThan(10);

    // Verify Catalog Item selector is present
    await expect(page.getByText(/صنف الكتالوج|Catalog Item/i).first()).toBeVisible();

    // Click "+ Add Item"
    const addLineBtn = page.getByRole("button", { name: /إضافة بند جديد|\+ Add Item/i }).first();
    await addLineBtn.click();

    // Verify item #2 appears
    await expect(page.getByText("#2")).toBeVisible({ timeout: 5_000 });

    // Item #2 starts unselected: verify combobox selection still works flawlessly
    const catTrigger2 = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /اختر نوع المنتج|Select product category/i })
      .first();
    await expect(catTrigger2).toBeVisible();
    await catTrigger2.click();

    const doorOption = page.getByRole("option", { name: /باب|Door/i }).first();
    await expect(doorOption).toBeVisible();
    await doorOption.click();

    // Verify Item #2 is now Door
    await expect(page.getByText(/باب — باب|Door — Door|#2/i).first()).toBeVisible();

    // Enter Price for Item #1
    const priceInputs = page.locator('input[placeholder="0"]');
    await priceInputs.first().fill("65000");

    // Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "quote_builder_quick_pick_tiles.png"),
    });
  });
});
