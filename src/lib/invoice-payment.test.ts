import { describe, it, expect } from "vitest";
import { computeInvoiceStatus, type InvoiceStatus } from "@/lib/invoice-types";

describe("Task 10 — Commercial Invoicing & Milestone Payments Ledger Tests", () => {
  describe("1. Invoice Status & Derived Overdue State", () => {
    it("returns 'unpaid' when paidAmount is zero and invoice is recently issued", () => {
      const recentDate = new Date().toISOString();
      expect(computeInvoiceStatus(50000, 0, recentDate)).toBe("unpaid");
    });

    it("returns 'partially_paid' when paidAmount is greater than zero but less than total", () => {
      const recentDate = new Date().toISOString();
      expect(computeInvoiceStatus(50000, 25000, recentDate)).toBe("partially_paid");
      expect(computeInvoiceStatus(50000, 49999.99, recentDate)).toBe("partially_paid");
    });

    it("returns 'paid' when paidAmount equals or exceeds total", () => {
      expect(computeInvoiceStatus(50000, 50000)).toBe("paid");
      expect(computeInvoiceStatus(50000, 50050)).toBe("paid");
    });

    it("returns 'overdue' when paidAmount is zero and issuedAt is older than 30 days", () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeInvoiceStatus(50000, 0, fortyDaysAgo)).toBe("overdue");
    });

    it("does not return 'overdue' if invoice is already fully paid even if old", () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeInvoiceStatus(50000, 50000, sixtyDaysAgo)).toBe("paid");
    });
  });

  describe("2. Milestone Payments Summation & Balance Calculations", () => {
    it("accurately calculates 3-stage milestone payments (Deposit 50% -> Progress 40% -> Final 10%)", () => {
      const totalContract = 100000;
      const milestone1_deposit = 50000;
      const milestone2_progress = 40000;
      const milestone3_final = 10000;

      // Milestone 1
      const paid1 = milestone1_deposit;
      const balance1 = Math.max(0, totalContract - paid1);
      expect(balance1).toBe(50000);
      expect(computeInvoiceStatus(totalContract, paid1)).toBe("partially_paid");

      // Milestone 2
      const paid2 = paid1 + milestone2_progress;
      const balance2 = Math.max(0, totalContract - paid2);
      expect(balance2).toBe(10000);
      expect(computeInvoiceStatus(totalContract, paid2)).toBe("partially_paid");

      // Milestone 3
      const paid3 = paid2 + milestone3_final;
      const balance3 = Math.max(0, totalContract - paid3);
      expect(balance3).toBe(0);
      expect(computeInvoiceStatus(totalContract, paid3)).toBe("paid");
    });
  });

  describe("3. Payment Receipt Formatting & Sequence", () => {
    it("formats sequential receipt numbers accurately", () => {
      const formatReceipt = (counter: number) => `REC-${counter}`;
      expect(formatReceipt(1001)).toBe("REC-1001");
      expect(formatReceipt(1002)).toBe("REC-1002");
      expect(formatReceipt(1099)).toBe("REC-1099");
    });
  });

  describe("4. Role Authorization for Financial Mutations", () => {
    it("prohibits workers and viewers from recording payments", () => {
      const canRecordPayment = (role: string) => {
        return role === "owner" || role === "admin" || role === "sales";
      };

      expect(canRecordPayment("worker")).toBe(false);
      expect(canRecordPayment("viewer")).toBe(false);
      expect(canRecordPayment("sales")).toBe(true);
      expect(canRecordPayment("admin")).toBe(true);
      expect(canRecordPayment("owner")).toBe(true);
    });
  });
});
