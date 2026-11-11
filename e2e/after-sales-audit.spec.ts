import { test, expect, signIn } from "./fixtures/auth";

test.describe("After sales interaction audit", () => {
  test("test after sales interactive flow", async ({ page }) => {
    const errors: any[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push({ type: "console", text: msg.text() });
        console.log("[AFTER-SALES CONSOLE ERROR]:", msg.text());
      }
    });

    page.on("pageerror", (err) => {
      errors.push({ type: "pageerror", text: err.message });
      console.log("[AFTER-SALES PAGE ERROR]:", err.message);
    });

    page.on("response", (res) => {
      if (res.status() >= 400) {
        errors.push({ type: "response", status: res.status(), url: res.url() });
        console.log(`[AFTER-SALES BAD RESPONSE ${res.status()}]:`, res.url());
      }
    });

    await signIn(page);
    await page.goto("/admin/crm/after-sales");
    await page.waitForLoadState("networkidle");

    // Click tabs
    const complaintsTab = page.getByRole("tab", { name: /شكاوى|complaint/i }).first();
    await complaintsTab.click();
    await page.waitForTimeout(500);

    const warrantyTab = page.getByRole("tab", { name: /ضمان|warranty/i }).first();
    await warrantyTab.click();
    await page.waitForTimeout(500);

    // Click new case button
    const newCaseBtn = page.getByRole("button", { name: /تسجيل تذكرة جديدة|new service case|new case/i }).first();
    await newCaseBtn.click();
    await page.waitForTimeout(500);

    // Check if dialog is visible
    const modalDialog = page.getByRole("dialog");
    await expect(modalDialog).toBeVisible();

    console.log("Captured errors during after-sales interactions:", errors);
  });
});
