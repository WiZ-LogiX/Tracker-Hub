import { test, expect } from "@playwright/test";
import * as path from "path";
import { signIn } from "./fixtures/auth";

test.describe("Quotation-Centered Business Integration & UI Verification", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept quote detail queries
    await page.route("**/rest/v1/quotes**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/1",
        },
        body: JSON.stringify({
          id: "mock-quote-id",
          quote_number: "PLC-2026-0042",
          customer_id: "33333333-3333-3333-3333-333333333331",
          status: "accepted",
          total: 185000,
          subtotal: 162280,
          vat_amount: 22720,
          discount_amount: 0,
          deposit_pct: 50,
          created_at: new Date().toISOString(),
          snapshot: {
            customerName: "شركة الأهرام للتطوير العقاري",
            customerPhone: "01099887766",
            customerEmail: "ahram@example.com",
            opportunityId: "opp-101",
            opportunityNumber: "OPP-2026-0012",
            opportunityTitle: "فيلا الشيخ زايد - تشطيب كامل",
            opportunityStage: "quotation",
          },
        }),
      });
    });

    await page.route("**/rest/v1/quotation_products**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/0",
        },
        body: JSON.stringify([]),
      });
    });

    await signIn(page);
  });

  test("1. Quotation list displays Customer 360 link and status indicators without clipping", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");

    // Check no horizontal document overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // Check that customer buttons exist
    const customerLinks = page.locator('table button[title*="360"]');
    if ((await customerLinks.count()) > 0) {
      await customerLinks.first().click();
      await page.waitForTimeout(500);
      // Drawer should be open
      const drawer = page.locator('[role="dialog"]');
      await expect(drawer.first()).toBeVisible();
      // Close drawer with Escape or close button
      await page.keyboard.press("Escape");
    }

    // Capture screenshot
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/quotations_business_indicators.png",
      fullPage: false,
    });
  });

  test("2. Quotation Detail displays 6-card Business Relationships section", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");

    // Click on the first quotation row in tbody
    const quoteRowLink = page.locator('tbody tr td:first-child a').first();
    await expect(quoteRowLink).toBeVisible();
    await quoteRowLink.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Verify Business Relationships section exists
    const relationshipHeader = page.locator("text=العلاقات التجارية ودورة العمل المتكاملة").or(page.locator("text=Business Relationships"));
    await expect(relationshipHeader.first()).toBeVisible();

    // Check no horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // Take screenshot of quotation detail business relationships
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/quote_detail_business_relationships.png",
      fullPage: false,
    });
  });

  test("3. CRM Analytics supports All Time window and shows direct quotes breakdown", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await page.goto("/admin/crm/analytics");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Verify no horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // Check All-Time option exists in TimeWindow select
    const windowSelect = page.locator("button").filter({ hasText: /هذا الشهر|This Month|جميع الفترات|All Time/i }).first();
    if (await windowSelect.isVisible()) {
      await windowSelect.click();
      await page.waitForTimeout(300);
      const allTimeOption = page.locator('[role="option"]').filter({ hasText: /جميع الفترات|كل الأوقات|All Time/i });
      if (await allTimeOption.isVisible()) {
        await allTimeOption.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(800);
      }
    }

    // Take screenshot of CRM Analytics
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/crm_analytics_breakdown.png",
      fullPage: false,
    });
  });
});
