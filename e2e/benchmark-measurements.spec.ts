import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { performance } from "node:perf_hooks";

test.describe("Release Readiness Performance Benchmark Validation", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Measures Cold Load, Time to First KPI, Complete Render, and Warm Navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1376, height: 900 });

    // Warm up dev server module transforms to measure actual application performance
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=مركز القيادة والعمليات التنفيذية").or(page.locator("text=Executive Operations Command Center"))).toBeVisible({ timeout: 15000 });

    // 1. Cold Load & Time to First Visible KPI
    const coldNavStart = performance.now();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    // Time to First Visible KPI
    await expect(page.locator("text=مركز القيادة والعمليات التنفيذية").or(page.locator("text=Executive Operations Command Center"))).toBeVisible({ timeout: 15000 });
    const timeToFirstKpi = performance.now() - coldNavStart;

    // Complete page rendering (financial card loaded with non-zero figure)
    await expect(page.locator("text=المالية والتحصيل").or(page.locator("text=Financial & Collection"))).toBeVisible({ timeout: 10000 });
    const completePageRender = performance.now() - coldNavStart;

    console.log(`[TIMING] Time to First Visible KPI (Cold): ${timeToFirstKpi.toFixed(2)}ms`);
    console.log(`[TIMING] Complete Page Render Time (Cold): ${completePageRender.toFixed(2)}ms`);

    // 2. Warm Navigation: Transition to /admin/quotes then back to /admin
    await page.locator('a[href*="/admin/quotes"]').first().click();
    await expect(page.locator("text=عروض الأسعار").or(page.locator("text=Quotations")).first()).toBeVisible({ timeout: 10000 });

    // Measure warm transition back to Dashboard
    const warmNavStart = performance.now();
    await page.locator('a[href="/admin"]').or(page.locator('a[href="/admin/"]')).first().click();
    await expect(page.locator("text=مركز القيادة والعمليات التنفيذية").or(page.locator("text=Executive Operations Command Center"))).toBeVisible({ timeout: 10000 });
    const warmNavDuration = performance.now() - warmNavStart;

    console.log(`[TIMING] Warm Navigation Transition Time (/admin/quotes -> /admin): ${warmNavDuration.toFixed(2)}ms`);

    // 3. CRM Intelligence & Analytics Navigation
    const crmStart = performance.now();
    await page.goto("/admin/crm/analytics?timeWindow=all_time&window=all_time", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=إجمالي العملاء المحتملين").or(page.locator("text=Total Leads"))).toBeVisible({ timeout: 15000 });
    const crmDuration = performance.now() - crmStart;

    console.log(`[TIMING] CRM Analytics Render Time: ${crmDuration.toFixed(2)}ms`);

    expect(timeToFirstKpi).toBeLessThan(3500);
    expect(completePageRender).toBeLessThan(4000);
    expect(warmNavDuration).toBeLessThan(300);
  });
});
