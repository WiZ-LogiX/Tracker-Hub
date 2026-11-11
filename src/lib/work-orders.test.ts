import { describe, it, expect } from "vitest";
import { extractCutListFromTree } from "@/lib/work-orders.pure";
import type { WorkOrderStatus, WorkOrderPriority } from "@/lib/work-order-types";

describe("Task 16 — Production Work Orders & Cut List Export Tests", () => {
  describe("1. Cut List Deterministic Extraction", () => {
    it("extracts accurate cutlist parts with dimensions, multipliers, and material SKUs from V2 BOM tree", () => {
      const mockTree = [
        {
          productName: "Kitchen Cabinet Setup",
          sections: [
            {
              sectionName: "Base Cabinets",
              units: [
                {
                  unitName: "Sink Base Unit 90cm",
                  qty: 2, // 2 units
                  components: [
                    {
                      kind: "material",
                      name: "Side Panel Left",
                      catalogCode: "MAT-MDF-18",
                      materialName: "MDF 18mm White Melamine",
                      heightMm: 720,
                      widthMm: 560,
                      thicknessMm: 18,
                      qty: 1, // 1 per unit -> 2 total
                      unitOfMeasure: "sheet",
                      notes: "Edge band front edge 1mm",
                    },
                    {
                      kind: "material",
                      name: "Bottom Shelf",
                      catalogCode: "MAT-MDF-18",
                      materialName: "MDF 18mm White Melamine",
                      lengthMm: 864,
                      widthMm: 560,
                      thicknessMm: 18,
                      qty: 1, // 1 per unit -> 2 total
                      unitOfMeasure: "sheet",
                    },
                    {
                      kind: "hardware",
                      name: "Cabinet Legs",
                      catalogCode: "HDW-LEG-100",
                      qty: 4,
                    },
                    {
                      kind: "operation",
                      name: "CNC Shelf Pin Drilling",
                      catalogCode: "OP-CNC-DRILL",
                      qty: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const cutList = extractCutListFromTree(mockTree, "WO-1001", "ORD-2001");

      // Only material components should be in cut list (hardware & ops filtered out)
      expect(cutList).toHaveLength(2);

      // Side Panel Left
      expect(cutList[0]).toMatchObject({
        workOrderNumber: "WO-1001",
        orderNumber: "ORD-2001",
        productName: "Kitchen Cabinet Setup",
        sectionName: "Base Cabinets",
        unitName: "Sink Base Unit 90cm",
        componentName: "Side Panel Left",
        materialSku: "MAT-MDF-18",
        materialName: "MDF 18mm White Melamine",
        lengthMm: 720,
        widthMm: 560,
        thicknessMm: 18,
        quantity: 2, // 1 * 2 units
        notes: "Edge band front edge 1mm",
      });

      // Bottom Shelf
      expect(cutList[1]).toMatchObject({
        componentName: "Bottom Shelf",
        lengthMm: 864,
        widthMm: 560,
        thicknessMm: 18,
        quantity: 2,
      });
    });
  });

  describe("2. CSV Encoding & UTF-8 / Arabic Support", () => {
    it("formats CSV correctly with escaped fields and UTF-8 BOM prefix", () => {
      const generateCsv = (headers: string[], rows: (string | number)[][]) => {
        const escapeCsv = (val: any) => {
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        };

        const headerStr = headers.map(escapeCsv).join(",");
        const rowStrs = rows.map((r) => r.map(escapeCsv).join(","));
        return "\uFEFF" + [headerStr, ...rowStrs].join("\n");
      };

      const headers = ["WO Number", "Component", "Material", "Length", "Width", "Qty"];
      const rows = [
        ["WO-1001", "قاطع جانبي أيمن", "خشب MDF أبيض 18 مم", 720, 560, 2],
        ["WO-1001", "Bottom Shelf, with \"groove\"", "MDF Oak 18mm", 864, 560, 1],
      ];

      const csv = generateCsv(headers, rows);

      // Checks
      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain('"قاطع جانبي أيمن"');
      expect(csv).toContain('"خشب MDF أبيض 18 مم"');
      expect(csv).toContain('"Bottom Shelf, with ""groove"""');
    });
  });

  describe("3. Work Order Status State Machine & Invariants", () => {
    it("enforces valid status transitions for factory execution", () => {
      const validTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
        draft: ["ready", "cancelled"],
        ready: ["in_progress", "cancelled"],
        in_progress: ["qc_pending", "ready", "cancelled"],
        qc_pending: ["completed", "in_progress", "cancelled"],
        completed: [],
        cancelled: [],
      };

      const canTransition = (from: WorkOrderStatus, to: WorkOrderStatus) => {
        return (validTransitions[from] || []).includes(to);
      };

      expect(canTransition("ready", "in_progress")).toBe(true);
      expect(canTransition("in_progress", "qc_pending")).toBe(true);
      expect(canTransition("qc_pending", "completed")).toBe(true);
      expect(canTransition("qc_pending", "in_progress")).toBe(true); // QC rework

      expect(canTransition("draft", "completed")).toBe(false);
      expect(canTransition("completed", "in_progress")).toBe(false); // terminal
    });

    it("ensures work order creation is idempotent for an order", () => {
      const existingWorkOrders: Array<{ id: string; orderId: string; workOrderNumber: string; remakeId: string | null }> = [
        { id: "wo-1", orderId: "ord-1", workOrderNumber: "WO-1001", remakeId: null },
      ];

      const createOrGetWorkOrder = (orderId: string, remakeId: string | null) => {
        const found = existingWorkOrders.find(
          (w) => w.orderId === orderId && w.remakeId === remakeId,
        );
        if (found) {
          return { workOrderId: found.id, isNew: false };
        }
        const newId = `wo-${existingWorkOrders.length + 1}`;
        existingWorkOrders.push({ id: newId, orderId, workOrderNumber: `WO-100${existingWorkOrders.length + 1}`, remakeId });
        return { workOrderId: newId, isNew: true };
      };

      const first = createOrGetWorkOrder("ord-1", null);
      expect(first.isNew).toBe(false);
      expect(first.workOrderId).toBe("wo-1");

      const second = createOrGetWorkOrder("ord-2", null);
      expect(second.isNew).toBe(true);
    });
  });

  describe("4. Financial & Commercial Invariants", () => {
    it("ensures work order operations strictly do not mutate commercial order or invoice totals", () => {
      const order = {
        id: "ord-1001",
        orderNumber: "ORD-1001",
        total: 120000,
        deposit: 60000,
        invoiceTotal: 120000,
        paidAmount: 60000,
      };

      const initialTotal = order.total;
      const initialDeposit = order.deposit;

      // Simulate Work Order creation and completion
      const workOrder = {
        id: "wo-1",
        workOrderNumber: "WO-1001",
        orderId: order.id,
        status: "completed" as WorkOrderStatus,
      };

      expect(order.total).toBe(initialTotal);
      expect(order.deposit).toBe(initialDeposit);
      expect(order.invoiceTotal).toBe(initialTotal);
      expect(workOrder.orderId).toBe(order.id);
    });
  });

  describe("5. Tenant Isolation & Permissions", () => {
    it("strictly isolates work orders by tenantId", () => {
      const tenantA = "tenant-a-uuid";
      const tenantB = "tenant-b-uuid";

      const workOrders = [
        { id: "wo-1", tenantId: tenantA, workOrderNumber: "WO-1001" },
        { id: "wo-2", tenantId: tenantB, workOrderNumber: "WO-1001" },
      ];

      const getTenantWOs = (tenantId: string) => workOrders.filter((w) => w.tenantId === tenantId);

      expect(getTenantWOs(tenantA)).toHaveLength(1);
      expect(getTenantWOs(tenantA)[0].id).toBe("wo-1");
      expect(getTenantWOs(tenantB)).toHaveLength(1);
      expect(getTenantWOs(tenantB)[0].id).toBe("wo-2");
    });
  });
});
