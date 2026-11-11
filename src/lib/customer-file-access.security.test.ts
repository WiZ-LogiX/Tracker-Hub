import { describe, it, expect, vi } from "vitest";

// Mock R2 server module to verify signing calls and TTL without external network dependency
vi.mock("@/lib/r2.server", () => ({
  getDownloadUrl: vi.fn(async (key: string, expiresIn: number) => {
    return `https://mock-account.r2.cloudflarestorage.com/pelecanon/${key}?X-Amz-Expires=${expiresIn}&mock=true`;
  }),
  getPublicUrl: vi.fn((key: string) => `https://mock-account.r2.cloudflarestorage.com/pelecanon/${key}`),
  uploadToR2: vi.fn(),
  deleteObject: vi.fn(),
  objectExists: vi.fn(),
  generateObjectKey: vi.fn((t, e, id, f) => `${t}/${e}/${id}/${f}`),
}));

import {
  CUSTOMER_SIGNED_URL_TTL,
  fetchPublicOrderAttachments,
  handlePublicAttachmentDownload,
  handlePublicOrderAttachments,
  handlePublicTrackingByRef,
} from "@/lib/tracking.functions";
import * as trackingModule from "@/lib/tracking.functions";
import * as attachmentsModule from "@/lib/attachments.functions";
import * as dbSchema from "@/db/schema";

