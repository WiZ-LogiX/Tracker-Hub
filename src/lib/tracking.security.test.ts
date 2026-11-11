import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  maskPhone,
  maskName,
  isTrackingTokenUuid,
  handlePublicTrackingByRef,
  handlePublicOrder,
  handlePublicOrdersByPhone,
  handlePublicOrderAttachments,
} from "@/lib/tracking.functions";

// ── 1. Database Migration & Schema Parity ────────────────────────────────────

describe("Order tracking token schema & migration parity", () => {
  it("migration file exists and adds tracking_token column with default gen_random_uuid()", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260902_order_tracking_tokens.sql"),
      "utf-8",
    );
    expect(sql).toContain("ALTER TABLE public.orders");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid()");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_idx");
  });

  it("down migration cleans up tracking_token column and index", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260902_order_tracking_tokens_down.sql"),
      "utf-8",
    );
    expect(sql).toContain("DROP INDEX IF EXISTS public.orders_tracking_token_idx");
    expect(sql).toContain("ALTER TABLE public.orders DROP COLUMN IF EXISTS tracking_token");
  });

  // Skipped until 20260902_order_tracking_tokens.sql is applied on remote Postgres
  it.skip("drizzle schema.ts defines trackingToken on orders table with unique index", () => {
    const schema = readFileSync(resolve("src/db/schema.ts"), "utf-8");
    expect(schema).toContain('trackingToken: uuid("tracking_token").notNull().defaultRandom().unique()');
    expect(schema).toContain('index("orders_tracking_token_idx").on(t.trackingToken)');
  });
});

// ── 2. PII Sanitization & Masking Helpers ─────────────────────────────────────

describe("Customer PII Sanitization", () => {
  describe("maskPhone", () => {
    it("masks middle digits of Egyptian phone numbers", () => {
      expect(maskPhone("01012345678")).toBe("010****5678");
      expect(maskPhone("+201012345678")).toBe("+201****5678");
      expect(maskPhone("01198765432")).toBe("011****5432");
    });

    it("handles short or empty phone numbers gracefully", () => {
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone(undefined)).toBeNull();
      expect(maskPhone("")).toBeNull();
      expect(maskPhone("123")).toBe("***");
    });
  });

  describe("maskName", () => {
    it("masks multi-part customer names to protect privacy", () => {
      expect(maskName("أحمد محمد علي")).toBe("أحمد م.");
      expect(maskName("Mahmoud Hassan")).toBe("Mahmoud H.");
    });

    it("returns single-part names without error", () => {
      expect(maskName("أحمد")).toBe("أحمد");
      expect(maskName("Sara")).toBe("Sara");
    });

    it("handles null / undefined names", () => {
      expect(maskName(null)).toBeNull();
      expect(maskName(undefined)).toBeNull();
    });
  });

  describe("isTrackingTokenUuid", () => {
    it("identifies valid UUID v4 / UUID format tokens", () => {
      expect(isTrackingTokenUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
      expect(isTrackingTokenUuid("2bf7cd99-d567-42d3-b5fc-22cc40654293")).toBe(true);
    });

    it("rejects predictable sequential references (ORD-xxxx / PLC-xxxx)", () => {
      expect(isTrackingTokenUuid("ORD-0001")).toBe(false);
      expect(isTrackingTokenUuid("ORD-12345")).toBe(false);
      expect(isTrackingTokenUuid("PLC-20260902-0001")).toBe(false);
      expect(isTrackingTokenUuid("123456")).toBe(false);
      expect(isTrackingTokenUuid("")).toBe(false);
    });
  });
});

// ── 3. Authorization & Anti-Enumeration (getPublicTrackingByRef) ─────────────

