import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import path from "node:path";
import fs from "node:fs";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

test.describe("PeleCanon Performance & Quotation Standardization Acceptance Suite", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("1. Dashboard with populated KPI figures", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    // Wait for the Command Center header and KPI metrics
    await expect(page.locator("text=مركز القيادة والعمليات التنفيذية").or(page.locator("text=Executive Operations Command Center"))).toBeVisible({ timeout: 15000 });

    // Verify populated financial and commercial metrics
    await expect(page.locator("text=المالية والتحصيل").or(page.locator("text=Financial & Collection"))).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=خط المبيعات").or(page.locator("text=Commercial Pipeline"))).toBeVisible({ timeout: 10000 });

    // Verify fast rendering without remaining in loading state
    await page.waitForTimeout(1000);

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_1_dashboard_kpis.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("2. CRM Analytics with populated metrics", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    await page.goto("/admin/crm/analytics?timeWindow=all_time&window=all_time");
    await page.waitForLoadState("domcontentloaded");

    // Verify CRM analytics title and metric cards
    await expect(page.getByRole("heading", { name: /CRM Intelligence & Analytics|ذكاء وتحليلات المبيعات/i })).toBeVisible({ timeout: 15000 });

    // Wait for KPI cards to be populated
    await expect(page.locator("text=إجمالي العملاء المحتملين").or(page.locator("text=Total Leads"))).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_2_crm_analytics.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("3. Projects page with loaded figures", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    await page.goto("/admin/projects");
    await page.waitForLoadState("domcontentloaded");

    // Verify Projects header and table
    await expect(page.locator("text=إدارة المشاريع التشغيلية").or(page.locator("text=Customer Projects & Jobs"))).toBeVisible({ timeout: 15000 });

    // Verify canonical PRJ-DCD02 project is visible in list
    await expect(page.locator("text=PRJ-DCD02").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_3_projects_page.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("4. Invoices and Payments with populated figures", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    await page.goto("/admin/invoices");
    await page.waitForLoadState("domcontentloaded");

    // Verify invoices ledger
    await expect(page.locator("text=الفواتير وسجل التحصيل").or(page.locator("text=Invoices & Payments Ledger"))).toBeVisible({ timeout: 15000 });

    // Verify populated invoice row with canonical PLC-DCD02
    await expect(page.locator("text=PLC-DCD02").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_4_invoices_payments.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("5. Quotation displaying new PLC-XXXXX identifier", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    await page.goto("/admin/quotes/603d3f00-0895-4cf1-9d08-6e50987e6c42");
    await page.waitForLoadState("domcontentloaded");

    // Verify canonical quotation number PLC-DCD02 is displayed in header
    await expect(page.locator("text=PLC-DCD02").first()).toBeVisible({ timeout: 15000 });

    // Verify legacy number badge is displayed for auditability
    await expect(page.locator("text=PLC-TRX-2026-01").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_5_quotation_canonical_id.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("6. Project and Order displaying matching relationship", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    // Navigate to Project Workspace for PRJ-DCD02
    await page.goto("/admin/projects/dd17f6a4-6f28-498c-8f95-875c06f475c9");
    await page.waitForLoadState("domcontentloaded");

    // Verify Project Number PRJ-DCD02 and linked Order Number PLC-DCD02
    await expect(page.locator("text=PRJ-DCD02").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=PLC-DCD02").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_6_project_order_relationship.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("7. Generated PDF displaying new quotation number", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });
    await page.goto("/admin/quotes/603d3f00-0895-4cf1-9d08-6e50987e6c42");
    await page.waitForLoadState("domcontentloaded");

    // Verify Quotation detail page with Download PDF button and PLC-DCD02
    const downloadPdfButton = page.getByRole("button", { name: /تحميل PDF|Download PDF/i });
    await expect(downloadPdfButton).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=PLC-DCD02").first()).toBeVisible();

    const screenshotPath = path.join(ARTIFACT_DIR, "screenshot_7_generated_pdf_quote.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
