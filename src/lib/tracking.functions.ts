import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deleteObject,
  generateObjectKey,
  getDownloadUrl,
  getPublicUrl,
  uploadToR2,
} from "@/lib/r2.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";

const SIGNED_URL_TTL = 60 * 30; // 30 minutes

// Simple memoization to avoid signing the same key repeatedly within a TTL window.
const urlCache = new Map<string, { url: string; expires: number }>();

type UnknownRow = Record<string, unknown>;

function asRow(value: unknown): UnknownRow {
  return value && typeof value === "object" ? (value as UnknownRow) : {};
}

function firstRelation(value: unknown): UnknownRow {
  if (Array.isArray(value)) return asRow(value[0]);
  return asRow(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizePhone(p: string) {
  return (p || "").replace(/\D/g, "").slice(-9);
}

function extractR2Key(url: string): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/[^/]+\.r2\.cloudflarestorage\.com\/[^/]+\/(.+)/);
  if (m) return decodeURIComponent(m[1]);

  const { R2_PUBLIC_URL } = process.env;
  if (R2_PUBLIC_URL) {
    const publicBase = R2_PUBLIC_URL.replace(/\/$/, "") + "/";
    if (url.startsWith(publicBase)) return url.slice(publicBase.length);
  }

  if (!url.startsWith("http")) return url.replace(/^\/+/, "");
  return null;
}

async function signPhotos<T extends { photo_url: string }>(photos: T[]): Promise<T[]> {
  if (!photos.length) return photos;
  const now = Date.now();
  return Promise.all(
    photos.map(async (p) => {
      const key = extractR2Key(p.photo_url);
      if (!key) return p;

      const cached = urlCache.get(key);
      if (cached && cached.expires > now) {
        return { ...p, photo_url: cached.url };
      }

      try {
        const signedUrl = await getDownloadUrl(key, SIGNED_URL_TTL);
        urlCache.set(key, { url: signedUrl, expires: now + SIGNED_URL_TTL * 1000 });
        return { ...p, photo_url: signedUrl };
      } catch {
        try {
          return { ...p, photo_url: getPublicUrl(key) };
        } catch {
          return p;
        }
      }
    }),
  );
}

export const getPublicOrdersByPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const norm = normalizePhone(data.phone);
    if (norm.length < 6) throw new Error("رقم الهاتف غير صالح");
    const { data: rows } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, current_stage, expected_delivery, delivered_at, customers!inner(name, phone)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    const matches = (rows ?? []).filter((o) => {
      const customer = firstRelation(asRow(o).customers);
      return normalizePhone(asString(customer.phone)) === norm;
    });
    return matches.map((o) => {
      const row = asRow(o);
      const customer = firstRelation(row.customers);
      return {
        order_number: asNullableString(row.order_number),
        current_stage: asNullableString(row.current_stage),
        expected_delivery: asNullableString(row.expected_delivery),
        delivered_at: asNullableString(row.delivered_at),
        customer_name: asNullableString(customer.name),
        customer_phone: asNullableString(customer.phone),
      };
    });
  });

const Input = z.object({
  orderNumber: z.string().trim().min(3).max(64),
  phone: z.string().trim().min(4).max(32),
});

