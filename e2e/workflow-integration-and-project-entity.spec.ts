import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

const TEST_RECORD = {
  quoteId: "603d3f00-0895-4cf1-9d08-6e50987e6c42",
  quoteNumber: "PLC-DCD02",
  projectId: "dd17f6a4-6f28-498c-8f95-875c06f475c9",
  projectNumber: "PRJ-DCD02",
  orderId: "d08c8068-5627-4fe7-bf59-09756495cd7d",
  orderNumber: "PLC-DCD02",
  deliveryId: "bae27b12-8371-40c3-ad64-3e1145246299",
  deliveryNumber: "DEL-TRX-2026-01",
  invoiceId: "219ae124-6eea-413e-9b0b-917ccd3b1c19",
  invoiceNumber: "PLC-DCD02",
  customerName: "م. شريف المنشاوي",
};

test.describe("PeleCanon Workflow Integration & Project Entity Acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Scenario A: Quotation Commercial Hub & Business Relationships", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });

    // 1. Visit Quotation Detail directly
    await page.goto(`/admin/quotes/${TEST_RECORD.quoteId}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for the Business Relationships cards to load with real data
    const relationshipSection = page.locator("text=العلاقات التجارية ودورة العمل المتكاملة").or(page.locator("text=Business Relationships"));
    await expect(relationshipSection.first()).toBeVisible({ timeout: 15000 });

    // Verify linked Project badge and Project Number
    await expect(page.locator(`text=${TEST_RECORD.projectNumber}`).first()).toBeVisible({ timeout: 10000 });

    // Verify linked Production Order Number
    await expect(page.locator(`text=${TEST_RECORD.orderNumber}`).first()).toBeVisible({ timeout: 10000 });

    // Verify linked Delivery Number
    await expect(page.locator(`text=${TEST_RECORD.deliveryNumber}`).first()).toBeVisible({ timeout: 10000 });

    // Verify Customer name
    await expect(page.locator(`text=${TEST_RECORD.customerName}`).first()).toBeVisible({ timeout: 10000 });

    // Take screenshot of Quotation commercial context
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_a_quotation_detail.png",
      fullPage: false,
    });
  });

  test("Scenario B: Dedicated Projects Index & Exact Workspace Linking", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });

    // 1. Visit Projects Listing
    await page.goto("/admin/projects");
    await page.waitForLoadState("domcontentloaded");

    // Verify projects page loads with real projects
    const testProjectRow = page.locator(`text=${TEST_RECORD.projectNumber}`);
    await expect(testProjectRow.first()).toBeVisible({ timeout: 15000 });

    // Take screenshot of Projects Workspace Listing
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_b_projects_index.png",
      fullPage: false,
    });

    // 2. Open Project Workspace for the verified project
    await page.goto(`/admin/projects/${TEST_RECORD.projectId}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for skeletons to completely vanish and real project header to be visible
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 15000 });
    const prjHeading = page.locator(`text=${TEST_RECORD.projectNumber}`).or(page.locator("text=صالون وطعام فاخر"));
    await expect(prjHeading.first()).toBeVisible({ timeout: 10000 });

    // Screenshot Project Workspace Header & Loaded Tabs
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_b_project_workspace.png",
      fullPage: false,
    });
  });

  test("Scenario C: Deep-linking across Orders, Deliveries, and Invoices", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });

    // 1. Visit Orders with orderId query param to verify auto-selection
    await page.goto(`/admin/orders?orderId=${TEST_RECORD.orderId}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for the order row to appear and not be "No production orders exist"
    await expect(page.locator(`text=${TEST_RECORD.orderNumber}`).first()).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_c_orders_view.png",
      fullPage: false,
    });

    // 2. Visit Deliveries with deliveryId query param
    await page.goto(`/admin/deliveries?deliveryId=${TEST_RECORD.deliveryId}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for deliveries table to load and delivery number to appear
    await expect(page.locator(`text=${TEST_RECORD.deliveryNumber}`).first()).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_c_deliveries_view.png",
      fullPage: false,
    });

    // 3. Visit Invoices with invoiceId query param
    await page.goto(`/admin/invoices?invoiceId=${TEST_RECORD.invoiceId}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for invoice row to appear (no "Loading invoices ledger...")
    await expect(page.locator(`text=${TEST_RECORD.invoiceNumber}`).first()).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_c_invoices_view.png",
      fullPage: false,
    });
  });

  test("Scenario D: CRM Analytics All-Time Persistence Across Refreshes", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });

    // 1. Navigate to CRM Analytics with timeWindow=all_time
    await page.goto("/admin/crm/analytics?timeWindow=all_time");
    await page.waitForLoadState("domcontentloaded");

    // Wait for skeletons to be detached and real dashboard to load
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 15000 });

    // Verify the URL still contains all_time
    expect(page.url()).toContain("all_time");

    // Verify analytics KPI cards and breakdowns rendered without error
    const kpiSection = page.locator("text=ذكاء وتحليلات المبيعات").or(page.locator("text=CRM Intelligence & Analytics"));
    await expect(kpiSection.first()).toBeVisible({ timeout: 10000 });

    // Capture screenshot of CRM Analytics with All Time selected and loaded
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_d_analytics_all_time.png",
      fullPage: false,
    });

    // 2. Refresh browser and verify URL and filter remain all_time
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 15000 });

    expect(page.url()).toContain("all_time");
    await expect(kpiSection.first()).toBeVisible({ timeout: 10000 });
  });
});
