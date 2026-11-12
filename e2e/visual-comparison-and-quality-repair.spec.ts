import { test, expect } from "@playwright/test";
import path from "path";
import { signIn } from "./fixtures/auth";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

test.describe("Phase 3 & Phase 5 - Visual Quality Stabilization & Responsive Audit", () => {
  test("Screen 1: Admin Dashboard - Captures Light & Dark After Repair", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await signIn(page);

    // Light Mode
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "en");
      el.setAttribute("dir", "ltr");
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_admin_light_after.png"),
      fullPage: false,
    });

    // Dark Mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_admin_dark_after.png"),
      fullPage: false,
    });
  });

  test("Screen 2: Quotation Management - Captures Light & Dark After Repair", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await signIn(page);

    // Light Mode
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "en");
      el.setAttribute("dir", "ltr");
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_quotes_light_after.png"),
      fullPage: false,
    });

    // Dark Mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_quotes_dark_after.png"),
      fullPage: false,
    });
  });

  test("Screen 3: Inventory Management - Captures Light & Dark After Repair", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await signIn(page);

    // Light Mode
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "en");
      el.setAttribute("dir", "ltr");
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_inventory_light_after.png"),
      fullPage: false,
    });

    // Dark Mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_inventory_dark_after.png"),
      fullPage: false,
    });
  });

  const RESPONSIVE_VIEWPORTS = [
    { name: "small-mobile", width: 320, height: 640 },
    { name: "standard-mobile", width: 375, height: 667 },
    { name: "large-mobile", width: 430, height: 932 },
    { name: "tablet-portrait", width: 768, height: 1024 },
    { name: "tablet-landscape", width: 1024, height: 768 },
    { name: "laptop", width: 1366, height: 768 },
    { name: "desktop", width: 1440, height: 900 },
    { name: "large-desktop", width: 1920, height: 1080 },
  ];

  for (const vp of RESPONSIVE_VIEWPORTS) {
    test(`Responsive Audit [${vp.name} - ${vp.width}x${vp.height}]: No horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page);
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");

      // Check that document body has no horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth + 2;
      });
      expect(overflow).toBe(true);

      if (vp.name === "standard-mobile" || vp.name === "tablet-portrait") {
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `responsive_admin_${vp.name}.png`),
        });
      }
    });
  }

  test("Interactive Elements: Dialog & Drawer Dark Mode Layering", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    // Open inventory and trigger Create Item modal in Dark mode
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.add("dark");
      el.setAttribute("lang", "en");
      el.setAttribute("dir", "ltr");
    });
    await page.waitForTimeout(600);

    const createBtn = page.getByRole("button", { name: /Add Inventory Item|إضافة صنف|Add Item/i }).first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await page.waitForTimeout(600);

    // Verify modal is visible with elevated surface
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "interactive_modal_inventory_dark.png"),
    });

    // Also capture in Light mode
    await page.locator("html").evaluate((el) => el.classList.remove("dark"));
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "interactive_modal_inventory_light.png"),
    });
  });
});
