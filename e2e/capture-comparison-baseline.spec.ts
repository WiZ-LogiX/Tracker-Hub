import { test, expect } from "@playwright/test";
import path from "path";
import { signIn } from "./fixtures/auth";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

test.describe("Phase 3 Mandatory Side-by-Side Visual Comparison - Baseline Capture", () => {
  test("captures Admin Dashboard, Quotes, and Inventory in Light and Dark modes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Sign in as Admin
    await signIn(page);

    // ==========================================
    // SCREEN 1: ADMIN DASHBOARD (/admin)
    // ==========================================
    // Light Mode
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-theme", "light");
      window.localStorage.setItem("pelecanon-lang", "en");
    });
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.locator("html").evaluate((el) => {
      el.classList.remove("dark");
      el.setAttribute("lang", "en");
      el.setAttribute("dir", "ltr");
    });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_admin_light_before.png"),
      fullPage: true,
    });

    // Dark Mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_admin_dark_before.png"),
      fullPage: true,
    });

    // ==========================================
    // SCREEN 2: QUOTATIONS (/admin/quotes)
    // ==========================================
    // Light Mode
    await page.locator("html").evaluate((el) => el.classList.remove("dark"));
    await page.goto("/admin/quotes");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_quotes_light_before.png"),
      fullPage: true,
    });

    // Dark Mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_quotes_dark_before.png"),
      fullPage: true,
    });

    // ==========================================
    // SCREEN 3: INVENTORY (/admin/inventory)
    // ==========================================
    // Light Mode
    await page.locator("html").evaluate((el) => el.classList.remove("dark"));
    await page.goto("/admin/inventory");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_inventory_light_before.png"),
      fullPage: true,
    });

    // Dark Mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "comparison_inventory_dark_before.png"),
      fullPage: true,
    });
  });
});
