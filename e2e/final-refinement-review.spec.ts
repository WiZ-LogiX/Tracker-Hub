import { test, expect } from "@playwright/test";
import path from "path";
import { signIn } from "./fixtures/auth";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

test.describe("Phase 2 & Phase 11 - Final UI/UX Refinement Visual Acceptance", () => {
  test("1. Mandatory Three-Screen Visual Review in 1376x909 (Light vs Dark)", async ({ page }) => {
    // Exact mandatory viewport requested
    await page.setViewportSize({ width: 1376, height: 909 });
    await signIn(page);

    // ==========================================
    // SCREEN 1: ADMIN DASHBOARD (/admin)
    // ==========================================
    // Light Mode (EN)
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

    // Dark Mode (EN)
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_admin_dark_after.png"),
      fullPage: false,
    });

    // ==========================================
    // SCREEN 2: QUOTATIONS (/admin/quotes)
    // ==========================================
    // Light Mode (EN)
    await page.locator("html").evaluate((el) => el.classList.remove("dark"));
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_quotes_light_after.png"),
      fullPage: false,
    });

    // Dark Mode (EN)
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_quotes_dark_after.png"),
      fullPage: false,
    });

    // ==========================================
    // SCREEN 3: INVENTORY (/admin/inventory)
    // ==========================================
    // Light Mode (EN)
    await page.locator("html").evaluate((el) => el.classList.remove("dark"));
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_inventory_light_after.png"),
      fullPage: false,
    });

    // Dark Mode (EN)
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_inventory_dark_after.png"),
      fullPage: false,
    });
  });

  test("2. Arabic RTL Experience in 1376x909", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await signIn(page);

    // Setup Arabic RTL environment
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "ar");
      window.localStorage.setItem("pelecanon-theme", "light");
    });

    // Arabic Dashboard
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "ar");
      el.setAttribute("dir", "rtl");
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "arabic_admin_dashboard.png"),
      fullPage: false,
    });

    // Arabic Quotations
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "ar");
      el.setAttribute("dir", "rtl");
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "arabic_quotes_management.png"),
      fullPage: false,
    });

    // Arabic Inventory
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "ar");
      el.setAttribute("dir", "rtl");
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "arabic_inventory_management.png"),
      fullPage: false,
    });
  });

  test("3. Mobile Responsive Viewport (375x667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await signIn(page);

    // Mobile Dashboard
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile_admin_dashboard.png"),
      fullPage: false,
    });

    // Mobile Quotations
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile_quotes_management.png"),
      fullPage: false,
    });

    // Mobile Inventory
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile_inventory_management.png"),
      fullPage: false,
    });
  });

  test("4. Interactive Dialog Elevation in Light and Dark Modes", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 909 });
    await signIn(page);

    // Navigate to Inventory
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");

    // Open Add Inventory Item Modal in Light Mode
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "en");
      el.setAttribute("dir", "ltr");
    });
    await page.getByRole("button", { name: /Add Inventory Item|إضافة صنف/i }).click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dialog_inventory_light.png"),
      fullPage: false,
    });

    // Switch to Dark Mode with Modal Open
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dialog_inventory_dark.png"),
      fullPage: false,
    });
  });
});
