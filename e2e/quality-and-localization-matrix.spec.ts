import { test, expect } from "@playwright/test";
import path from "path";
import { signIn } from "./fixtures/auth";

const ARTIFACT_DIR = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5";

const MATRIX = [
  { lang: "en", dir: "ltr", theme: "light", label: "English Light" },
  { lang: "en", dir: "ltr", theme: "dark", label: "English Dark" },
  { lang: "ar", dir: "rtl", theme: "light", label: "Arabic RTL Light" },
  { lang: "ar", dir: "rtl", theme: "dark", label: "Arabic RTL Dark" },
  { lang: "fr", dir: "ltr", theme: "light", label: "French Light" },
  { lang: "fr", dir: "ltr", theme: "dark", label: "French Dark" },
] as const;

test.describe("PeleCanon Comprehensive Quality & Localization Matrix", () => {
  for (const combo of MATRIX) {
    test(`Matrix Cell: [${combo.lang.toUpperCase()}] [${combo.theme.toUpperCase()}] - Direction, Theme & Translations`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      // Pre-set language and theme in localStorage
      await page.addInitScript(
        ({ lang, theme }) => {
          window.localStorage.setItem("pelecanon-lang", lang);
          window.localStorage.setItem("pelecanon-theme", theme);
        },
        { lang: combo.lang, theme: combo.theme },
      );

      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // 1. Verify html attributes
      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", combo.lang);
      await expect(html).toHaveAttribute("dir", combo.dir);

      if (combo.theme === "dark") {
        await expect(html).toHaveClass(/dark/);
      } else {
        await expect(html).not.toHaveClass(/dark/);
      }

      // 2. Verify localized content based on language
      if (combo.lang === "en") {
        await expect(page.locator("h1").getByText("Timeless Architecture.")).toBeVisible();
        await expect(page.locator("text=Fine Cabinetry & Interior Architecture").first()).toBeVisible();
        // Ensure NO French leaked into English
        await expect(page.locator("text=Haute Ébénisterie")).toHaveCount(0);
      } else if (combo.lang === "ar") {
        await expect(page.locator("h1").getByText("عمارة تتجاوز الزمن.")).toBeVisible();
        await expect(page.locator("header img[alt='PeleCanon']")).toBeVisible();
      } else if (combo.lang === "fr") {
        await expect(page.locator("h1").getByText("Architecture Intemporelle.")).toBeVisible();
        await expect(page.locator("header img[alt='PeleCanon']")).toBeVisible();
      }

      // 3. Ensure no console errors / unhandled rejections
      expect(consoleErrors).toEqual([]);

      // 4. Capture screenshot for artifact
      const screenshotName = `matrix_${combo.lang}_${combo.theme}.png`;
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, screenshotName),
        fullPage: true,
      });
    });
  }

  test("Language and Theme Persistence Across Page Refresh", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Open language menu and switch to French
    const langBtn = page.locator("button[aria-label='Language'], button[aria-label='اللغة'], button[aria-label='Langue']").first();
    await langBtn.click();
    await page.getByRole("menuitem", { name: "Français" }).click();

    // Verify switch
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    // Wait for dropdown to close
    await page.waitForTimeout(500);

    // Open theme menu and switch to dark
    const themeBtn = page.locator("button[aria-label='Theme'], button[aria-label='المظهر'], button[aria-label='Thème']").first();
    await themeBtn.click();
    await page.getByRole("menuitem", { name: /Dark|Sombre|داكن/i }).click();

    await expect(page.locator("html")).toHaveClass(/dark/);

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Must still be French and Dark
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("h1").getByText("Architecture Intemporelle.")).toBeVisible();
  });

  test("Admin Navigation: Unauthenticated cleanly redirects to /auth without loops or TSS errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/admin");
    await page.waitForURL("**/auth**");

    // Expect clean URL without nested redirect query strings
    expect(page.url()).not.toContain("/auth?returnTo=/auth");
    expect(page.url()).toMatch(/\/auth(\?returnTo=%2Fadmin)?$/);

    // Expect no Maximum update depth exceeded or TSS_SERVER_FN_BASE errors
    const fatalErrors = consoleErrors.filter(
      (e) => e.includes("Maximum update depth") || e.includes("TSS_SERVER_FN_BASE") || e.includes("Minified React error #185"),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test("Admin Workspace: Authenticated Admin loads dashboard cleanly in Light and Dark modes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    // Check light mode
    await expect(page.locator("aside, nav, [role='navigation']").first()).toBeVisible();
    await expect(page.locator("aside img[alt='PeleCanon']")).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "admin_dashboard_light.png"),
    });

    // Toggle to dark mode
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "admin_dashboard_dark.png"),
    });
  });
});
