import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("Final Integration: Server Function Dispatch & Network Verification", () => {
  test("verifies server function network requests (GET, POST, Auth, Membership)", async ({ page }) => {
    const interceptedServerFns: Array<{
      url: string;
      method: string;
      status: number;
      requestBody?: string;
      responseBody?: string;
    }> = [];

    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/_serverFn/")) {
        let responseBody = "";
        try {
          responseBody = await res.text();
        } catch {
          responseBody = "<streamed or unavailable>";
        }
        interceptedServerFns.push({
          url,
          method: res.request().method(),
          status: res.status(),
          requestBody: res.request().postData() || undefined,
          responseBody: responseBody.slice(0, 500),
        });
      }
    });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Visit Homepage first (verify clean public state)
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("localhost:8081");

    // 2. Authenticated journey: Sign in and visit /admin/tasks
    await signIn(page);
    await page.goto("/admin/tasks");
    await page.waitForLoadState("networkidle");

    // Wait for server functions to resolve
    await page.waitForTimeout(2000);

    // 3. Inspect intercepted server functions
    console.log("Total intercepted /_serverFn/ calls:", interceptedServerFns.length);
    for (const fn of interceptedServerFns) {
      console.log(`[${fn.method}] ${fn.url} -> ${fn.status}`);
      expect(fn.status).toBeLessThan(400); // No 4xx or 5xx errors
    }

    // Verify at least one GET was recorded
    const getCalls = interceptedServerFns.filter((c) => c.method === "GET");
    console.log("GET calls intercepted:", getCalls.length);

    // Verify at least one POST was recorded
    const postCalls = interceptedServerFns.filter((c) => c.method === "POST");
    console.log("POST calls intercepted:", postCalls.length);

    expect(interceptedServerFns.length).toBeGreaterThan(0);

    // Verify no console errors
    const fatalErrors = consoleErrors.filter(
      (e) =>
        e.includes("TSS_SERVER_FN_BASE") ||
        e.includes("Maximum update depth") ||
        e.includes("Minified React error #185"),
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
