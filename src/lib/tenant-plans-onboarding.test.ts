import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  appUsers,
  tenantMembers,
  categories,
  quotes,
  customers,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getTenantUsageSummary,
  assertActiveSeatAvailable,
  assertMonthlyQuoteQuota,
} from "@/lib/tenant-plans.server";
import { executeWorkshopOnboarding } from "@/lib/onboarding.server";
import { TENANT_PLANS, resolvePlanConfig } from "@/lib/tenant-plans";

describe("Sprint 5 — SaaS Tenant Onboarding & Subscription Plan Enforcement Suite", () => {
  const TEST_FREE_TENANT_ID = "00000000-0000-0000-0000-000000000050";
  const TEST_PRO_TENANT_ID = "00000000-0000-0000-0000-000000000051";
  const TEST_ENT_TENANT_ID = "00000000-0000-0000-0000-000000000052";

  let createdOnboardingTenantId: string | null = null;
  let createdOnboardingUserId: string | null = null;

  beforeAll(async () => {
    // 1. Seed test tenants across Free, Pro, and Enterprise tiers
    await db
      .insert(tenants)
      .values([
        {
          id: TEST_FREE_TENANT_ID,
          name: "Test Free Workshop",
          slug: `test-free-ws-${Date.now()}`,
          plan: "free",
          status: "active",
        },
        {
          id: TEST_PRO_TENANT_ID,
          name: "Test Pro Atelier",
          slug: `test-pro-at-${Date.now()}`,
          plan: "pro",
          status: "active",
        },
        {
          id: TEST_ENT_TENANT_ID,
          name: "Test Enterprise Factory",
          slug: `test-ent-fac-${Date.now()}`,
          plan: "enterprise",
          status: "active",
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    try {
      if (createdOnboardingTenantId) {
        await db.delete(categories).where(eq(categories.tenantId, createdOnboardingTenantId));
        await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, createdOnboardingTenantId));
        await db.delete(appUsers).where(eq(appUsers.tenantId, createdOnboardingTenantId));
        await db.delete(tenants).where(eq(tenants.id, createdOnboardingTenantId));
      }
      await db.delete(quotes).where(eq(quotes.tenantId, TEST_FREE_TENANT_ID));
      await db.delete(customers).where(eq(customers.tenantId, TEST_FREE_TENANT_ID));
      await db.delete(appUsers).where(eq(appUsers.tenantId, TEST_FREE_TENANT_ID));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, TEST_FREE_TENANT_ID));
      await db.delete(tenants).where(eq(tenants.id, TEST_FREE_TENANT_ID));
      await db.delete(tenants).where(eq(tenants.id, TEST_PRO_TENANT_ID));
      await db.delete(tenants).where(eq(tenants.id, TEST_ENT_TENANT_ID));
    } catch {
      // Non-blocking cleanup
    }
  });

  describe("1. Pure Client-Safe Plan Configuration (resolvePlanConfig)", () => {
    it("resolves plan configs accurately and defaults safely to free", () => {
      expect(resolvePlanConfig("free")).toEqual(TENANT_PLANS.free);
      expect(resolvePlanConfig("Free")).toEqual(TENANT_PLANS.free);
      expect(resolvePlanConfig("pro")).toEqual(TENANT_PLANS.pro);
      expect(resolvePlanConfig("PRO")).toEqual(TENANT_PLANS.pro);
      expect(resolvePlanConfig("enterprise")).toEqual(TENANT_PLANS.enterprise);
      expect(resolvePlanConfig("Enterprise")).toEqual(TENANT_PLANS.enterprise);
      expect(resolvePlanConfig(null)).toEqual(TENANT_PLANS.free);
      expect(resolvePlanConfig("unknown_plan")).toEqual(TENANT_PLANS.free);
    });

    it("verifies quota limits across all tier definitions", () => {
      expect(TENANT_PLANS.free.maxActiveSeats).toBe(3);
      expect(TENANT_PLANS.free.maxMonthlyQuotes).toBe(25);

      expect(TENANT_PLANS.pro.maxActiveSeats).toBe(15);
      expect(TENANT_PLANS.pro.maxMonthlyQuotes).toBeNull(); // Unlimited

      expect(TENANT_PLANS.enterprise.maxActiveSeats).toBeNull(); // Unlimited
      expect(TENANT_PLANS.enterprise.maxMonthlyQuotes).toBeNull(); // Unlimited
    });
  });

  describe("2. Self-Serve Workshop Onboarding (executeWorkshopOnboarding)", () => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testUsername = `onboarding_owner_${uniqueSuffix}`;

    it("provisions a new tenant with Free plan, Owner role, and seeded starter categories", async () => {
      const res = await executeWorkshopOnboarding(db, {
        workshopName: `Artisan Prestige Woodworks ${uniqueSuffix}`,
        ownerName: "Sherif El-Naggar",
        username: testUsername,
        password: "SecretPassword123!",
        phone: "01099887766",
        taxNumber: "998-776-554",
        commercialRegistry: "CR-102938",
        address: "Plot 44, 3rd Industrial Zone, Badr City",
      });

      expect(res.ok).toBe(true);
      expect(res.tenantSlug).toMatch(/artisan-prestige-woodworks/);
      expect(res.username).toBe(testUsername);

      createdOnboardingTenantId = res.tenantId;
      createdOnboardingUserId = res.userId;

      // Verify tenant record
      const [t] = await db.select().from(tenants).where(eq(tenants.id, res.tenantId));
      expect(t).toBeDefined();
      expect(t.plan).toBe("free");
      expect(t.status).toBe("active");
      expect(t.taxNumber).toBe("998-776-554");
      expect(t.commercialRegistry).toBe("CR-102938");

      // Verify app_users record
      const [u] = await db.select().from(appUsers).where(eq(appUsers.id, res.userId));
      expect(u).toBeDefined();
      expect(u.username).toBe(testUsername);
      expect(u.displayName).toBe("Sherif El-Naggar");
      expect(u.status).toBe("active");

      // Verify tenant_members record
      const [m] = await db
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, res.tenantId), eq(tenantMembers.userId, res.userId)));
      expect(m).toBeDefined();
      expect(m.role).toBe("owner");

      // Verify 3 seeded starter categories
      const seededCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.tenantId, res.tenantId));
      expect(seededCategories.length).toBe(3);
      expect(seededCategories.some((c) => c.nameEn === "Custom Kitchens")).toBe(true);
      expect(seededCategories.some((c) => c.nameEn === "Dressing Rooms & Closets")).toBe(true);
    });

    it("strictly rejects duplicate username during onboarding", async () => {
      await expect(
        executeWorkshopOnboarding(db, {
          workshopName: "Duplicate Test Woodworks",
          ownerName: "Another Owner",
          username: testUsername, // already taken
          password: "Password123!",
        }),
      ).rejects.toThrow(/already taken/i);
    });

    it("generates a unique slug when workshop names collide", async () => {
      const res2 = await executeWorkshopOnboarding(db, {
        workshopName: `Artisan Prestige Woodworks ${uniqueSuffix}`, // same workshop name
        ownerName: "Second Owner",
        username: `unique_user_${Date.now()}`,
        password: "Password123!",
      });

      expect(res2.ok).toBe(true);
      // Slug must not collide with the previous one
      expect(res2.tenantSlug).not.toBe(`artisan-prestige-woodworks-${uniqueSuffix}`);

      // Cleanup second tenant
      await db.delete(categories).where(eq(categories.tenantId, res2.tenantId));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, res2.tenantId));
      await db.delete(appUsers).where(eq(appUsers.tenantId, res2.tenantId));
      await db.delete(tenants).where(eq(tenants.id, res2.tenantId));
    });
  });

  describe("3. Active Seat Quota Enforcement (assertActiveSeatAvailable)", () => {
    const userA = "00000000-0000-0000-0000-000000000061";
    const userB = "00000000-0000-0000-0000-000000000062";
    const userC = "00000000-0000-0000-0000-000000000063";

    beforeAll(async () => {
      // Free plan allows up to 3 active seats. Insert 2 active users initially.
      await db.insert(appUsers).values([
        {
          id: userA,
          tenantId: TEST_FREE_TENANT_ID,
          username: `free_user_a_${Date.now()}`,
          displayName: "Free User A",
          status: "active",
        },
        {
          id: userB,
          tenantId: TEST_FREE_TENANT_ID,
          username: `free_user_b_${Date.now()}`,
          displayName: "Free User B",
          status: "active",
        },
      ]);
    });

    it("allows adding 3rd active seat on Free plan (reaches 3/3 cap)", async () => {
      await expect(assertActiveSeatAvailable(db, TEST_FREE_TENANT_ID, 1)).resolves.not.toThrow();

      // Now insert the 3rd active user
      await db.insert(appUsers).values({
        id: userC,
        tenantId: TEST_FREE_TENANT_ID,
        username: `free_user_c_${Date.now()}`,
        displayName: "Free User C",
        status: "active",
      });
    });

    it("strictly blocks adding a 4th active seat on Free plan", async () => {
      await expect(assertActiveSeatAvailable(db, TEST_FREE_TENANT_ID, 1)).rejects.toThrow(
        /Plan seat limit reached: Your current FREE plan allows a maximum of 3 active seat\(s\)/i,
      );
    });

    it("permits adding users after an active user is disabled", async () => {
      // Disable User C (bringing active count back to 2/3)
      await db
        .update(appUsers)
        .set({ status: "disabled" })
        .where(eq(appUsers.id, userC));

      await expect(assertActiveSeatAvailable(db, TEST_FREE_TENANT_ID, 1)).resolves.not.toThrow();

      // Re-enable User C (reaches 3/3 again)
      await db
        .update(appUsers)
        .set({ status: "active" })
        .where(eq(appUsers.id, userC));

      // Attempting to add another seat now fails again
      await expect(assertActiveSeatAvailable(db, TEST_FREE_TENANT_ID, 1)).rejects.toThrow(
        /Plan seat limit reached/i,
      );
    });

    it("allows adding seats on Pro (cap = 15) and Enterprise (unlimited)", async () => {
      await expect(assertActiveSeatAvailable(db, TEST_PRO_TENANT_ID, 10)).resolves.not.toThrow();
      await expect(assertActiveSeatAvailable(db, TEST_ENT_TENANT_ID, 50)).resolves.not.toThrow();
    });
  });

  describe("4. Monthly Quotation Quota Enforcement (assertMonthlyQuoteQuota)", () => {
    let customerId: string;

    beforeAll(async () => {
      const [c] = await db
        .insert(customers)
        .values({
          tenantId: TEST_FREE_TENANT_ID,
          name: "Quota Customer",
          phone: "01000000099",
        })
        .returning();
      customerId = c.id;

      // Free plan allows up to 25 quotes per calendar month.
      // Seed 24 quotes in current month.
      const qPrefix = Date.now().toString().slice(-4);
      const quoteInserts = [];
      for (let i = 1; i <= 24; i++) {
        quoteInserts.push({
          tenantId: TEST_FREE_TENANT_ID,
          customerId,
          quoteNumber: `PLC-QT${qPrefix}-${String(i).padStart(4, "0")}`,
          status: "draft",
          validUntil: "2026-12-31",
          createdAt: new Date(),
        });
      }
      await db.insert(quotes).values(quoteInserts);
    });

    it("allows creating 25th quotation on Free plan (reaches 25/25 cap)", async () => {
      await expect(assertMonthlyQuoteQuota(db, TEST_FREE_TENANT_ID)).resolves.not.toThrow();

      // Insert 25th quote
      await db.insert(quotes).values({
        tenantId: TEST_FREE_TENANT_ID,
        customerId,
        quoteNumber: `PLC-QT25-${Date.now()}`,
        status: "draft",
        validUntil: "2026-12-31",
        createdAt: new Date(),
      });
    });

    it("strictly blocks creating a 26th quotation in the current month on Free plan", async () => {
      await expect(assertMonthlyQuoteQuota(db, TEST_FREE_TENANT_ID)).rejects.toThrow(
        /Monthly quotation quota reached: Your current FREE plan allows up to 25 new quotations/i,
      );
    });

    it("permits unlimited quotes on Pro and Enterprise tiers", async () => {
      await expect(assertMonthlyQuoteQuota(db, TEST_PRO_TENANT_ID)).resolves.not.toThrow();
      await expect(assertMonthlyQuoteQuota(db, TEST_ENT_TENANT_ID)).resolves.not.toThrow();
    });
  });

  describe("5. Tenant Usage Summary Reporting (getTenantUsageSummary)", () => {
    it("reports accurate usage metrics and quota limits for Free tenant", async () => {
      const summary = await getTenantUsageSummary(db, TEST_FREE_TENANT_ID);

      expect(summary.plan).toBe("free");
      expect(summary.activeSeats).toBe(3);
      expect(summary.maxActiveSeats).toBe(3);
      expect(summary.seatsRemaining).toBe(0);

      expect(summary.monthlyQuotes).toBe(25);
      expect(summary.maxMonthlyQuotes).toBe(25);
      expect(summary.quotesRemaining).toBe(0);
    });

    it("reports unlimited indicators for Enterprise tenant", async () => {
      const summary = await getTenantUsageSummary(db, TEST_ENT_TENANT_ID);

      expect(summary.plan).toBe("enterprise");
      expect(summary.maxActiveSeats).toBeNull();
      expect(summary.seatsRemaining).toBeNull();
      expect(summary.maxMonthlyQuotes).toBeNull();
      expect(summary.quotesRemaining).toBeNull();
    });
  });
});
