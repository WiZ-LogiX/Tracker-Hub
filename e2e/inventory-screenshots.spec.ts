import { test, signIn } from "./fixtures/auth";

test.describe("Inventory Visual Artifacts", () => {
  test("Capture clean screenshots for inventory optimization report", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Raw Materials - Light Mode
    await page.goto("/admin/inventory?tab=materials");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/inventory_raw_materials_light.png",
    });

    // 2. Raw Materials - Dark Mode
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/inventory_raw_materials_dark.png",
    });

    // 3. Accessories & Hardware - Dark Mode
    await page.goto("/admin/inventory?tab=hardware");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/inventory_hardware_dark.png",
    });

    // 4. Accessories & Hardware - Light Mode
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/inventory_hardware_light.png",
    });
  });
});
