import { describe, it, expect } from "vitest";
import {
  resolveDateRange,
  CrmAnalyticsInput,
  canViewCrmAnalytics,
  type TimeWindow,
} from "@/lib/crm-analytics-types";
import {
  calculateRate,
  formatLostReasonLabel,
  formatSourceLabel,
} from "@/lib/crm-analytics.pure";

describe("TASK 28 — PeleCanon CRM Intelligence & Commercial Analytics Suite", () => {
  // ── 1. Date Range Resolution & Time Windows ────────────────────────────────
  describe("1. Time Window Resolution & Boundary Arithmetic", () => {
    const fixedNow = new Date("2026-10-28T14:30:00.000Z"); // Wednesday, Oct 28, 2026

    it("resolves 'today' boundaries to exact midnight and end of day", () => {
      const range = resolveDateRange("today", null, null, fixedNow);
      expect(range.timeWindow).toBe("today");
      expect(range.label).toBe("Today");
      expect(range.labelAr).toBe("اليوم");

      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
    });

    it("resolves 'this_week' to standard week boundaries", () => {
      const range = resolveDateRange("this_week", null, null, fixedNow);
      expect(range.timeWindow).toBe("this_week");
      expect(range.label).toBe("This Week");
      expect(range.labelAr).toBe("هذا الأسبوع");

      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      expect(start.getTime()).toBeLessThan(end.getTime());
      // 7 days duration (approx 7 * 86400 * 1000 - 1)
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);
    });

    it("resolves 'this_month' to first and last day of current month", () => {
      const range = resolveDateRange("this_month", null, null, fixedNow);
      expect(range.timeWindow).toBe("this_month");
      expect(range.label).toContain("Oct 2026");

      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      expect(start.getDate()).toBe(1);
      expect(start.getMonth()).toBe(9); // October (0-indexed 9)
      expect(end.getDate()).toBe(31);
      expect(end.getMonth()).toBe(9);
    });

    it("resolves 'this_quarter' accurately to Q4 2026", () => {
      const range = resolveDateRange("this_quarter", null, null, fixedNow);
      expect(range.timeWindow).toBe("this_quarter");
      expect(range.label).toBe("Q4 2026");
      expect(range.labelAr).toBe("الربع 4 - 2026");

      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      expect(start.getMonth()).toBe(9); // Oct 1
      expect(start.getDate()).toBe(1);
      expect(end.getMonth()).toBe(11); // Dec 31
      expect(end.getDate()).toBe(31);
    });

    it("resolves 'custom' date range strictly from provided boundaries", () => {
      const range = resolveDateRange("custom", "2026-06-01", "2026-08-31", fixedNow);
      expect(range.timeWindow).toBe("custom");
      expect(range.label).toContain("2026-06-01 to 2026-08-31");

      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(5); // June
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(7); // August
      expect(end.getDate()).toBe(31);
    });
  });

  // ── 2. Mathematical Rates & Zero-Data Protection ───────────────────────────
  describe("2. Mathematical Rates & Zero-Data Protection", () => {
    it("safely handles zero denominator without throwing NaN or Infinity", () => {
      expect(calculateRate(0, 0)).toBe(0);
      expect(calculateRate(50, 0)).toBe(0);
      expect(calculateRate(0, -10)).toBe(0);
      expect(calculateRate(NaN, 100)).toBe(0);
      expect(calculateRate(50, NaN)).toBe(0);
    });

    it("computes accurate percentage rates rounded to one decimal place", () => {
      expect(calculateRate(25, 100)).toBe(25);
      expect(calculateRate(1, 3)).toBe(33.3);
      expect(calculateRate(2, 3)).toBe(66.7);
      expect(calculateRate(7, 8)).toBe(87.5);
      expect(calculateRate(100, 100)).toBe(100);
    });
  });

  // ── 3. Role-Based Access Control (RBAC) ────────────────────────────────────
  describe("3. Commercial Analytics Security & Authorization", () => {
    it("authorizes owner, admin, sales, and viewer to inspect commercial intelligence", () => {
      expect(canViewCrmAnalytics("owner")).toBe(true);
      expect(canViewCrmAnalytics("admin")).toBe(true);
      expect(canViewCrmAnalytics("sales")).toBe(true);
      expect(canViewCrmAnalytics("viewer")).toBe(true);
    });

    it("strictly blocks worker role from viewing commercial analytics (403)", () => {
      expect(canViewCrmAnalytics("worker")).toBe(false);
    });

    it("rejects unauthorized, null, or undefined roles", () => {
      expect(canViewCrmAnalytics(null)).toBe(false);
      expect(canViewCrmAnalytics(undefined)).toBe(false);
      expect(canViewCrmAnalytics("guest")).toBe(false);
      expect(canViewCrmAnalytics("contractor")).toBe(false);
    });
  });

  // ── 4. Canonical Labels & Lost Reason Mapping ──────────────────────────────
  describe("4. Canonical Labels & Factual Mapping", () => {
    it("formats known lost reasons with English and Arabic labels without inferring", () => {
      const price = formatLostReasonLabel("price");
      expect(price.label).toContain("Price");
      expect(price.labelAr).toContain("السعر");

      const competitor = formatLostReasonLabel("competitor");
      expect(competitor.label).toContain("Competitor");
      expect(competitor.labelAr).toContain("منافس");

      const timing = formatLostReasonLabel("timing");
      expect(timing.label).toContain("Timing");

      const cancelled = formatLostReasonLabel("customer_cancelled");
      expect(cancelled.label).toContain("Cancelled");
    });

    it("handles unspecified lost reason transparently", () => {
      const unspec = formatLostReasonLabel("unspecified");
      expect(unspec.label).toBe("Unspecified Reason");
      expect(unspec.labelAr).toBe("سبب غير محدد");
    });

    it("formats acquisition sources cleanly in both languages", () => {
      const wa = formatSourceLabel("whatsapp");
      expect(wa.label).toBe("WhatsApp");
      expect(wa.labelAr).toBe("واتساب");

      const fb = formatSourceLabel("facebook");
      expect(fb.label).toBe("Facebook");

      const walkin = formatSourceLabel("walk_in");
      expect(walkin.label).toBe("Walk-in");
      expect(walkin.labelAr).toBe("زيارة المعرض");
    });
  });

  // ── 5. Input Validation Schemas ────────────────────────────────────────────
  describe("5. Input Validation & Zod Schemas", () => {
    it("validates valid time window and defaults to this_month", () => {
      const parsed = CrmAnalyticsInput.parse({});
      expect(parsed.timeWindow).toBe("this_month");
    });

    it("validates custom date boundaries and optional sales rep filter", () => {
      const parsed = CrmAnalyticsInput.parse({
        timeWindow: "custom",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        salesOwnerId: "11111111-2222-3333-4444-555555555555",
      });

      expect(parsed.timeWindow).toBe("custom");
      expect(parsed.startDate).toBe("2026-09-01");
      expect(parsed.endDate).toBe("2026-09-30");
      expect(parsed.salesOwnerId).toBe("11111111-2222-3333-4444-555555555555");
    });

    it("rejects invalid time window", () => {
      expect(() => {
        CrmAnalyticsInput.parse({
          timeWindow: "next_year",
        });
      }).toThrow();
    });
  });
});
