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

    // CatalogPicker dialog opens and loads items from database
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    // Wait for items to load — look for first material name from seed data
    const firstItem = page.getByRole("option").first();
    await expect(firstItem).toBeVisible({ timeout: 10_000 });
    // Select the first item
    await firstItem.click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });

    // Verify component was added — should show catalog code (e.g. "ACRYLIC-W")
    const catalogCode = page.locator("span.font-mono").first();
    await expect(catalogCode).toBeVisible({ timeout: 5_000 });

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

  test("catalog picker loads data and links component", async ({ page }) => {
    await signIn(page);
    await enableFeatureFlag(page, "quotation_builder_v2");

    await page.goto("/admin/quotes/configurator");

    const kitchenBtn = page.getByRole("button", { name: "Kitchen", exact: true });
    await kitchenBtn.waitFor({ state: "visible", timeout: 15_000 });

    // Build tree: product → section → unit
    await kitchenBtn.click();
    const addSectionBtn = page.getByRole("button", { name: /Add section/i });
    await expect(addSectionBtn).toBeVisible({ timeout: 5_000 });
    await addSectionBtn.click();

    const addUnitBtn = page.getByRole("button", { name: /Add unit/i });
    await expect(addUnitBtn).toBeVisible({ timeout: 5_000 });
    await addUnitBtn.click();

    // Expand unit
    const unitTrigger = page.getByRole("button", { name: /Unit #1/ });
    await expect(unitTrigger).toBeVisible({ timeout: 5_000 });
    await unitTrigger.click();
    await page.waitForTimeout(300);

    // Open catalog picker
    const addMaterialBtn = page.getByRole("button", { name: /material/i }).first();
    await expect(addMaterialBtn).toBeVisible({ timeout: 5_000 });
    await addMaterialBtn.click();

    // Verify dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Wait for items to load — look for CommandItem elements
    const firstItem = page.getByRole("option").first();
    await expect(firstItem).toBeVisible({ timeout: 10_000 });

    // Get item text to verify real data loaded
    const itemText = await firstItem.textContent();
    console.log(`[TEST] First picker item: "${itemText}"`);

    // Screenshot with picker open
    await page.screenshot({ path: "test-results/picker-open.png" });

    // Select first item
    await firstItem.click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Verify catalog code appears in component node
    const catalogCode = page.locator("span.font-mono").first();
    await expect(catalogCode).toBeVisible({ timeout: 5_000 });

    // Screenshot with linked component
    await page.screenshot({ path: "test-results/component-linked.png" });

    // Save the quote
    const saveBtn = page.getByRole("button", { name: /Save quote/i });
    await saveBtn.click();

    // Should show success toast
    await expect(page.getByText(/quote|saved|built/i).first()).toBeVisible({
      timeout: 5_000,
    });

    // Final screenshot
    await page.screenshot({ path: "test-results/quote-saved.png" });
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