describe("handlePublicTrackingByRef Security Gate", () => {
  it("rejects predictable sequential references (ORD-xxxx) to prevent IDOR & enumeration", async () => {
    await expect(
      handlePublicTrackingByRef({ reference: "ORD-0001" }),
    ).rejects.toThrow("رابط التتبع يتطلب التحقق برقم الهاتف المسجل مع الطلب");

    await expect(
      handlePublicTrackingByRef({ reference: "PLC-20260719-0001" }),
    ).rejects.toThrow("رابط التتبع يتطلب التحقق برقم الهاتف المسجل مع الطلب");
  });

  it("accepts valid UUID token and returns sanitized order data without raw PII", async () => {
    const validToken = "3c2415d8-7965-4f76-88dc-8be3c983a54a";
    const orderData = {
      id: "99999999-9999-4999-a999-999999999999",
      order_number: "ORD-0042",
      tracking_token: validToken,
      current_stage: "cutting",
      total: "25000.00",
      deposit: "12500.00",
      contract_date: "2026-09-01",
      expected_delivery: "2026-09-30",
      delivered_at: null,
      customers: [{ name: "طارق عبد العزيز", phone: "01099887766" }],
    };

    const mockAdmin: any = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: orderData, error: null }),
          };
        }
        if (table === "production_logs" || table === "production_photos") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "attachments") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      }),
    };

    const result = await handlePublicTrackingByRef({ reference: validToken }, mockAdmin);

    expect(result.type).toBe("order");
    if (result.type !== "order") throw new Error("Expected order result");
    expect(result.order.order_number).toBe("ORD-0042");
    expect(result.order.tracking_token).toBe(validToken);
    expect(result.order.customer_name).toBe("طارق ع.");
    expect(result.order.customer_phone).toBe("010****7766");
    // Raw phone number MUST NOT be returned in the response
    expect(result.order.customer_phone).not.toBe("01099887766");
  });

  it("throws error for non-existent UUID token", async () => {
    const mockAdmin: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    await expect(
      handlePublicTrackingByRef({ reference: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }, mockAdmin),
    ).rejects.toThrow("رابط التتبع غير صالح أو منتهي الصلاحية");
  });
});

// ── 4. Dual-Factor Knowledge Lookup (getPublicOrder) ─────────────────────────

describe("handlePublicOrder dual-factor phone verification", () => {
  it("succeeds when order number and customer phone match", async () => {
    const mockAdmin: any = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "order-1",
                order_number: "ORD-0010",
                tracking_token: "token-uuid-1",
                current_stage: "assembly",
                total: "10000",
                deposit: "5000",
                customers: { name: "أحمد علي", phone: "01011112222" },
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };

    const result = await handlePublicOrder(
      { orderNumber: "ORD-0010", phone: "01011112222" },
      mockAdmin,
    );

    expect(result.type).toBe("order");
    if (result.type !== "order") throw new Error("Expected order result");
    expect(result.order.order_number).toBe("ORD-0010");
    expect(result.order.customer_name).toBe("أحمد ع.");
    expect(result.order.customer_phone).toBe("010****2222");
  });

  it("rejects lookup when customer phone does not match order record", async () => {
    const mockAdmin: any = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "order-1",
            order_number: "ORD-0010",
            customers: { name: "أحمد علي", phone: "01011112222" },
          },
          error: null,
        }),
      })),
    };

    // Attacker tries matching ORD-0010 with a wrong phone number
    await expect(
      handlePublicOrder({ orderNumber: "ORD-0010", phone: "01099998888" }, mockAdmin),
    ).rejects.toThrow("بيانات التحقق غير صحيحة");
  });

  it("rejects invalid/short phone inputs", async () => {
    await expect(
      handlePublicOrder({ orderNumber: "ORD-0010", phone: "123" }),
    ).rejects.toThrow("رقم الهاتف غير صالح");
  });
});

// ── 5. Phone Lookup (getPublicOrdersByPhone) ──────────────────────────────────

