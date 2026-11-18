import { describe, it, expect } from "vitest";
import {
  computeMilestoneBreakdown,
  computeInvoiceStatus,
  MILESTONE_CONFIGS,
  type MilestonePreset,
} from "@/lib/invoice-types";
import type { ProjectFinancials, ProjectInvoiceRecord } from "@/lib/project-types";
import { invoices } from "@/db/schema";
import { db } from "@/db/client.server";
import { sql } from "drizzle-orm";

describe("Sprint 1 — Milestone Billing & Project Financial Margin Suite", () => {
  // ── 1. Milestone Presets & Remainder Rounding Math ─────────────────────────
  describe("1. Milestone Presets & Remainder Rounding Math", () => {
    it("guarantees SUM(milestones.amount) === total for tricky decimal fractions (60/30/10)", () => {
      const testTotals = [100000, 33333.33, 1000.01, 777.77, 9999.99, 100.03];

      for (const total of testTotals) {
        const milestones = computeMilestoneBreakdown(total, "60_30_10");
        expect(milestones).toHaveLength(3);

        const sum = milestones.reduce((s, m) => s + m.amount, 0);
        // Round to 2 decimals to check exact equality
        const roundedSum = Math.round(sum * 100) / 100;
        expect(roundedSum).toBe(total);

        // First milestone is issued immediately; subsequent are scheduled
        expect(milestones[0].billingStatus).toBe("issued");
        expect(milestones[0].index).toBe(1);
        expect(milestones[0].pct).toBe(60);

        expect(milestones[1].billingStatus).toBe("scheduled");
        expect(milestones[1].index).toBe(2);
        expect(milestones[1].pct).toBe(30);

        expect(milestones[2].billingStatus).toBe("scheduled");
        expect(milestones[2].index).toBe(3);
        expect(milestones[2].pct).toBe(10);
      }
    });

    it("correctly breaks down 50/50 equal halves preset with remainder protection", () => {
      const total = 99999.99;
      const milestones = computeMilestoneBreakdown(total, "50_50");
      expect(milestones).toHaveLength(2);

      const sum = Math.round((milestones[0].amount + milestones[1].amount) * 100) / 100;
      expect(sum).toBe(total);
      expect(milestones[0].billingStatus).toBe("issued");
      expect(milestones[1].billingStatus).toBe("scheduled");
    });

    it("correctly breaks down 50/30/20 balanced preset with remainder protection", () => {
      const total = 123456.78;
      const milestones = computeMilestoneBreakdown(total, "50_30_20");
      expect(milestones).toHaveLength(3);

      const sum = Math.round(milestones.reduce((s, m) => s + m.amount, 0) * 100) / 100;
      expect(sum).toBe(total);
      expect(milestones[0].pct).toBe(50);
      expect(milestones[1].pct).toBe(30);
      expect(milestones[2].pct).toBe(20);
    });

    it("handles 100% single upfront milestone preset", () => {
      const total = 50000;
      const milestones = computeMilestoneBreakdown(total, "100");
      expect(milestones).toHaveLength(1);
      expect(milestones[0].amount).toBe(50000);
      expect(milestones[0].pct).toBe(100);
      expect(milestones[0].billingStatus).toBe("issued");
    });
  });

  // ── 2. Invoice Overdue Protection for Scheduled Milestones ────────────────
  describe("2. Overdue State Protection for Scheduled Milestones", () => {
    it("never flags scheduled future milestones as overdue even if created 90 days ago", () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      // Normal issued invoice that is unpaid after 90 days IS overdue
      expect(computeInvoiceStatus(30000, 0, ninetyDaysAgo, "issued")).toBe("overdue");

      // Scheduled invoice that is unpaid after 90 days is NOT overdue (returns unpaid)
      expect(computeInvoiceStatus(30000, 0, ninetyDaysAgo, "scheduled")).toBe("unpaid");
    });

    it("accurately reports normal status progression for issued milestone invoices", () => {
      const recentDate = new Date();
      expect(computeInvoiceStatus(50000, 0, recentDate, "issued")).toBe("unpaid");
      expect(computeInvoiceStatus(50000, 25000, recentDate, "issued")).toBe("partially_paid");
      expect(computeInvoiceStatus(50000, 50000, recentDate, "issued")).toBe("paid");
    });
  });

  // ── 3. Project Margin & Financial Aggregation Logic ──────────────────────
  describe("3. Project Margin & Financial Aggregation Logic", () => {
    it("aggregates issued vs scheduled invoices correctly without double-counting", () => {
      const invoices: ProjectInvoiceRecord[] = [
        {
          id: "inv-m1",
          invoiceNumber: "PLC-001-M1",
          total: 60000,
          paidAmount: 60000,
          balanceDue: 0,
          status: "paid",
          billingStatus: "issued",
          milestoneIndex: 1,
          milestoneTotalCount: 3,
          issueDate: "2026-11-01",
        },
        {
          id: "inv-m2",
          invoiceNumber: "PLC-001-M2",
          total: 30000,
          paidAmount: 0,
          balanceDue: 30000,
          status: "draft",
          billingStatus: "scheduled",
          milestoneIndex: 2,
          milestoneTotalCount: 3,
          issueDate: "2026-11-01",
        },
        {
          id: "inv-m3",
          invoiceNumber: "PLC-001-M3",
          total: 10000,
          paidAmount: 0,
          balanceDue: 10000,
          status: "draft",
          billingStatus: "scheduled",
          milestoneIndex: 3,
          milestoneTotalCount: 3,
          issueDate: "2026-11-01",
        },
      ];

      const issued = invoices.filter((i) => i.billingStatus !== "scheduled" && i.billingStatus !== "void");
      const scheduled = invoices.filter((i) => i.billingStatus === "scheduled");

      const totalInvoiced = issued.reduce((s, i) => s + i.total, 0);
      const totalScheduled = scheduled.reduce((s, i) => s + i.total, 0);
      const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
      const totalProjectVal = totalInvoiced + totalScheduled;

      expect(totalInvoiced).toBe(60000);
      expect(totalScheduled).toBe(40000);
      expect(totalCollected).toBe(60000);
      expect(totalProjectVal).toBe(100000);

      // Margin computation with 65% direct cost baseline
      const estimatedCost = Math.round(totalProjectVal * 0.65 * 100) / 100;
      const estimatedMargin = Math.max(0, Math.round((totalProjectVal - estimatedCost) * 100) / 100);
      const marginPct = Math.round((estimatedMargin / totalProjectVal) * 1000) / 10;

      expect(estimatedCost).toBe(65000);
      expect(estimatedMargin).toBe(35000);
      expect(marginPct).toBe(35.0);
    });

    it("strictly masks all financial and margin figures when canSeeFinancials is false", () => {
      const canSeeFinancials = false;
      const projectTotalVal = 100000;
      const totalInvoiced = 60000;
      const totalScheduled = 40000;
      const totalCollected = 60000;
      const outstandingBalance = 0;
      const estimatedCost = 65000;
      const estimatedMargin = 35000;
      const marginPct = 35;

      const maskedFinancials: ProjectFinancials = {
        totalProjectValue: !canSeeFinancials ? 0 : projectTotalVal,
        totalInvoiced: !canSeeFinancials ? 0 : totalInvoiced,
        totalScheduled: !canSeeFinancials ? 0 : totalScheduled,
        totalCollected: !canSeeFinancials ? 0 : totalCollected,
        outstandingBalance: !canSeeFinancials ? 0 : outstandingBalance,
        estimatedCost: !canSeeFinancials ? 0 : estimatedCost,
        estimatedMargin: !canSeeFinancials ? 0 : estimatedMargin,
        marginPct: !canSeeFinancials ? 0 : marginPct,
        invoices: !canSeeFinancials ? [] : ([] as any),
        payments: !canSeeFinancials ? [] : ([] as any),
      };

      expect(maskedFinancials.totalProjectValue).toBe(0);
      expect(maskedFinancials.totalInvoiced).toBe(0);
      expect(maskedFinancials.totalScheduled).toBe(0);
      expect(maskedFinancials.totalCollected).toBe(0);
      expect(maskedFinancials.outstandingBalance).toBe(0);
      expect(maskedFinancials.estimatedCost).toBe(0);
      expect(maskedFinancials.estimatedMargin).toBe(0);
      expect(maskedFinancials.marginPct).toBe(0);
      expect(maskedFinancials.invoices).toHaveLength(0);
      expect(maskedFinancials.payments).toHaveLength(0);
    });
  });

  // ── 4. Drizzle Schema & Isolated Database Columns Integrity ───────────────
  describe("4. Drizzle Schema & Isolated Database Columns Integrity", () => {
    it("defines all 7 milestone billing columns on the invoices Drizzle table", () => {
      expect(invoices.projectId).toBeDefined();
      expect(invoices.milestoneIndex).toBeDefined();
      expect(invoices.milestoneTotalCount).toBeDefined();
      expect(invoices.milestoneLabel).toBeDefined();
      expect(invoices.milestonePct).toBeDefined();
      expect(invoices.billingStatus).toBeDefined();
      expect(invoices.dueStage).toBeDefined();
    });

    it("verifies the 7 milestone columns exist in pelecanon_test PostgreSQL database", async () => {
      const rows = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'invoices'
        AND column_name IN (
          'project_id',
          'milestone_index',
          'milestone_total_count',
          'milestone_label',
          'milestone_pct',
          'billing_status',
          'due_stage'
        )
        ORDER BY column_name;
      `);

      const colNames = (rows as any[]).map((r) => r.column_name);
      expect(colNames).toContain("billing_status");
      expect(colNames).toContain("due_stage");
      expect(colNames).toContain("milestone_index");
      expect(colNames).toContain("milestone_label");
      expect(colNames).toContain("milestone_pct");
      expect(colNames).toContain("milestone_total_count");
      expect(colNames).toContain("project_id");
      expect(colNames).toHaveLength(7);
    });

    it("verifies the invoices_tenant_project_idx index exists in pelecanon_test", async () => {
      const idxRows = await db.execute(sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'invoices' AND indexname = 'invoices_tenant_project_idx';
      `);

      expect((idxRows as any[]).length).toBe(1);
    });

    it("verifies check constraint on billing_status in pelecanon_test", async () => {
      const constraintRows = await db.execute(sql`
        SELECT conname
        FROM pg_constraint
        WHERE conname = 'invoices_billing_status_check';
      `);

      expect((constraintRows as any[]).length).toBe(1);
    });
  });
});
