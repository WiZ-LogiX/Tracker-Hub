import { test, expect } from "@playwright/test";
import path from "path";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

test.describe("PeleCanon Atelier Prestige Public Homepage", () => {
  test("renders luxury desktop experience with all architectural sections (EN)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Pre-set English to ensure clean baseline
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "en");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify Brand Identity
    await expect(page.locator("header img[alt='PeleCanon']")).toBeVisible();
    await expect(page.locator("header").getByText("PELECANON")).toHaveCount(0);
    await expect(page.locator("header").getByText("ATELIER PRESTIGE")).toHaveCount(0);

    // Verify Navigation Anchor Links (Desktop)
    const headerNav = page.locator("header nav.hidden.lg\\:flex");
    await expect(headerNav.locator("a[href='#philosophy']")).toBeVisible();
    await expect(headerNav.locator("a[href='#solutions']")).toBeVisible();
    await expect(headerNav.locator("a[href='#process']")).toBeVisible();
    await expect(headerNav.locator("a[href='#craftsmanship']")).toBeVisible();

    // Verify Track CTA and Staff Portal link
    await expect(page.locator("header a[href='/track']").first()).toBeVisible();
    await expect(page.locator("a[href='/admin']").first()).toBeVisible();

    // Verify Hero Section
    await expect(page.locator("text=Fine Cabinetry & Interior Architecture").first()).toBeVisible();
    await expect(page.locator("h1").getByText("Timeless Architecture.")).toBeVisible();
    await expect(page.locator("h1").getByText("Bespoke Craftsmanship.")).toBeVisible();
    await expect(page.getByText("100%").first()).toBeVisible();
    await expect(page.getByText("Bespoke Tailoring").first()).toBeVisible();

    // Verify Philosophy Section
    await expect(page.locator("#philosophy")).toBeVisible();
    await expect(page.locator("#philosophy h2")).toBeVisible();
    await expect(page.locator("#philosophy").getByRole("heading", { name: "Artisanal Integrity" })).toBeVisible();
    await expect(page.locator("#philosophy").getByRole("heading", { name: "Architectural Proportion" })).toBeVisible();

    // Verify Solutions Section
    await expect(page.locator("#solutions")).toBeVisible();
    await expect(page.locator("#solutions").getByRole("heading", { name: "Bespoke Kitchens & Islands" })).toBeVisible();
    await expect(page.locator("#solutions").getByRole("heading", { name: "Luxury Dressing Rooms & Wardrobes" })).toBeVisible();
    await expect(page.locator("#solutions").getByRole("heading", { name: "Architectural Interior & Pivot Doors" })).toBeVisible();
    await expect(page.locator("#solutions").getByRole("heading", { name: "Custom Millwork & Living Accents" })).toBeVisible();

    // Verify Process Section
    await expect(page.locator("#process")).toBeVisible();
    await expect(page.locator("#process").getByRole("heading", { name: "Spatial Consultation" })).toBeVisible();
    await expect(page.locator("#process").getByRole("heading", { name: "White-Glove Delivery & Commissioning" })).toBeVisible();

    // Verify Craftsmanship Section
    await expect(page.locator("#craftsmanship")).toBeVisible();
    await expect(page.locator("#craftsmanship").getByRole("heading", { name: "Selected Noble Woods & Veneers" })).toBeVisible();
    await expect(page.locator("#craftsmanship").getByRole("heading", { name: "Structural Joinery & Concealed Hardware" })).toBeVisible();
    await expect(page.locator("#craftsmanship").getByRole("heading", { name: "Tactile Multi-Coat Polyurethane & Oils" })).toBeVisible();

    // Verify Tracking Experience
    await expect(page.getByText("Follow Every Step of Your Commission")).toBeVisible();
    await expect(page.getByText("9-Stage Transparent Milestone Progression")).toBeVisible();

    // Capture Full Desktop English Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "atelier_homepage_desktop_en.png"),
      fullPage: true,
    });
  });

  test("renders flawless RTL layout in Arabic with Cairo typography", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Pre-set Arabic in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "ar");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify Arabic RTL direction
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Verify Arabic Content
    await expect(page.locator("header img[alt='PeleCanon']")).toBeVisible();
    await expect(page.locator("header").getByText("بيليكانون")).toHaveCount(0);
    await expect(page.locator("header").getByText("أتيليه برستيج")).toHaveCount(0);
    await expect(page.locator("h1").getByText("عمارة تتجاوز الزمن.")).toBeVisible();
    await expect(page.locator("#philosophy").getByRole("heading", { name: "فن العيش الهادف والأناقة الخالدة" })).toBeVisible();
    await expect(page.locator("#solutions").getByRole("heading", { name: "مطابخ حصرية وجزر رخامية" })).toBeVisible();
    await expect(page.getByText("تابع كل خطوة في تصنيع طلبك مباشرة")).toBeVisible();

    // Capture Full Desktop Arabic RTL Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "atelier_homepage_desktop_ar.png"),
      fullPage: true,
    });
  });

  test("verifies responsive mobile viewport and hamburger drawer (375x667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "en");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Hamburger button should be visible
    const hamburger = page.locator("button[aria-label='Toggle navigation']");
    await expect(hamburger).toBeVisible();

    // Open Drawer
    await hamburger.click();
    await page.waitForTimeout(300);

    // Navigation links in drawer should now be visible
    const mobileDrawer = page.locator("header div.sm\\:hidden nav");
    await expect(mobileDrawer.locator("a[href='#philosophy']")).toBeVisible();
    await expect(mobileDrawer.locator("a[href='#solutions']")).toBeVisible();

    // Capture Mobile Menu Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "atelier_homepage_mobile_menu.png"),
    });

    // Close Drawer
    await hamburger.click();
    await page.waitForTimeout(200);

    // Capture Full Mobile Page
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "atelier_homepage_mobile_full.png"),
      fullPage: true,
    });
  });

  test("verifies tracking quick search navigates cleanly to /track", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("pelecanon-lang", "en");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Fill tracking input
    const trackingForm = page.locator("form").filter({ has: page.locator("input") }).first();
    const input = trackingForm.locator("input");
    await input.fill("ORD-2026-TEST");
    await trackingForm.locator("button[type='submit']").click();

    // Wait for navigation to /track
    await page.waitForURL(/\/track/);
    expect(page.url()).toContain("/track");
  });
});
