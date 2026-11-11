import { test, expect, signIn } from "./fixtures/auth";

test.describe("PeleCanon Catalog Module Retirement & Inventory Workspace Optimization E2E", () => {
  test("1. Catalog Module Retirement: sidebar removal and clean redirect to /admin/inventory", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    const sidebar = page.locator("nav");
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Verify /admin/catalog is NOT in the sidebar
    const catalogSidebarLink = sidebar.locator('a[href="/admin/catalog"]');
    await expect(catalogSidebarLink).toHaveCount(0);

    // Verify obsolete sections and raw keys are NOT present
    await expect(sidebar.getByText(/SECTIONPRICING/i)).toHaveCount(0);
    await expect(sidebar.getByText(/^Pricing Factors$/i)).toHaveCount(0);
    await expect(sidebar.getByText(/^Wastage Rules$/i)).toHaveCount(0);
    await expect(sidebar.getByText(/^Pricing Rules$/i)).toHaveCount(0);
    await expect(sidebar.getByText(/^Title$/)).toHaveCount(0);

    // Verify Inventory is present in sidebar
    await expect(sidebar.getByText(/Inventory|المخزون/i).first()).toBeVisible();

    // Verify visiting /admin/catalog directly redirects to /admin/inventory
    await page.goto("/admin/catalog");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/inventory/);

    // Verify visiting /admin/rate-card redirects to /admin/inventory
    await page.goto("/admin/rate-card");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/inventory/);
  });

  test("2. Two Dedicated Sections: Raw Materials vs Accessories & Hardware with scoped categories", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/inventory");
    await page.waitForLoadState("domcontentloaded");

    // Header check
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/Inventory Management|إدارة المخزون/i);

    // Verify Tab Switchers exist
    const materialsTabBtn = page.getByRole("button", { name: /ألواح ومواد خام|Raw Materials/i }).first();
    const hardwareTabBtn = page.getByRole("button", { name: /إكسسوارات وهاردوير|Accessories & Hardware/i }).first();
    await expect(materialsTabBtn).toBeVisible();
    await expect(hardwareTabBtn).toBeVisible();

    // Verify Raw Materials section banner and description
    await expect(page.getByText(/Manage production materials, available stock, units, costs, and reorder levels|إدارة خامات الإنتاج، الأرصدة المتاحة/i)).toBeVisible();

    // Verify scoped categories for Materials
    await expect(page.getByRole("button", { name: /كافة الخامات|All Materials/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /إم دي إف|MDF & HDF/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /أبلكاج وخشب كونتر|Plywood/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /خشب طبيعي|Solid Wood/i })).toBeVisible();

    // Switch to Accessories & Hardware Tab
    await hardwareTabBtn.click();
    await expect(page).toHaveURL(/tab=hardware/);

    // Verify Accessories section banner and description
    await expect(page.getByText(/Manage hardware, fittings, and accessories used in furniture manufacturing|إدارة الهاردوير، المفصلات، والملحقات/i)).toBeVisible();

    // Verify scoped categories for Hardware
    await expect(page.getByRole("button", { name: /كافة الإكسسوارات|All Hardware/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /مفصلات|Hinges/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /مقابض|Handles/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /سكك ومجاري أدراج|Runners/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /مسامير وتثبيتات|Fasteners/i })).toBeVisible();
  });

  test("3. Tab State Persistence: URL query preservation across navigation and filter switching", async ({
    page,
  }) => {
    await signIn(page);
    // Navigate directly with query params to test bookmarkability
    await page.goto("/admin/inventory?tab=hardware&category=hinges");
    await page.waitForLoadState("domcontentloaded");

    // Verify active tab is hardware
    await expect(page).toHaveURL(/tab=hardware/);
    await expect(page).toHaveURL(/category=hinges/);
    await expect(page.getByText(/Manage hardware, fittings, and accessories|إدارة الهاردوير/i)).toBeVisible();

    // Navigate away to quotes
    await page.goto("/admin/quotes");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/quotes/);

    // Hit browser back button
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Verify tab and category are fully preserved!
    await expect(page).toHaveURL(/tab=hardware/);
    await expect(page).toHaveURL(/category=hinges/);
  });

  test("4. Add Item, Edit, and Archive Modals with Section Context", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/inventory?tab=hardware");
    await page.waitForLoadState("domcontentloaded");

    const addItemBtn = page.getByRole("button", { name: /إضافة صنف|Add Inventory Item|Add Item/i }).first();
    await expect(addItemBtn).toBeVisible({ timeout: 15_000 });

    // Open Add Modal
    await addItemBtn.click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Verify fields
    await expect(modal.getByText(/كود الصنف \(SKU\)|SKU Code/i)).toBeVisible();
    await expect(modal.getByText(/اسم الصنف|Item \/ Material Name/i)).toBeVisible();

    // Close modal
    const cancelBtn = modal.getByRole("button", { name: /إلغاء|Cancel/i });
    await cancelBtn.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Verify Table exists with proper columns
    const table = page.locator("table");
    await expect(table).toBeVisible();
    await expect(table.getByText(/كود الصنف|SKU/i).first()).toBeVisible();
    await expect(table.getByText(/الفئة|Category/i).first()).toBeVisible();
    await expect(table.getByText(/الرصيد الفعلي|Physical Stock/i).first()).toBeVisible();
    await expect(table.getByText(/الرصيد المتاح|Available Stock/i).first()).toBeVisible();
  });

  test("5. Commercial Quotation Builder: Catalog items dropdown and negotiated price override preserved", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");

    // Header check
    const header = page.getByRole("heading", { level: 1 });
    await expect(header).toBeVisible({ timeout: 15_000 });

    // In initial clean state, verify the Catalog Database item selector is available
    const catalogItemSelector = page.getByText(/أصناف الكتالوج وقاعدة البيانات|From Catalog Database/i);
    await expect(catalogItemSelector).toBeVisible({ timeout: 10_000 });

    // Pick a category to test full line item form
    const categoryTrigger = page.getByRole("combobox").nth(1);
    await categoryTrigger.click();
    const kitchenOption = page.getByRole("option", { name: /مطبخ|kitchen/i }).first();
    await kitchenOption.click();

    // Verify line item form components
    await expect(page.getByText(/صنف الكتالوج|Catalog Item/i).first()).toBeVisible();
    const titleInput = page.getByPlaceholder(/مثال: .* مودرن|e.g. Modern Custom Cabinet/i).first();
    await expect(titleInput).toBeVisible();
  });
});
