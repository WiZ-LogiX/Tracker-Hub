import { test as base, type Page } from "@playwright/test";

const ADMIN_USER = process.env.E2E_USERNAME ?? "admin";
const ADMIN_PASS = process.env.E2E_PASSWORD ?? "admin";
export const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";
export const MOCK_TENANT_ID = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
export const MOCK_CUSTOMER_ID = "33333333-3333-3333-3333-333333333331";

export const MOCK_SESSION = {
  access_token: "mock-access-token-admin-session",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  refresh_token: "mock-refresh-token",
  user: {
    id: MOCK_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "admin@pelecanon.local",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: "admin" },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
};

/**
 * Sign in via session injection and route mocking to ensure fast,
 * 100% reliable local browser execution without external network dependency.
 */
export async function signIn(page: Page): Promise<void> {
  // 1. Intercept Supabase Auth endpoints
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(MOCK_SESSION.user),
    });
  });

  // 2. Intercept tenant queries
  await page.route("**/rest/v1/tenants**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-range": "0-0/1",
      },
      body: JSON.stringify({
        id: MOCK_TENANT_ID,
        slug: "pelecanon",
        name: "PeleCanon",
        feature_flags: { quotation_builder_v2: true, pricing_shadow: true },
      }),
    });
  });

  await page.route("**/rest/v1/tenant_members**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-range": "0-0/1",
      },
      body: JSON.stringify([
        {
          tenant_id: MOCK_TENANT_ID,
          role: "owner",
          user_id: MOCK_USER_ID,
        },
      ]),
    });
  });

  await page.route("**/rest/v1/app_users**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-range": "0-0/1",
      },
      body: JSON.stringify({
        id: MOCK_USER_ID,
        username: "admin",
        display_name: "Admin User",
        status: "active",
        tenant_id: MOCK_TENANT_ID,
      }),
    });
  });

  // 3. Intercept customer queries
  await page.route("**/rest/v1/customers**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-range": "0-1/2",
      },
      body: JSON.stringify([
        {
          id: MOCK_CUSTOMER_ID,
          name: "شركة الأهرام للتطوير العقاري",
          phone: "01099887766",
          email: "ahram@example.com",
          tenant_id: MOCK_TENANT_ID,
        },
        {
          id: "33333333-3333-3333-3333-333333333332",
          name: "م. كريم عبد العزيز",
          phone: "01122334455",
          email: "karim@example.com",
          tenant_id: MOCK_TENANT_ID,
        },
      ]),
    });
  });

  // 4. Intercept catalog queries
  await page.route("**/rest/v1/catalog_materials**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-range": "0-0/1",
      },
      body: JSON.stringify([
        {
          id: "mat-1",
          code: "ACRYLIC-W",
          label_i18n_key: "catalog.material.acrylic_white",
          pricing_unit: "m2",
          price_per_unit: 450,
          default_wastage_pct: 10,
        },
      ]),
    });
  });

  // 5. Inject session into localStorage before navigation
  await page.addInitScript(
    ({ session, userKey, sessionKey }) => {
      window.localStorage.setItem(sessionKey, JSON.stringify(session));
      window.localStorage.setItem(userKey, "admin");
    },
    {
      session: MOCK_SESSION,
      userKey: "pelecanon:username",
      sessionKey: "pelecanon-auth-token",
    },
  );

  await page.goto("/admin");
  await page.waitForLoadState("domcontentloaded");
}

export async function enableFeatureFlag(page: Page, flag: string): Promise<void> {
  await page.route("**/rest/v1/tenants**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-range": "0-0/1",
      },
      body: JSON.stringify({
        id: MOCK_TENANT_ID,
        slug: "pelecanon",
        name: "PeleCanon",
        feature_flags: { [flag]: true, quotation_builder_v2: true },
      }),
    });
  });
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
