import { chromium } from "playwright";
import { performance } from "perf_hooks";
import { fetchExecutiveDashboardData } from "../src/lib/dashboard.server";
import { signIn } from "../e2e/fixtures/auth";

const testTenantId = "2bf7cd99-d567-42d3-b5fc-22cc40654293";

async function runBenchmarks() {
  console.log("================ PELECANON COMPREHENSIVE PERFORMANCE BENCHMARK ================\n");

  // 1. Raw Database Query Execution Time (10 iterations)
  console.log("--- 1. Database Execution Time (fetchExecutiveDashboardData) ---");
  const dbTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    await fetchExecutiveDashboardData(testTenantId);
    const elapsed = performance.now() - t0;
    dbTimes.push(elapsed);
  }
  const avgDb = dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length;
  const minDb = Math.min(...dbTimes);
  const maxDb = Math.max(...dbTimes);
  console.log(`Runs: ${dbTimes.map(t => t.toFixed(2) + "ms").join(", ")}`);
  console.log(`Average: ${avgDb.toFixed(2)}ms | Min: ${minDb.toFixed(2)}ms | Max: ${maxDb.toFixed(2)}ms\n`);

  // 2. Browser Measurements via Playwright
  console.log("--- 2. Browser Loading & Rendering Timings ---");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: "http://localhost:8081",
    viewport: { width: 1376, height: 900 },
  });
  const page = await context.newPage();

  // Sign In using E2E fixture
  await signIn(page);

  // Cold Application Load to /admin
  console.log("Measuring Cold Application Load to /admin...");
  const coldStart = performance.now();
  await page.goto("http://localhost:8081/admin", { waitUntil: "domcontentloaded" });
  
  // Wait for Command Center header and first KPI metric
  await page.waitForSelector("text=مركز القيادة والعمليات التنفيذية, text=Executive Operations Command Center", { timeout: 15000 });
  const timeToFirstKpi = performance.now() - coldStart;

  // Complete page load (wait for data cards)
  await page.waitForSelector("text=المالية والتحصيل, text=Financial & Collection", { timeout: 10000 });
  const completePageRender = performance.now() - coldStart;

  console.log(`Time to First Visible KPI: ${timeToFirstKpi.toFixed(2)}ms`);
  console.log(`Complete Page Rendering Time: ${completePageRender.toFixed(2)}ms\n`);

  // 3. Warm Navigation (Client-Side Route Transition)
  console.log("Measuring Warm Navigation (/admin -> /admin/quotes -> /admin)...");
  // Navigate to Quotes
  await page.click('a[href="/admin/quotes"]');
  await page.waitForSelector("text=عروض الأسعار, text=Quotations");
  await page.waitForTimeout(500);

  // Navigate back to Dashboard (warm transition)
  const warmStart = performance.now();
  await page.click('a[href="/admin/"]');
  await page.waitForSelector("text=مركز القيادة والعمليات التنفيذية, text=Executive Operations Command Center");
  const warmDuration = performance.now() - warmStart;
  console.log(`Warm Navigation Transition Time: ${warmDuration.toFixed(2)}ms\n`);

  // 4. CRM Intelligence & Analytics Navigation
  console.log("Measuring Navigation to CRM Analytics (/admin/crm/analytics)...");
  const crmStart = performance.now();
  await page.goto("http://localhost:8081/admin/crm/analytics?timeWindow=all_time&window=all_time", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=إجمالي العملاء المحتملين, text=Total Leads", { timeout: 15000 });
  const crmDuration = performance.now() - crmStart;
  console.log(`CRM Analytics Render Time: ${crmDuration.toFixed(2)}ms\n`);

  await browser.close();
  console.log("================ BENCHMARK RUN COMPLETED ================");
}

runBenchmarks().catch(console.error);
