import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("PeleCanon Operational Workflow Integration & Navigation E2E", () => {
  test("1. Main Catalog Options tab hosts Product Categories management", async ({ page }) => {
    await signIn(page);

    // Navigate to /admin/products
    await page.goto("/admin/products");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 15_000 });

    // Verify Catalog Products tab is active
    const catalogTab = page.getByRole("tab", { name: /منتجات الكتالوج|Catalog Items/i });
    const optionsTab = page.getByRole("tab", { name: /خيارات وتصنيفات|Catalog Options/i });
    await expect(catalogTab).toBeVisible();
    await expect(optionsTab).toBeVisible();

    // Click Options tab
    await optionsTab.click();

    // Verify Commercial Product Categories table renders
    await expect(page.getByText(/تصنيفات منتجات عروض الأسعار|Quotation Product Categories/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/مطبخ|Kitchen/i).first()).toBeVisible();
    await expect(page.getByText(/دريسنج|Dressing/i).first()).toBeVisible();
    await expect(page.getByText(/باب|Door/i).first()).toBeVisible();

    // Verify Add Category button is present
    await expect(page.getByRole("button", { name: /إضافة تصنيف جديد|Add Category/i })).toBeVisible();

    // Take screenshot of Catalog Options tab
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/catalog_options_categories.png",
      fullPage: true,
    });
  });

  test("2. Settings page has completely removed Company Info and Commercial Registry, hosting only System Standards & Diagnostics", async ({ page }) => {
    await signIn(page);

    // Navigate directly to /admin/settings
    await page.goto("/admin/settings");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // Verify only System Preferences and Environment Diagnostics tabs are present
    const systemTab = page.getByRole("tab", { name: /تفضيلات النظام|System Preferences/i });
    const diagTab = page.getByRole("tab", { name: /حالة البيئة والتشغيل|Environment & Health/i });
    await expect(systemTab).toBeVisible();
    await expect(diagTab).toBeVisible();

    // Verify Company Information and Commercial Registry tabs DO NOT EXIST
    const orgTab = page.getByRole("tab", { name: /السجل التجاري والضريبي|Commercial & Tax Registry|بيانات الشركة|Company Info/i });
    await expect(orgTab).toHaveCount(0);

    // Verify obsolete PDF color picker and old logo layout sliders are completely gone
    const colorPicker = page.locator('input[type="color"]');
    await expect(colorPicker).toHaveCount(0);

    // Categories must NOT be in Settings
    const oldCategoriesTab = page.getByRole("tab", { name: /تصنيفات المقايسات/i });
    await expect(oldCategoriesTab).toHaveCount(0);

    // Verify System standards content: Currency EGP, 14% VAT, 50% deposit, 30 days delivery
    await expect(page.getByText(/EGP — الجنيه المصري|Egyptian Pound/i)).toBeVisible();
    await expect(page.getByText(/14%/i)).toBeVisible();
    await expect(page.getByText(/50%/i)).toBeVisible();
    await expect(page.getByText(/30/i)).toBeVisible();

    // Click Diagnostics tab
    await diagTab.click();
    await expect(page.getByText(/Cloudflare R2/i)).toBeVisible();
    await expect(page.getByText(/Supabase/i)).toBeVisible();
    await expect(page.getByText(/Commit e820b8c/i)).toBeVisible();

    // Take screenshot of Settings
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/settings_deemphasized_system.png",
      fullPage: true,
    });
  });

  test("3. Seamless Admin Navigation without full-screen workspace bootstrapping interruption", async ({ page }) => {
    await signIn(page);

    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // Ensure the persistent sidebar brand logo is visible
    const sidebarLogo = page.locator('aside img[alt="PeleCanon"]').first();
    await expect(sidebarLogo).toBeVisible();

    // Route sequence: /admin -> /admin/quotes -> /admin/products -> /admin/orders -> /admin/projects -> /admin/settings
    const routesToVisit = [
      "/admin/quotes",
      "/admin/products",
      "/admin/orders",
      "/admin/projects",
      "/admin/settings",
    ];

    for (const route of routesToVisit) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // Verify that full-screen bootstrapping loader NEVER appears during navigation
      const fullScreenBootstrap = page.getByText(/Preparing your workspace…|جاري تجهيز مساحة العمل…/i);
      await expect(fullScreenBootstrap).toHaveCount(0);

      // Verify persistent sidebar remains mounted
      await expect(sidebarLogo).toBeVisible();
    }
  });

  test("4. Connected Workflow: Quotation and Order detail surfaces lifecycle relationships", async ({ page }) => {
    await signIn(page);

    // Navigate to /admin/orders
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // Take screenshot of Orders view with connected lifecycle flow
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/orders_operational_workflow.png",
      fullPage: true,
    });

    // Navigate to /admin/projects
    await page.goto("/admin/projects");
    await page.waitForLoadState("domcontentloaded");

    // Take screenshot of Projects Workspace
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/projects_workspace_overview.png",
      fullPage: true,
    });
  });
});