describe("Customer Read-Only R2 File Access & Security Hardening", () => {
  const tenantA = "00000000-0000-4000-a000-000000000001";
  const tenantB = "00000000-0000-4000-b000-000000000002";
  const orderIdA = "11111111-1111-4111-a111-111111111111";
  const orderIdB = "22222222-2222-4222-b222-222222222222";
  const tokenCustomerA = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const tokenCustomerB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

  const publicAttachmentA = {
    id: "att-pub-001",
    entity_type: "order",
    entity_id: orderIdA,
    tenant_id: tenantA,
    file_name: "production_progress_cabinet.jpg",
    content_type: "image/jpeg",
    size_bytes: 204800,
    storage_key: `${tenantA}/attachments/${orderIdA}/cabinet.jpg`,
    caption: "صورة مرحلة التجميع",
    is_public: true,
    created_at: new Date().toISOString(),
  };

  const internalAttachmentA = {
    id: "att-int-001",
    entity_type: "order",
    entity_id: orderIdA,
    tenant_id: tenantA,
    file_name: "internal_supplier_invoice_timber.pdf",
    content_type: "application/pdf",
    size_bytes: 512000,
    storage_key: `${tenantA}/attachments/${orderIdA}/supplier_invoice.pdf`,
    caption: "فاتورة المورد وسعر الخشب الداخلي",
    is_public: false, // INTERNAL ONLY
    created_at: new Date().toISOString(),
  };

  const publicAttachmentB = {
    id: "att-pub-002",
    entity_type: "order",
    entity_id: orderIdB,
    tenant_id: tenantB,
    file_name: "customer_b_warranty.pdf",
    content_type: "application/pdf",
    size_bytes: 102400,
    storage_key: `${tenantB}/attachments/${orderIdB}/warranty.pdf`,
    caption: "شهادة الضمان للعميل ب",
    is_public: true,
    created_at: new Date().toISOString(),
  };

  // ── TTL Policy Compliance ───────────────────────────────────────────
  describe("TTL Policy Compliance", () => {
    it("enforces short-lived customer presigned URLs bounded to 10 minutes maximum (600s)", () => {
      expect(CUSTOMER_SIGNED_URL_TTL).toBe(600);
      expect(CUSTOMER_SIGNED_URL_TTL).toBeLessThanOrEqual(600);
      expect(CUSTOMER_SIGNED_URL_TTL).toBeGreaterThanOrEqual(300);
    });
  });

  // ── Scenario A: Authorized Customer Access to Customer-Visible File ───────
  describe("Scenario A: Customer-Visible File Access", () => {
    it("successfully generates short-lived download URL for authorized customer-visible file", async () => {
      const mockClient: any = {
        from: vi.fn((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: orderIdA, tenant_id: tenantA },
                error: null,
              }),
            };
          }
          if (table === "attachments") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: publicAttachmentA,
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const result = await handlePublicAttachmentDownload(
        { trackingToken: tokenCustomerA, attachmentId: publicAttachmentA.id },
        mockClient,
      );

      expect(result.fileName).toBe(publicAttachmentA.file_name);
      expect(result.expiresInSec).toBe(600);
      expect(result.downloadUrl).toContain(publicAttachmentA.storage_key);
    });

    it("returns ONLY customer_visible attachments in public order fetch, omitting internal files", async () => {
      const mockClient: any = {
        from: vi.fn((table: string) => {
          if (table === "attachments") {
            const chain: any = {};
            chain.select = vi.fn().mockReturnValue(chain);
            chain.eq = vi.fn((col: string, val: any) => {
              // Ensure the query strictly demands is_public = true
              if (col === "is_public") {
                expect(val).toBe(true);
              }
              return chain;
            });
            chain.order = vi.fn().mockResolvedValue({
              data: [publicAttachmentA], // Only public attachment returned from DB filter
              error: null,
            });
            return chain;
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const items = await fetchPublicOrderAttachments(orderIdA, mockClient);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(publicAttachmentA.id);
      expect(items[0].isPublic).toBe(true);
      expect(items[0].fileName).toBe(publicAttachmentA.file_name);
      // Ensure no internal file leaked
      expect(items.find((i: any) => i.id === internalAttachmentA.id)).toBeUndefined();
    });
  });

  // ── Scenario B: Customer Attempts to Access Internal Staff File ───────────
  describe("Scenario B: Internal File Protection", () => {
    it("strictly blocks customer access when requesting an internal staff file", async () => {
      const mockClient: any = {
        from: vi.fn((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: orderIdA, tenant_id: tenantA },
                error: null,
              }),
            };
          }
          if (table === "attachments") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: internalAttachmentA, // is_public = false
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      await expect(
        handlePublicAttachmentDownload(
          { trackingToken: tokenCustomerA, attachmentId: internalAttachmentA.id },
          mockClient,
        ),
      ).rejects.toThrow("هذا الملف خاص بفريق العمل ولا يمكن للعميل الوصول إليه");
    });
  });

  // ── Scenario C: Cross-Customer Isolation ──────────────────────────────────
  describe("Scenario C: Cross-Customer and Cross-Tenant Isolation", () => {
    it("blocks Customer A from downloading Customer B's attachments even if public", async () => {
      const mockClient: any = {
        from: vi.fn((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: orderIdA, tenant_id: tenantA },
                error: null,
              }),
            };
          }
          if (table === "attachments") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // Query searches for attachment with entity_id = orderIdA and tenant_id = tenantA.
              // Attachment B belongs to orderIdB / tenantB, so DB query returns null.
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      await expect(
        handlePublicAttachmentDownload(
          { trackingToken: tokenCustomerA, attachmentId: publicAttachmentB.id },
          mockClient,
        ),
      ).rejects.toThrow("الملف غير موجود أو ليس لديك صلاحية الوصول إليه");
    });
  });

  // ── Scenario D: Customer Attempts Mutation (Upload, Delete, Modify) ───────
  describe("Scenario D: Strict Read-Only Customer Boundary", () => {
    it("confirms public customer endpoints do NOT expose upload, delete, or rename capabilities", () => {
      expect(trackingModule.handlePublicOrder).toBeDefined();
      expect(trackingModule.handlePublicTrackingByRef).toBeDefined();
      expect(trackingModule.handlePublicAttachmentDownload).toBeDefined();
      expect(trackingModule.handlePublicOrderAttachments).toBeDefined();
      // Ensure no public mutations exist in the customer API
      expect((trackingModule as any).handlePublicUpload).toBeUndefined();
      expect((trackingModule as any).handlePublicDelete).toBeUndefined();
      expect((trackingModule as any).handlePublicRename).toBeUndefined();
    });
  });

  // ── Scenario E: Anonymous Access Rejection ─────────────────────────────────
  describe("Scenario E: Anonymous Access Rejection", () => {
    it("rejects attachment retrieval without a valid token UUID", async () => {
      const mockClient: any = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };

      await expect(
        handlePublicOrderAttachments({ token: "invalid-anonymous-token" }, mockClient),
      ).rejects.toThrow();

      await expect(
        handlePublicAttachmentDownload(
          { trackingToken: "invalid-token", attachmentId: publicAttachmentA.id },
          mockClient,
        ),
      ).rejects.toThrow();
    });
  });

  // ── Scenario F: Expired URL Handling ──────────────────────────────────────
  describe("Scenario F: Short-lived Expiration & Refresh Mechanism", () => {
    it("issues fresh short-lived signed URL on demand for valid token", async () => {
      const mockClient: any = {
        from: vi.fn((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: orderIdA, tenant_id: tenantA },
                error: null,
              }),
            };
          }
          if (table === "attachments") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: publicAttachmentA,
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const refreshResult = await handlePublicAttachmentDownload(
        { trackingToken: tokenCustomerA, attachmentId: publicAttachmentA.id },
        mockClient,
      );

      expect(refreshResult.expiresInSec).toBe(600);
      expect(refreshResult.downloadUrl).toBeTruthy();
      expect(refreshResult.downloadUrl).toContain("X-Amz-Expires=600");
    });
  });

  // ── Scenario G: Staff Member Full Access & Visibility Controls ────────────
  describe("Scenario G: Staff Access & Visibility Management", () => {
    it("verifies staff listAttachments and visibility functions exist and are defined", () => {
      expect(attachmentsModule.listAttachments).toBeDefined();
      expect(attachmentsModule.updateAttachmentVisibility).toBeDefined();
      expect(attachmentsModule.bulkUpdateAttachmentVisibility).toBeDefined();
    });

    it("verifies default visibility on new attachments is false (internal)", () => {
      // Drizzle attachments definition: isPublic: boolean("is_public").notNull().default(false)
      expect(dbSchema.attachments.isPublic).toBeDefined();
      expect(dbSchema.attachments.isPublic.default).toBe(false);
    });
  });

  // ── Supported File Types Verification ─────────────────────────────────────
  describe("Supported File Types Handling", () => {
    const supportedTypes = [
      { name: "document.pdf", type: "application/pdf" },
      { name: "photo.jpg", type: "image/jpeg" },
      { name: "diagram.png", type: "image/png" },
    ];

    supportedTypes.forEach(({ name, type }) => {
      it(`correctly presigns and delivers ${name} (${type})`, async () => {
        const item = {
          ...publicAttachmentA,
          file_name: name,
          content_type: type,
          storage_key: `${tenantA}/attachments/${orderIdA}/${name}`,
        };

        const mockClient: any = {
          from: vi.fn((table: string) => {
            if (table === "orders") {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: orderIdA, tenant_id: tenantA },
                  error: null,
                }),
              };
            }
            if (table === "attachments") {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: item,
                  error: null,
                }),
              };
            }
            return { select: vi.fn().mockReturnThis() };
          }),
        };

        const result = await handlePublicAttachmentDownload(
          { trackingToken: tokenCustomerA, attachmentId: item.id },
          mockClient,
        );

        expect(result.fileName).toBe(name);
        expect(result.downloadUrl).toContain(item.storage_key);
        expect(result.expiresInSec).toBe(600);
      });
    });
  });
});
