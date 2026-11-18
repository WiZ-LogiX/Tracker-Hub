import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

const TEST_RECORD = {
  quoteId: "603d3f00-0895-4cf1-9d08-6e50987e6c42",
  quoteNumber: "PLC-TRX-2026-01",
  projectId: "dd17f6a4-6f28-498c-8f95-875c06f475c9",
  projectNumber: "PRJ-TRX-2026-01",
  orderId: "d08c8068-5627-4fe7-bf59-09756495cd7d",
  orderNumber: "PLC-TRX-2026-01",
  deliveryId: "bae27b12-8371-40c3-ad64-3e1145246299",
  deliveryNumber: "DEL-TRX-2026-01",
  invoiceId: "219ae124-6eea-413e-9b0b-917ccd3b1c19",
  invoiceNumber: "PLC-TRX-2026-01",
  customerName: "م. شريف المنشاوي",
};

test("Capture Detail Drawers and New Session Persistence", async ({ page, browser }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1376, height: 900 });

  // 1. Invoices Detail Drawer with Payments (auto-opened by search param)
  await page.goto(`/admin/invoices?invoiceId=${TEST_RECORD.invoiceId}`);
  await page.waitForLoadState("domcontentloaded");
  // Wait for the drawer or table to display the invoice details
  await expect(page.locator(`text=${TEST_RECORD.invoiceNumber}`).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_c_invoice_drawer.png",
    fullPage: false,
  });

  // 2. Delivery Detail Drawer (auto-opened by search param)
  await page.goto(`/admin/deliveries?deliveryId=${TEST_RECORD.deliveryId}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(`text=${TEST_RECORD.deliveryNumber}`).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_c_delivery_drawer.png",
    fullPage: false,
  });

  // 3. New Browser Session Persistence
  const newContext = await browser.newContext();
  const newPage = await newContext.newPage();
  await signIn(newPage);
  await newPage.setViewportSize({ width: 1376, height: 900 });
  await newPage.goto(`/admin/quotes/${TEST_RECORD.quoteId}`);
  await newPage.waitForLoadState("domcontentloaded");
  const prjBadge = newPage.locator(`text=${TEST_RECORD.projectNumber}`);
  await expect(prjBadge.first()).toBeVisible({ timeout: 15000 });
  await newPage.screenshot({
    path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/acceptance_scenario_j_new_session_persistence.png",
    fullPage: false,
  });
  await newContext.close();
});
