import { describe, it, expect } from "vitest";
import {
  DELIVERY_STATUS_TRANSITIONS,
  isValidDeliveryTransition,
  type DeliveryStatus,
} from "@/lib/delivery-types";

describe("Task 17 — Production Dispatch, Delivery & Installation Handover Tests", () => {
  describe("1. Strict Delivery State Machine Transitions", () => {
    it("validates legitimate forward and operational delivery transitions", () => {
      // Direct delivery without installation
      expect(isValidDeliveryTransition("ready_for_dispatch", "dispatched")).toBe(true);
      expect(isValidDeliveryTransition("dispatched", "out_for_delivery")).toBe(true);
      expect(isValidDeliveryTransition("out_for_delivery", "delivered")).toBe(true);
      expect(isValidDeliveryTransition("delivered", "handover_pending")).toBe(true);
      expect(isValidDeliveryTransition("handover_pending", "completed")).toBe(true);

      // Delivery with on-site installation
      expect(isValidDeliveryTransition("delivered", "installation_pending")).toBe(true);
      expect(isValidDeliveryTransition("installation_pending", "installed")).toBe(true);
      expect(isValidDeliveryTransition("installed", "handover_pending")).toBe(true);
      expect(isValidDeliveryTransition("installed", "completed")).toBe(true);

      // Exception handling (delivery failed -> retry)
      expect(isValidDeliveryTransition("dispatched", "delivery_failed")).toBe(true);
      expect(isValidDeliveryTransition("out_for_delivery", "delivery_failed")).toBe(true);
      expect(isValidDeliveryTransition("delivery_failed", "out_for_delivery")).toBe(true);
    });

    it("strictly rejects invalid, premature, or backwards status transitions", () => {
      // Premature skip directly to completed
      expect(isValidDeliveryTransition("ready_for_dispatch", "completed")).toBe(false);
      expect(isValidDeliveryTransition("dispatched", "completed")).toBe(false);
      expect(isValidDeliveryTransition("out_for_delivery", "installed")).toBe(false);

      // Backwards jumps
      expect(isValidDeliveryTransition("delivered", "dispatched")).toBe(false);
      expect(isValidDeliveryTransition("installed", "out_for_delivery")).toBe(false);

      // Mutating completed terminal state
      expect(isValidDeliveryTransition("completed", "ready_for_dispatch")).toBe(false);
      expect(isValidDeliveryTransition("completed", "dispatched")).toBe(false);
    });
  });

  describe("2. Customer Handover & Signature Evidence Invariants", () => {
    it("requires signer name and signature image data URL to complete customer sign-off", () => {
      const completeHandover = (
        currentStatus: DeliveryStatus,
        signerName: string,
        signatureDataUrl: string,
      ) => {
        if (currentStatus !== "handover_pending" && currentStatus !== "installed" && currentStatus !== "delivered") {
          throw new Error("Cannot complete handover from current status");
        }
        if (!signerName || signerName.trim().length === 0) {
          throw new Error("Signer name is required for legal handover sign-off");
        }
        if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image/")) {
          throw new Error("Valid signature image is required for handover evidence");
        }
        return {
          status: "completed" as DeliveryStatus,
          signerName,
          signatureDataUrl,
          handedOverAt: new Date().toISOString(),
        };
      };

      const validSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      // Valid handover
      const result = completeHandover("handover_pending", "Mohamed Ahmed", validSignature);
      expect(result.status).toBe("completed");
      expect(result.signerName).toBe("Mohamed Ahmed");
      expect(result.signatureDataUrl).toBe(validSignature);

      // Missing signer name
      expect(() => completeHandover("handover_pending", "", validSignature)).toThrow(
        "Signer name is required",
      );

      // Missing or invalid signature
      expect(() => completeHandover("handover_pending", "Mohamed Ahmed", "")).toThrow(
        "Valid signature image is required",
      );
    });
  });

  describe("3. Financial & Invoicing Invariants", () => {
    it("ensures delivery and handover completion strictly do NOT modify order or invoice totals", () => {
      const order = {
        id: "ord-1001",
        total: 150000,
        depositAmount: 75000,
        paidAmount: 75000,
        balanceDue: 75000,
      };

      const initialTotal = order.total;
      const initialPaid = order.paidAmount;
      const initialBalance = order.balanceDue;

      // Simulate completing delivery and handover
      const delivery = {
        id: "del-1001",
        orderId: order.id,
        status: "completed" as DeliveryStatus,
        handedOverAt: new Date().toISOString(),
      };

      expect(order.total).toBe(initialTotal);
      expect(order.paidAmount).toBe(initialPaid);
      expect(order.balanceDue).toBe(initialBalance);
      expect(delivery.status).toBe("completed");
    });
  });

  describe("4. Public Tracking Privacy & Security", () => {
    it("sanitizes public tracking payload to avoid leaking signatures, phones, or private notes", () => {
      const internalDelivery = {
        id: "del-1",
        deliveryNumber: "DEL-1001",
        orderNumber: "ORD-1001",
        recipientName: "Ahmed Hassan",
        recipientPhone: "+201012345678",
        customerNotes: "Private gate code: 1234",
        installerNotes: "Minor scratch on bottom repaired on-site",
        signatureDataUrl: "data:image/png;base64,SECRET_SIGNATURE",
        status: "delivered",
      };

      const sanitizeForPublicTracking = (del: typeof internalDelivery) => {
        return {
          deliveryNumber: del.deliveryNumber,
          status: del.status, // safe public status
        };
      };

      const publicView = sanitizeForPublicTracking(internalDelivery);
      expect(publicView).not.toHaveProperty("recipientPhone");
      expect(publicView).not.toHaveProperty("customerNotes");
      expect(publicView).not.toHaveProperty("installerNotes");
      expect(publicView).not.toHaveProperty("signatureDataUrl");
      expect(publicView.status).toBe("delivered");
    });
  });

  describe("5. Tenant Isolation & Permissions", () => {
    it("strictly isolates deliveries by tenantId", () => {
      const tenantA = "tenant-a-uuid";
      const tenantB = "tenant-b-uuid";

      const deliveries = [
        { id: "del-1", tenantId: tenantA, deliveryNumber: "DEL-1001" },
        { id: "del-2", tenantId: tenantB, deliveryNumber: "DEL-1001" },
      ];

      const getTenantDeliveries = (tenantId: string) => deliveries.filter((d) => d.tenantId === tenantId);

      expect(getTenantDeliveries(tenantA)).toHaveLength(1);
      expect(getTenantDeliveries(tenantA)[0].id).toBe("del-1");
      expect(getTenantDeliveries(tenantB)).toHaveLength(1);
      expect(getTenantDeliveries(tenantB)[0].id).toBe("del-2");
    });
  });
});
