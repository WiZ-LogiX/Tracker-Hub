import { test, expect, signIn, enableFeatureFlag } from "./fixtures/auth";

test.describe("Quote Builder — v2 TreeConfigurator", () => {
  test("builds a hierarchical quote: product → section → unit → component → save", async ({
    page,
  }) => {
    await signIn(page);
    await enableFeatureFlag(page, "quotation_builder_v2");

    await page.goto("/admin/quotes/configurator");

    const kitchenBtn = page.getByRole("button", { name: "Kitchen", exact: true });
    await kitchenBtn.waitFor({ state: "visible", timeout: 15_000 });

    // ── 1. Add a product (starts OPEN by default) ─────────────────────
    await kitchenBtn.click();
    await expect(page.getByText("No products yet")).not.toBeVisible();

    // "Add section" is visible immediately because product starts open
    const addSectionBtn = page.getByRole("button", { name: /Add section/i });
    await expect(addSectionBtn).toBeVisible({ timeout: 5_000 });

    // ── 2. Add a section (starts OPEN by default) ─────────────────────
    await addSectionBtn.click();

    // "Add unit" is visible immediately because section starts open
    const addUnitBtn = page.getByRole("button", { name: /Add unit/i });
    await expect(addUnitBtn).toBeVisible({ timeout: 5_000 });

    // ── 3. Add a unit (starts CLOSED — need to expand) ────────────────
    await addUnitBtn.click();

    // Unit appears — labeled "Unit #1" with "0 components" badge
    // It's collapsed by default (open=false), click its trigger to expand
    const unitTrigger = page.getByRole("button", { name: /Unit #1/ });
    await expect(unitTrigger).toBeVisible({ timeout: 5_000 });
    await unitTrigger.click();
    await page.waitForTimeout(300);

    // "Material" add button should be visible after expanding
    const addMaterialBtn = page.getByRole("button", { name: /material/i }).first();
    await expect(addMaterialBtn).toBeVisible({ timeout: 5_000 });
    await addMaterialBtn.click();
    await page.waitForTimeout(300);

    // ── 4. Save the quote ─────────────────────────────────────────────
    const saveBtn = page.getByRole("button", { name: /Save quote/i });
    await saveBtn.click();

    // Should show a success toast
    await expect(page.getByText(/quote|saved|built/i).first()).toBeVisible({
      timeout: 5_000,
    });

    // ── 5. Verify tree structure is still visible ─────────────────────
    await expect(addSectionBtn).toBeVisible();
  });

  test("validates empty section blocks save", async ({ page }) => {
    await signIn(page);
    await enableFeatureFlag(page, "quotation_builder_v2");

    await page.goto("/admin/quotes/configurator");

    const kitchenBtn = page.getByRole("button", { name: "Kitchen", exact: true });
    await kitchenBtn.waitFor({ state: "visible", timeout: 15_000 });

    // Add product (starts open)
    await kitchenBtn.click();

    // Add section (starts open)
    const addSectionBtn = page.getByRole("button", { name: /Add section/i });
    await expect(addSectionBtn).toBeVisible({ timeout: 5_000 });
    await addSectionBtn.click();

    // Section exists but has no units — labeled "Section #1" with "0 units" + "Empty" badge
    await expect(page.getByText("Section #1").first()).toBeVisible();

    // Try to save without adding any units to the section
    const saveBtn = page.getByRole("button", { name: /Save quote/i });
    await saveBtn.click();

    // Should show a validation error toast about empty section
    await expect(
      page.getByText(/empty|no units|required|validation/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