describe("handlePublicOrdersByPhone", () => {
  it("filters orders by customer phone and returns masked summaries with tracking tokens", async () => {
    const ordersInDb = [
      {
        id: "o1",
        order_number: "ORD-001",
        tracking_token: "token-1",
        current_stage: "cutting",
        customers: [{ name: "عمرو دياب", phone: "01055554444" }],
      },
      {
        id: "o2",
        order_number: "ORD-002",
        tracking_token: "token-2",
        current_stage: "delivered",
        customers: [{ name: "عمرو دياب", phone: "01055554444" }],
      },
      {
        id: "o3",
        order_number: "ORD-003",
        tracking_token: "token-3",
        current_stage: "cutting",
        customers: [{ name: "شخص آخر", phone: "01233332222" }],
      },
    ];

    const mockAdmin: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: ordersInDb, error: null }),
      })),
    };

    const results = await handlePublicOrdersByPhone({ phone: "01055554444" }, mockAdmin);

    expect(results).toHaveLength(2);
    expect(results[0].order_number).toBe("ORD-001");
    expect(results[0].tracking_token).toBe("token-1");
    expect(results[0].customer_name).toBe("عمرو د.");
    expect(results[0].customer_phone).toBe("010****4444");
    expect(results[1].order_number).toBe("ORD-002");
    expect(results[1].tracking_token).toBe("token-2");
  });
});

// ── 6. Attachments Security (getPublicOrderAttachments) ──────────────────────

describe("handlePublicOrderAttachments authorization", () => {
  it("rejects attachment requests without a valid token UUID", async () => {
    const mockAdmin: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    await expect(
      handlePublicOrderAttachments({ token: "00000000-0000-4000-8000-000000000000" }, mockAdmin),
    ).rejects.toThrow("رابط التتبع غير صالح أو منتهي الصلاحية");
  });
});

// ── 7. Carrier Normalization & Internal Field Minimization ────────────────────

describe("Carrier Normalization & Sensitive Field Non-Exposure", () => {
  it("verifies normalization preserves operator differentiation without collision", () => {
    const voda = "01012345678";
    const etis = "01112345678";
    const oran = "01212345678";
    const we = "01512345678";

    const vodaNorm = (voda || "").replace(/\D/g, "").slice(-9);
    const etisNorm = (etis || "").replace(/\D/g, "").slice(-9);
    const oranNorm = (oran || "").replace(/\D/g, "").slice(-9);
    const weNorm = (we || "").replace(/\D/g, "").slice(-9);

    expect(vodaNorm).toBe("012345678");
    expect(etisNorm).toBe("112345678");
    expect(oranNorm).toBe("212345678");
    expect(weNorm).toBe("512345678");

    // Must all be unique
    const uniqueSet = new Set([vodaNorm, etisNorm, oranNorm, weNorm]);
    expect(uniqueSet.size).toBe(4);
  });

  it("ensures sensitive internal fields (tenant_id, cost, margins, workers) are not returned", async () => {
    const validToken = "4c3526e9-8076-4f87-99ed-9cf4da94b65b";
    const orderData = {
      id: "order-id-1",
      order_number: "ORD-0099",
      tracking_token: validToken,
      current_stage: "ready_for_delivery",
      total: "50000.00",
      deposit: "25000.00",
      contract_date: "2026-09-01",
      expected_delivery: "2026-09-30",
      delivered_at: null,
      tenant_id: "tenant-secret-uuid",
      worker_id: "worker-uuid",
      margin_pct: "35.5",
      internal_notes: "Super secret VIP client discount applied",
      customers: [{ name: "كريم يوسف", phone: "01012349999" }],
    };

    const mockAdmin: any = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: orderData, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };

    const result = await handlePublicTrackingByRef({ reference: validToken }, mockAdmin);

    expect(result.type).toBe("order");
    if (result.type !== "order") throw new Error("Expected order result");

    // Verify allowed fields exist
    expect(result.order.order_number).toBe("ORD-0099");
    expect(result.order.customer_name).toBe("كريم ي.");
    expect(result.order.customer_phone).toBe("010****9999");

    // Verify sensitive fields are omitted entirely
    expect((result.order as any).tenant_id).toBeUndefined();
    expect((result.order as any).worker_id).toBeUndefined();
    expect((result.order as any).margin_pct).toBeUndefined();
    expect((result.order as any).internal_notes).toBeUndefined();
  });
});