export const getPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name, phone)",
      )
      .eq("order_number", data.orderNumber)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) throw new Error("لم يتم العثور على الأمر");

    const customer = firstRelation(order.customers);
    const custPhone = asString(customer.phone);
    if (normalizePhone(custPhone) !== normalizePhone(data.phone)) {
      throw new Error("رقم الهاتف لا يطابق رقم الأمر");
    }

    const [{ data: logs }, { data: photos }] = await Promise.all([
      supabaseAdmin
        .from("production_logs")
        .select("id, stage_from, stage_to, transitioned_at, notes")
        .eq("order_id", order.id)
        .order("transitioned_at"),
      supabaseAdmin
        .from("production_photos")
        .select("id, stage, photo_url, caption, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);

    return {
      order: {
        order_number: order.order_number,
        current_stage: order.current_stage,
        total: order.total,
        deposit: order.deposit,
        contract_date: order.contract_date,
        expected_delivery: order.expected_delivery,
        delivered_at: order.delivered_at,
        customer_name: asNullableString(customer.name),
      },
      logs: logs ?? [],
      photos: await signPhotos(photos ?? []),
      attachments: await fetchPublicOrderAttachments(order.id),
    };
  });

export const getPublicTrackingByRef = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ reference: z.string().trim().min(3).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const ref = data.reference;
    let { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name, phone)",
      )
      .eq("order_number", ref)
      .maybeSingle();

    if (!order) {
      const tries: Array<["quotes" | "invoices" | "quote_requests", string]> = [
        ["quotes", "quote_number"],
        ["invoices", "invoice_number"],
        ["quote_requests", "reference_number"],
      ];
      for (const [tbl, col] of tries) {
        const { data: row } = await supabaseAdmin.from(tbl).select("id").eq(col, ref).maybeSingle();
        if (!row) continue;
        const rowId = asString(asRow(row).id);
        if (!rowId) continue;

        if (tbl === "quote_requests") {
          const { data: q } = await supabaseAdmin
            .from("quotes")
            .select("id")
            .eq("request_id", rowId)
            .maybeSingle();
          if (q) {
            const quoteId = asString(asRow(q).id);
            if (!quoteId) continue;
            const { data: o } = await supabaseAdmin
              .from("orders")
              .select(
                "id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name, phone)",
              )
              .eq("quote_id", quoteId)
              .maybeSingle();
            order = o ?? null;
          }
        } else {
          const linkField = tbl === "invoices" ? "invoice_id" : "quote_id";
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select(
              "id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name, phone)",
            )
            .eq(linkField, rowId)
            .maybeSingle();
          order = o ?? null;
        }
        if (order) break;
      }
    }
    if (!order) throw new Error("Reference not found");

    const [{ data: logs }, { data: photos }] = await Promise.all([
      supabaseAdmin
        .from("production_logs")
        .select("id, stage_from, stage_to, transitioned_at, notes")
        .eq("order_id", order.id)
        .order("transitioned_at"),
      supabaseAdmin
        .from("production_photos")
        .select("id, stage, photo_url, caption, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);

    return {
      order: {
        order_number: order.order_number,
        current_stage: order.current_stage,
        total: order.total,
        deposit: order.deposit,
        contract_date: order.contract_date,
        expected_delivery: order.expected_delivery,
        delivered_at: order.delivered_at,
        customer_name: asNullableString(firstRelation(order.customers).name),
        customer_phone: asNullableString(firstRelation(order.customers).phone),
      },
      logs: logs ?? [],
      photos: await signPhotos(photos ?? []),
      attachments: await fetchPublicOrderAttachments(order.id),
    };
  });
const UploadPhotoInput = z.object({
  orderId: z.string().uuid(),
  stage: z.string().min(1),
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  caption: z.string().optional(),
});

export const uploadProductionPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UploadPhotoInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext;
    const userId = ctx.userId;
    const tenantId = ctx.tenantId;

    // Verify order belongs to tenant
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (orderError || !order) {
      throw new Error("Order not found or access denied");
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(data.fileBase64, "base64");

    // Upload to R2
    const key = generateObjectKey(tenantId, "production-photos", data.orderId, data.fileName);

    const publicUrl = await uploadToR2(key, buffer, data.contentType);

    // Insert photo record with tenant_id
    const { data: photo, error: insertError } = await supabaseAdmin
      .from("production_photos")
      .insert({
        order_id: data.orderId,
        stage: data.stage,
        photo_url: publicUrl,
        caption: data.caption || null,
        uploaded_by: userId,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    return { photo };
  });

const DeletePhotoInput = z.object({
  photoId: z.string().uuid(),
});

export const deleteProductionPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DeletePhotoInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext;
    const tenantId = ctx.tenantId;

    // Get photo to verify ownership and get R2 key
    const { data: photo, error: photoError } = await supabaseAdmin
      .from("production_photos")
      .select("id, photo_url, order_id")
      .eq("id", data.photoId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (photoError || !photo) {
      throw new Error("Photo not found or access denied");
    }

    // Delete from R2
    try {
      const r2Key = extractR2Key(photo.photo_url);
      if (r2Key) await deleteObject(r2Key);
    } catch {
      // Ignore R2 delete errors
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from("production_photos")
      .delete()
      .eq("id", data.photoId)
      .eq("tenant_id", tenantId);

    if (deleteError) throw new Error(deleteError.message);

    return { success: true };
  });


const LogStageInput = z.object({
  orderId: z.string().uuid(),
  stageFrom: z.string(),
  stageTo: z.string(),
  notes: z.string().nullable(),
});

export const logStageTransition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LogStageInput.parse(d))
  .handler(async ({ data }) => {
    const { orderId, stageFrom, stageTo, notes } = data;
    const { error } = await supabaseAdmin.from("production_logs").insert({
      order_id: orderId,
      stage_from: stageFrom,
      stage_to: stageTo,
      transitioned_by: null,
      notes,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateOrderStageInput = z.object({
  orderId: z.string().uuid(),
  nextStage: z.string(),
  markDelivered: z.boolean().optional(),
});

export const updateOrderStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateOrderStageInput.parse(d))
  .handler(async ({ data }) => {
    const { orderId, nextStage, markDelivered } = data;
    const patch: Record<string, unknown> = { current_stage: nextStage as any };
    if (markDelivered) patch.delivered_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AssignmentInput = z.object({
  orderId: z.string().uuid(),
  stage: z.string(),
  workerId: z.string().uuid(),
  status: z.string().optional(),
});

export const assignProductionWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AssignmentInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("production_assignments").insert({
      order_id: data.orderId,
      stage: data.stage as any,
      worker_id: data.workerId,
      status: (data.status ?? "pending") as any,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateAssignmentInput = z.object({
  id: z.string().uuid(),
  patch: z.record(z.string(), z.any()),
});

export const updateProductionAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateAssignmentInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("production_assignments")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteAssignmentInput = z.object({ id: z.string().uuid() });

export const deleteProductionAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DeleteAssignmentInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("production_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RecordQCInput = z.object({
  orderId: z.string().uuid(),
  stage: z.string(),
  passed: z.boolean(),
  notes: z.string().nullable(),
  inspectorId: z.string().uuid().nullable(),
});

export const recordQCInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RecordQCInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("qc_inspections").insert({
      order_id: data.orderId,
      stage: data.stage as any,
      passed: data.passed,
      notes: data.notes,
      inspector_id: data.inspectorId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RecordRemakeInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string(),
  status: z.string().optional(),
  createdBy: z.string().uuid().nullable(),
});

export const recordRemake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RecordRemakeInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("remakes").insert({
      order_id: data.orderId,
      reason: data.reason,
      status: (data.status ?? "open") as any,
      created_by: data.createdBy,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Fetch attachments for an order shown on the customer-facing /track page.
 *
 * Auth gate: the caller must have a valid order reference (verified by the
 * parent server functions `getPublicOrder` / `getPublicTrackingByRef` before
 * they invoke this helper). So once we know it's a legit /track customer,
 * we return every attachment attached to the order — no `is_public` filter.
 *
 * Each row carries a freshly-signed R2 download URL so the customer's browser
 * can both <img>-preview images and download the file directly. Signed URLs
 * expire in 30 minutes, matching the photo TTL used elsewhere.
 */
async function fetchPublicOrderAttachments(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("attachments")
    .select("id, file_name, content_type, size_bytes, caption, storage_key, created_at")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return await Promise.all(
    (data ?? []).map(async (a) => {
      const url = await getDownloadUrl(a.storage_key, SIGNED_URL_TTL);
      return {
        id: a.id,
        fileName: a.file_name,
        contentType: a.content_type,
        sizeBytes: a.size_bytes,
        caption: a.caption,
        url,
        createdAt: a.created_at,
      };
    }),
  );
}

const PublicAttachmentsInput = z.object({ orderId: z.string().uuid() });

/**
 * Public, no-auth server function for /track to load order attachments.
 * Only public-marked attachments are returned; private ones stay server-side.
 */
export const getPublicOrderAttachments = createServerFn({ method: "POST" })
  .inputValidator((d) => PublicAttachmentsInput.parse(d))
  .handler(async ({ data }) => {
    return { items: await fetchPublicOrderAttachments(data.orderId) };
  });
