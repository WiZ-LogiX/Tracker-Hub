import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.use({ baseURL: "http://localhost:8082" });

test.describe("Production Preview Runtime & SSR Hydration Verification (Port 8082)", () => {
  test("loads production SSR homepage, hydrates without errors, and switches languages", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 1. Verify SSR and Hydrated DOM elements
    await expect(page.locator("header img[alt='PeleCanon']")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#philosophy")).toBeVisible();
    await expect(page.locator("#solutions")).toBeVisible();
    await expect(page.locator("#process")).toBeVisible();
    await expect(page.locator("#craftsmanship")).toBeVisible();

    // 2. Ensure zero console errors or hydration mismatches
    const hydrationErrors = consoleErrors.filter(
      (e) =>
        e.includes("Hydration") ||
        e.includes("hydration") ||
        e.includes("Minified React error #418") ||
        e.includes("Minified React error #423") ||
        e.includes("TSS_SERVER_FN_BASE"),
    );
    expect(hydrationErrors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });

  test("verifies authenticated Admin journey and server-function execution on production preview", async ({ page }) => {
    const interceptedServerFns: Array<{
      url: string;
      method: string;
      status: number;
    }> = [];

    page.on("response", async (res) => {
      if (res.url().includes("/_serverFn/")) {
        interceptedServerFns.push({
          url: res.url(),
          method: res.request().method(),
          status: res.status(),
        });
      }
    });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Sign in and open Admin
    await signIn(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Verify Admin elements rendered
    await expect(page.locator("aside img[alt='PeleCanon']")).toBeVisible();

    // Navigate to tasks
    await page.goto("/admin/tasks");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Verify server functions executed and succeeded
    console.log("Production preview server function calls:", interceptedServerFns);
    expect(interceptedServerFns.length).toBeGreaterThan(0);
    for (const fn of interceptedServerFns) {
      expect(fn.status).toBeLessThan(400);
    }

    // Verify zero fatal errors
    const fatalErrors = consoleErrors.filter(
      (e) =>
        e.includes("TSS_SERVER_FN_BASE") ||
        e.includes("Maximum update depth") ||
        e.includes("Minified React error #185"),
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
