import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

const MOCK_QUOTE_ID = "88888888-8888-8888-8888-888888888881";

test.describe("PDF Download Safety & Reliability", () => {
  test("Clicking Download PDF on quotation details triggers generatePdf without undefined 'id' crash", async ({ page }) => {
    test.setTimeout(45_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Mock REST endpoints for quote and customer
    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "معتز سليمان",
        phone: "+20 10 24887007",
        email: "moataz@example.com",
        address: "القاهرة",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });

    await page.route("**/rest/v1/quotes**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const quoteRecord = {
        id: MOCK_QUOTE_ID,
        tenant_id: MOCK_TENANT_ID,
        quote_number: "PLC-QUOTE-2026-9999",
        customer_id: MOCK_CUSTOMER_ID,
        status: "sent",
        subtotal: "4500.00",
        discount_amount: "0.00",
        vat_amount: "0.00",
        total: "4500.00",
        deposit_pct: "60",
        valid_until: "2026-12-31",
        notes: "تسريحة كاملة بمراية معتمدة",
        snapshot: {
          quotationMode: "commercial",
          customerName: "معتز سليمان",
          quoteNumber: "PLC-QUOTE-2026-9999",
          lines: [
            {
              id: "line-1",
              name: "تسريحة كاملة بمراية",
              category: "custom",
              categoryNameAr: "غرف نوم",
              pricingUnitAr: "عدد",
              dimensions: { width: 120, height: 80, depth: 45, unit: "سم" },
              quantity: 1,
              unitPrice: 4500,
              lineTotal: 4500,
              technicalSpecs: "تسريحة خشب بمراية كبيرة و3 أدراج",
            },
          ],
          subtotal: 4500,
          total: 4500,
          terms: {
            deliveryDays: 30,
            warrantyYears: 5,
            paymentSchedule: [
              { percent: 60, timing: "Advance", timingAr: "مقدم عند التعاقد" },
              { percent: 30, timing: "Middle", timingAr: "بعد التعاقد بـ 15 يوم" },
              { percent: 10, timing: "Final", timingAr: "عند الاستلام والتركيب" },
            ],
            notes: ["الباب شامل المفصلات (توريد & تركيب)", "ضمان فعلي لمدة 5 سنوات"],
          },
        },
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? quoteRecord : [quoteRecord]),
      });
    });

    await page.route("**/rest/v1/quotation_products**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/0" },
        body: JSON.stringify([]),
      });
    });

    await page.route("**/rest/v1/quote_items**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/0" },
        body: JSON.stringify([]),
      });
    });

    // Intercept server function generatePdf
    await page.route("**/_serverFn/**", async (route) => {
      const url = route.request().url();
      if (url.includes("pdf.functions") || url.includes("cGRmLmZ1bmN0aW9ucw")) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            result: {
              key: `${MOCK_TENANT_ID}/quotes/${MOCK_QUOTE_ID}/test.pdf`,
              downloadUrl: "https://example.com/mock-download-url.pdf",
              size: 10240,
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await signIn(page);
    await page.goto(`/admin/quotes/${MOCK_QUOTE_ID}`);
    await page.waitForLoadState("networkidle");

    // Verify Quote details loaded
    await expect(page.locator("body")).toContainText("PLC-QUOTE-2026-9999");

    // Find the Download PDF button
    const downloadBtn = page.getByRole("button", { name: /تحميل PDF|Download PDF/i });
    await expect(downloadBtn).toBeVisible();

    // Prevent real window.open popup
    await page.evaluate(() => {
      window.open = () => null;
    });

    // Wait for the POST request to generatePdf
    const pdfRequestPromise = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes("_serverFn/"),
    );

    // Click Download PDF
    await downloadBtn.click();

    const pdfRequest = await pdfRequestPromise;
    expect(pdfRequest).toBeDefined();

    // Verify no unhandled exceptions with "reading 'id'"
    const idErrors = consoleErrors.filter((e) => e.includes("Cannot read properties of undefined (reading 'id')"));
    expect(idErrors).toHaveLength(0);
  });
});
