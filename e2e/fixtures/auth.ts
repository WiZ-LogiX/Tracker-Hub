import { test as base, type Page } from "@playwright/test";

const ADMIN_USER = process.env.E2E_USERNAME ?? "admin";
const ADMIN_PASS = process.env.E2E_PASSWORD ?? "admin";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://zgumsjwukevptbwbglrk.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_9ZL2_7dntX1ZQBAcCZyhPw_iGXgMqTU";

/**
 * Sign in via the actual auth page form.
 * Waits for bootstrapping to finish, fills username/password, submits, and
 * waits for redirect to /admin.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/auth");

  // Wait for the form to be ready (bootstrapping finishes → button becomes enabled)
  const submitBtn = page.getByRole("button", { name: /sign|login|دخول|تسجيل/i });
  await submitBtn.waitFor({ state: "visible", timeout: 30_000 });
  await expectPoll(
    () => submitBtn.isDisabled(),
    (disabled) => disabled === false,
    { timeout: 30_000 },
  );

  // Fill form
  await page.getByPlaceholder("admin").fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);

  // Submit
  await submitBtn.click();

  // Wait for navigation away from /auth
  await page.waitForURL("**/admin**", { timeout: 30_000 });
}

/**
 * Enable a feature flag for the current tenant by intercepting Supabase
 * REST requests that read feature_flags from tenants.
 * Always returns a mock response — never hits the real server for this query.
 *
 * Must be called AFTER signIn and BEFORE navigating to the page that checks the flag.
 */
export async function enableFeatureFlag(page: Page, flag: string): Promise<void> {
  await page.route("**/rest/v1/tenants**", async (route) => {
    const url = route.request().url();

    // Only intercept GET requests that SELECT feature_flags
    if (
      route.request().method() === "GET" &&
      url.includes("feature_flags")
    ) {
      const idMatch = url.match(/id=eq\.([a-f0-9-]+)/);
      const tenantId = idMatch?.[1] ?? "2bf7cd99-d567-42d3-b5fc-22cc40654293";

      // Return a valid PostgREST-style response
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-range": "0-0/1",
        },
        body: JSON.stringify({ id: tenantId, feature_flags: { [flag]: true } }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Poll until predicate returns true (or timeout). */
async function expectPoll<T>(
  fn: () => T | Promise<T>,
  predicate: (v: T) => boolean,
  opts: { timeout: number; interval?: number },
): Promise<void> {
  const start = Date.now();
  const interval = opts.interval ?? 250;
  while (Date.now() - start < opts.timeout) {
    const val = await fn();
    if (predicate(val)) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`expectPoll timed out after ${opts.timeout}ms`);
}

/**
 * Authenticated test fixture — signs in before each test.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
