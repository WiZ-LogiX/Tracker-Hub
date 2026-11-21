import { describe, it, expect } from "vitest";
import i18n from "./index";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

describe("i18n Interpolation & Placeholder Formatting Integrity", () => {
  const locales = [
    { code: "ar", data: ar, advanceExpected: "انتقال إلى: التقطيع", countExpected: "3 نتائج" },
    { code: "en", data: en, advanceExpected: "Advance to: Cutting", countExpected: "3 results" },
    { code: "fr", data: fr, advanceExpected: "Avancer vers : Découpe", countExpected: "3 résultats" },
  ];

  it("1. Static audit: Zero single-brace placeholders exist across all locale files", () => {
    const singleBraceRegex = /(?<!\{)\{([a-zA-Z0-9_]+)\}(?!\})/;
    const violations: string[] = [];

    function checkObject(obj: any, path: string, locale: string) {
      for (const [key, val] of Object.entries(obj)) {
        const curPath = path ? `${path}.${key}` : key;
        if (typeof val === "object" && val !== null) {
          checkObject(val, curPath, locale);
        } else if (typeof val === "string") {
          // Ignore the documentation string of available template tokens in notifications settings
          if (curPath === "notifications.templates.tokens") continue;
          if (singleBraceRegex.test(val)) {
            violations.push(`[${locale}] ${curPath}: "${val}"`);
          }
        }
      }
    }

    checkObject(ar, "", "ar");
    checkObject(en, "", "en");
    checkObject(fr, "", "fr");

    expect(violations).toEqual([]);
  });

  it("2. orders.advance interpolates stage variable cleanly in all locales without raw {stage}", () => {
    expect(i18n.t("orders.advance", { lng: "ar", stage: "التقطيع" })).toBe("انتقال إلى: التقطيع");
    expect(i18n.t("orders.advance", { lng: "en", stage: "Cutting" })).toBe("Advance to: Cutting");
    expect(i18n.t("orders.advance", { lng: "fr", stage: "Découpe" })).toBe("Avancer vers : Découpe");

    // Must NOT contain raw {stage} or {{stage}}
    expect(i18n.t("orders.advance", { lng: "ar", stage: "التقطيع" })).not.toContain("{stage}");
    expect(i18n.t("orders.advance", { lng: "en", stage: "Cutting" })).not.toContain("{stage}");
  });

  it("3. orders.assignments and qcInspections interpolate count cleanly", () => {
    expect(i18n.t("orders.assignments", { lng: "ar", n: 4 })).toBe("التعيينات (4)");
    expect(i18n.t("orders.assignments", { lng: "en", n: 4 })).toBe("Assignments (4)");
    expect(i18n.t("orders.qcInspections", { lng: "ar", n: 2 })).toBe("فحص الجودة (2)");
    expect(i18n.t("orders.qcInspections", { lng: "en", n: 2 })).toBe("QC inspections (2)");
  });

  it("4. track.resultsCount and track.attachments interpolate counts cleanly", () => {
    expect(i18n.t("track.resultsCount", { lng: "ar", n: 5 })).toBe("5 نتائج");
    expect(i18n.t("track.resultsCount", { lng: "en", n: 5 })).toBe("5 results");
    expect(i18n.t("track.attachments", { lng: "ar", n: 1 })).toBe("المرفقات (1)");
    expect(i18n.t("track.attachments", { lng: "en", n: 1 })).toBe("Attachments (1)");
  });

  it("5. quotes.convertedToInvoiceAndOrder interpolates order number cleanly", () => {
    expect(i18n.t("quotes.convertedToInvoiceAndOrder", { lng: "ar", number: "ORD-2026-001" }))
      .toBe("تم تحويل عرض الأسعار لفاتورة وأمر إنتاج: ORD-2026-001");
    expect(i18n.t("quotes.convertedToInvoiceAndOrder", { lng: "en", number: "ORD-2026-001" }))
      .toBe("Quote converted to invoice and order: ORD-2026-001");
  });

  it("6. quotes.depositSuggested interpolates percentage cleanly", () => {
    expect(i18n.t("quotes.depositSuggested", { lng: "ar", pct: 50 })).toBe("عربون مقترح (50%)");
    expect(i18n.t("quotes.depositSuggested", { lng: "en", pct: 50 })).toBe("Suggested deposit (50%)");
  });

  it("7. pricingRules.version returns clean column title without unrendered {version}", () => {
    expect(i18n.t("pricingRules.version", { lng: "ar" })).toBe("الإصدار");
    expect(i18n.t("pricingRules.version", { lng: "en" })).toBe("Version");
    expect(i18n.t("pricingRules.version", { lng: "fr" })).toBe("Version");
    expect(i18n.t("pricingRules.version", { lng: "ar" })).not.toContain("{version}");
  });

  it("8. fallbackSingleBraces postProcessor rescues any dynamic string with single curly braces", () => {
    i18n.addResource("ar", "translation", "testSingleFallback", "مرحباً {userName}، رتبتك هي {role}");
    const resAr = i18n.t("testSingleFallback", {
      lng: "ar",
      userName: "أحمد",
      role: "مدير",
    });
    expect(resAr).toBe("مرحباً أحمد، رتبتك هي مدير");

    i18n.addResource("en", "translation", "testSingleFallback", "Hello {userName}, your role is {role}");
    const resEn = i18n.t("testSingleFallback", {
      lng: "en",
      userName: "Ahmed",
      role: "Admin",
    });
    expect(resEn).toBe("Hello Ahmed, your role is Admin");
  });
});
