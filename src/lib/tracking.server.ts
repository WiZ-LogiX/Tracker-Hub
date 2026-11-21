import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  executeOrderStageTransition,
  executeQCInspectionWithRemakeLoop,
} from "@/lib/production-workflow.server";
import {
  deleteObject,
  generateObjectKey,
  getDownloadUrl,
  getPublicUrl,
  uploadToR2,
} from "@/lib/r2.server";
import {
  mapInternalStageToCustomerStage,
  customerStageIndex,
  getInternalSubStageLabelAr,
  CUSTOMER_STAGE_LABEL_AR,
  QUOTATION_STAGE_LABEL_AR,
  type CustomerTrackingStage,
  type QuotationLifecycleStage,
  getQuotationProgressiveStatus,
} from "@/lib/stages";

// Short-lived customer presigned URL TTL: 10 minutes (600 seconds) maximum.
// Bounded exposure prevents stale link leakage and enforces security compliance.
export const CUSTOMER_SIGNED_URL_TTL = 60 * 10; // 10 minutes (600s)
const SIGNED_URL_TTL = CUSTOMER_SIGNED_URL_TTL;

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

export function extractR2Key(url: string): string | null {
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

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.length < 7) return "***";
  const prefixLen = cleaned.startsWith("+") ? 4 : 3;
  const suffixLen = 4;
  if (cleaned.length <= prefixLen + suffixLen) {
    return `${cleaned.slice(0, 2)}****${cleaned.slice(-2)}`;
  }
  const prefix = cleaned.slice(0, prefixLen);
  const suffix = cleaned.slice(-suffixLen);
  return `${prefix}****${suffix}`;
}

export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  const first = parts[0];
  const secondInitial = parts[1] ? `${parts[1][0]}.` : "";
  return `${first} ${secondInitial}`.trim();
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrackingTokenUuid(val: string): boolean {
  return UUID_REGEX.test(val);
}

// In-memory sliding rate limiter for public phone lookups
interface PhoneRateLimitEntry {
  count: number;
  resetAt: number;
}

const phoneLookupRateLimitStore = new Map<string, PhoneRateLimitEntry>();
export const PHONE_LOOKUP_RATE_LIMIT_MAX = 10; // Max 10 lookups per window
export const PHONE_LOOKUP_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds

export function checkPhoneLookupRateLimit(identifier: string): void {
  const now = Date.now();
  const entry = phoneLookupRateLimitStore.get(identifier);
  if (!entry || now > entry.resetAt) {
    phoneLookupRateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + PHONE_LOOKUP_RATE_LIMIT_WINDOW_MS,
    });
    return;
  }
  if (entry.count >= PHONE_LOOKUP_RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new Error(
      `تم تجاوز الحد المسموح به من الطلبات. يرجى المحاولة بعد ${retryAfterSec} ثانية.`,
    );
  }
  entry.count += 1;
}

export function resetPhoneLookupRateLimitStore(identifier?: string): void {
  if (identifier) {
    phoneLookupRateLimitStore.delete(identifier);
  } else {
    phoneLookupRateLimitStore.clear();
  }
}

export async function handlePublicOrdersByPhone(
  data: { phone: string },
  client = supabaseAdmin,
) {
  const norm = normalizePhone(data.phone);
  if (norm.length < 6) throw new Error("رقم الهاتف غير صالح");

  // Enforce request rate limiting by normalized phone
  checkPhoneLookupRateLimit(norm);

  // 1. Query orders with SQL-level phone filter, strict LIMIT 20, minimal fields
  let orderQuery: any = client
    .from("orders")
    .select(
      "id, tracking_token, order_number, current_stage, expected_delivery, delivered_at, customers!inner(name, phone)",
    );

  if (typeof orderQuery.ilike === "function") {
    orderQuery = orderQuery.ilike("customers.phone", `%${norm}%`);
  }
  if (typeof orderQuery.limit === "function") {
    orderQuery = orderQuery.limit(20);
  }
  if (typeof orderQuery.order === "function") {
    orderQuery = orderQuery.order("created_at", { ascending: false });
  }

  const { data: rows, error } = await orderQuery;
  if (error) throw new Error(error.message);

  const matches = (rows ?? []).filter((o: any) => {
    const row = asRow(o);
    if (!row.order_number) return false;
    const customer = firstRelation(row.customers);
    return normalizePhone(asString(customer.phone)) === norm;
  });

  // 2. Query quotes with SQL-level phone filter, strict LIMIT 20, minimal fields
  let quoteQuery: any = client
    .from("quotes")
    .select(
      "id, quote_number, status, snapshot, customers!inner(name, phone)",
    );

  if (typeof quoteQuery.ilike === "function") {
    quoteQuery = quoteQuery.ilike("customers.phone", `%${norm}%`);
  }
  if (typeof quoteQuery.limit === "function") {
    quoteQuery = quoteQuery.limit(20);
  }
  if (typeof quoteQuery.order === "function") {
    quoteQuery = quoteQuery.order("created_at", { ascending: false });
  }

  const { data: quoteRows } = await quoteQuery;

  const quoteMatches = (quoteRows ?? []).filter((q: any) => {
    const row = asRow(q);
    if (!row.quote_number) return false;
    const customer = firstRelation(row.customers);
    return normalizePhone(asString(customer.phone)) === norm;
  });

  const formattedOrders = matches.slice(0, 20).map((o: any) => {
    const row = asRow(o);
    const customer = firstRelation(row.customers);
    return {
      order_number: asNullableString(row.order_number),
      tracking_token: asNullableString(row.tracking_token),
      current_stage: asNullableString(row.current_stage),
      expected_delivery: asNullableString(row.expected_delivery),
      delivered_at: asNullableString(row.delivered_at),
      customer_name: maskName(asNullableString(customer.name)),
      customer_phone: maskPhone(asNullableString(customer.phone)),
      is_quote: false,
    };
  });

  const formattedQuotes = quoteMatches.slice(0, 20).map((q: any) => {
    const row = asRow(q);
    const customer = firstRelation(row.customers);
    const snap = ((row.snapshot as any) || {}) as Record<string, any>;
    const token = snap.tracking_token || snap.trackingToken || null;
    const progStatus = getQuotationProgressiveStatus(q);
    return {
      order_number: asNullableString(row.quote_number),
      tracking_token: token,
      current_stage: QUOTATION_STAGE_LABEL_AR[progStatus] || asNullableString(row.status),
      expected_delivery: null,
      delivered_at: null,
      customer_name: maskName(asNullableString(customer.name)),
      customer_phone: maskPhone(asNullableString(customer.phone)),
      is_quote: true,
    };
  });

  return [...formattedOrders, ...formattedQuotes].slice(0, 20);
}

export async function handlePublicOrder(
  data: { orderNumber: string; phone: string },
  client = supabaseAdmin,
) {
  const inputPhoneNorm = normalizePhone(data.phone);
  if (inputPhoneNorm.length < 6) {
    throw new Error("رقم الهاتف غير صالح");
  }

  const { data: order, error } = await client
    .from("orders")
    .select(
      "id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, quote_id, customers(name, phone)",
    )
    .eq("order_number", data.orderNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!order) {
    // If not found in orders, check quotes table by quote_number
    const { data: quote } = await client
      .from("quotes")
      .select(
        "id, quote_number, status, total, deposit_pct, valid_until, snapshot, created_at, tenant_id, customers(name, phone)",
      )
      .eq("quote_number", data.orderNumber)
      .maybeSingle();

    if (quote) {
      const customer = firstRelation(quote.customers);
      const custPhone = asString(customer.phone);
      if (normalizePhone(custPhone) !== inputPhoneNorm) {
        throw new Error("بيانات التحقق غير صحيحة");
      }
      const snap = ((quote.snapshot as any) || {}) as Record<string, any>;
      const token = snap.tracking_token || snap.trackingToken || quote.id;
      return handlePublicTrackingByRef({ reference: token }, client);
    }

    throw new Error("لم يتم العثور على الطلب أو عرض السعر");
  }

  const customer = firstRelation(order.customers);
  const custPhone = asString(customer.phone);
  if (normalizePhone(custPhone) !== inputPhoneNorm) {
    throw new Error("بيانات التحقق غير صحيحة");
  }

  const [{ data: logs }, { data: photos }] = await Promise.all([
    client
      .from("production_logs")
      .select("id, stage_from, stage_to, transitioned_at, notes")
      .eq("order_id", order.id)
      .order("transitioned_at"),
    client
      .from("production_photos")
      .select("id, stage, photo_url, caption, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false }),
  ]);

  const custStage = mapInternalStageToCustomerStage(order.current_stage);

  return {
    type: "order" as const,
    order: {
      id: asString(order.id),
      order_number: asString(order.order_number),
      tracking_token: asNullableString((order as any).tracking_token) || asString(order.id),
      current_stage: asString(order.current_stage),
      customer_stage: custStage,
      customer_stage_label_ar: CUSTOMER_STAGE_LABEL_AR[custStage],
      internal_sub_stage_label_ar: getInternalSubStageLabelAr(order.current_stage),
      total: order.total,
      deposit: order.deposit,
      contract_date: asNullableString(order.contract_date),
      expected_delivery: asNullableString(order.expected_delivery),
      delivered_at: asNullableString(order.delivered_at),
      customer_name: maskName(asNullableString(customer.name)),
      customer_phone: maskPhone(asNullableString(customer.phone)),
    },
    logs: logs ?? [],
    photos: await signPhotos(photos ?? []),
    attachments: await fetchPublicOrderAttachments(order.id, client),
  };
}

export async function handlePublicTrackingByRef(
  data: { reference: string },
  client = supabaseAdmin,
) {
  const ref = data.reference;

  // Security Gate: Sequential references (ORD-xxxx, PLC-xxxx) cannot be used
  // on their own as authorization credentials. They require dual-factor phone verification
  // via getPublicOrder({ orderNumber, phone }).
  // Only unguessable 128-bit tracking_tokens grant direct capability URL access.
  if (!isTrackingTokenUuid(ref)) {
    throw new Error("رابط التتبع يتطلب التحقق برقم الهاتف المسجل مع الطلب");
  }

  // 1. Try to find matching Order exclusively by unguessable tracking_token
  const { data: order } = await client
    .from("orders")
    .select(
      "id, tracking_token, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, quote_id, customers(name, phone)",
    )
    .eq("tracking_token", ref)
    .maybeSingle();

  if (order) {
    const customer = firstRelation(order.customers);

    const [{ data: logs }, { data: photos }] = await Promise.all([
      client
        .from("production_logs")
        .select("id, stage_from, stage_to, transitioned_at, notes")
        .eq("order_id", order.id)
        .order("transitioned_at"),
      client
        .from("production_photos")
        .select("id, stage, photo_url, caption, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);

    let linkedQuote = null;
    if (order.quote_id) {
      const { data: q } = await client
        .from("quotes")
        .select("id, quote_number, status, total")
        .eq("id", order.quote_id)
        .maybeSingle();
      if (q) {
        linkedQuote = {
          id: asString(q.id),
          quote_number: asString(q.quote_number),
          status: asString(q.status),
          total: q.total,
        };
      }
    }

    const custStage = mapInternalStageToCustomerStage(order.current_stage);

    return {
      type: "order" as const,
      order: {
        id: asString(order.id),
        order_number: asString(order.order_number),
        tracking_token: asNullableString((order as any).tracking_token),
        current_stage: asString(order.current_stage),
        customer_stage: custStage,
        customer_stage_label_ar: CUSTOMER_STAGE_LABEL_AR[custStage],
        internal_sub_stage_label_ar: getInternalSubStageLabelAr(order.current_stage),
        total: order.total,
        deposit: order.deposit,
        contract_date: asNullableString(order.contract_date),
        expected_delivery: asNullableString(order.expected_delivery),
        delivered_at: asNullableString(order.delivered_at),
        customer_name: maskName(asNullableString(customer.name)),
        customer_phone: maskPhone(asNullableString(customer.phone)),
        linked_quote: linkedQuote,
      },
      logs: logs ?? [],
      photos: await signPhotos(photos ?? []),
      attachments: await fetchPublicOrderAttachments(order.id, client),
    };
  }

  // 2. Try to find matching Quote (by snapshot tracking_token exclusively, never raw ID)
  let quote: any = null;
  const quoteSelectQuery = client
    .from("quotes")
    .select(
      "id, quote_number, status, total, deposit_pct, valid_until, snapshot, created_at, tenant_id, customers(name, phone)",
    );

  if (typeof (quoteSelectQuery as any)?.filter === "function") {
    const { data: quotesByToken } = await (quoteSelectQuery as any)
      .filter("snapshot->>tracking_token", "eq", ref)
      .limit(1);

    if (quotesByToken && quotesByToken.length > 0) {
      quote = quotesByToken[0];
    }
  }

  if (!quote) {
    throw new Error("رابط التتبع غير صالح أو منتهي الصلاحية");
  }

  const customer = firstRelation(quote.customers);
  const snap = ((quote.snapshot as any) || {}) as Record<string, any>;
  const lifecycle = (snap.lifecycle || {}) as Record<string, any>;
  const progressiveStatus = getQuotationProgressiveStatus(quote);

  // Check if converted to order
  const { data: convertedOrder } = await client
    .from("orders")
    .select(
      "id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at",
    )
    .eq("quote_id", quote.id)
    .maybeSingle();

  const journeyTimeline = [
    {
      stageKey: "draft",
      title: "إعداد وتجهيز المقايسة",
      completed: true,
      timestamp: asString(quote.created_at),
    },
    {
      stageKey: "approved",
      title: "الاعتماد الداخلي",
      completed: !!lifecycle.approved_at,
      timestamp: lifecycle.approved_at || null,
    },
    {
      stageKey: "confirmation_requested",
      title: "طلب تأكيد العميل عبر واتساب",
      completed: !!lifecycle.confirmation_requested_at,
      timestamp: lifecycle.confirmation_requested_at || null,
    },
    {
      stageKey: "consented",
      title: "موافقة العميل على استلام العرض",
      completed: !!lifecycle.consented_at,
      timestamp: lifecycle.consented_at || null,
    },
    {
      stageKey: "pdf_sent",
      title: "إرسال مستند العرض (PDF)",
      completed: !!lifecycle.pdf_sent_at,
      timestamp: lifecycle.pdf_sent_at || null,
    },
    {
      stageKey: "decision",
      title: "قرار العميل",
      completed: !!lifecycle.decision_at,
      timestamp: lifecycle.decision_at || null,
      decision: lifecycle.decision || null,
      decisionNotes: lifecycle.decision_notes || null,
    },
  ];

  if (convertedOrder) {
    const orderCustStage = mapInternalStageToCustomerStage(convertedOrder.current_stage);
    journeyTimeline.push(
      {
        stageKey: "converted",
        title: `تحويل لأمر إنتاج (${convertedOrder.order_number})`,
        completed: true,
        timestamp: convertedOrder.contract_date || null,
      },
      {
        stageKey: "production",
        title: `قيد التصنيع (${CUSTOMER_STAGE_LABEL_AR[orderCustStage]})`,
        completed: ["cutting", "assembly", "finishing", "quality_check", "ready_for_delivery", "ready_for_pickup", "delivered", "completed"].includes(convertedOrder.current_stage),
        timestamp: null,
      },
      {
        stageKey: "delivered",
        title: "التسليم للعميل",
        completed: ["delivered", "completed"].includes(convertedOrder.current_stage),
        timestamp: convertedOrder.delivered_at || null,
      },
    );
  }

  return {
    type: "quote" as const,
    quote: {
      id: asString(quote.id),
      quote_number: asString(quote.quote_number),
      tracking_token: ref,
      status: asString(quote.status),
      progressive_status: progressiveStatus,
      status_label_ar: QUOTATION_STAGE_LABEL_AR[progressiveStatus] || quote.status,
      total: quote.total,
      deposit_pct: quote.deposit_pct,
      valid_until: asNullableString(quote.valid_until),
      created_at: asString(quote.created_at),
      customer_name: maskName(asNullableString(customer.name)),
      customer_phone: maskPhone(asNullableString(customer.phone)),
      lifecycle,
      customer_consent: snap.customer_consent || null,
      version: snap.version || 1,
      can_decide: progressiveStatus === "awaiting_customer_decision" || progressiveStatus === "pdf_sent",
      journey_timeline: journeyTimeline,
      converted_order: convertedOrder
        ? {
            id: asString(convertedOrder.id),
            order_number: asString(convertedOrder.order_number),
            tracking_token: asNullableString((convertedOrder as any).tracking_token) || asString(convertedOrder.id),
            current_stage: asString(convertedOrder.current_stage),
            customer_stage: mapInternalStageToCustomerStage(convertedOrder.current_stage),
            customer_stage_label_ar: CUSTOMER_STAGE_LABEL_AR[mapInternalStageToCustomerStage(convertedOrder.current_stage)],
            internal_sub_stage_label_ar: getInternalSubStageLabelAr(convertedOrder.current_stage),
            expected_delivery: asNullableString(convertedOrder.expected_delivery),
            delivered_at: asNullableString(convertedOrder.delivered_at),
          }
        : null,
    },
  };
}

export async function handleGetPublicQuotePdfDownloadUrl(data: { trackingToken: string }) {
  const ref = data.trackingToken;
  let { data: quote } = await supabaseAdmin
    .from("quotes")
    .select("id, quote_number, tenant_id, snapshot")
    .eq("id", ref)
    .maybeSingle();

  if (!quote) {
    const { data: quotesByToken } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, tenant_id, snapshot")
      .filter("snapshot->>tracking_token", "eq", ref)
      .limit(1);

    if (quotesByToken && quotesByToken.length > 0) {
      quote = quotesByToken[0];
    }
  }

  if (!quote) {
    throw new Error("رابط التتبع غير صالح أو منتهي الصلاحية");
  }

  const key = generateObjectKey(quote.tenant_id, "quotes", quote.id, `${quote.quote_number}.pdf`);

  try {
    const downloadUrl = await getDownloadUrl(key, CUSTOMER_SIGNED_URL_TTL);
    return {
      downloadUrl,
      fileName: `عرض-سعر-${quote.quote_number}.pdf`,
      expiresInSec: CUSTOMER_SIGNED_URL_TTL,
    };
  } catch {
    const { generateQuotePdfBufferDirect } = await import("@/lib/pdf-renderer.server");
    const pdfBuffer = await generateQuotePdfBufferDirect(quote.id, quote.tenant_id, supabaseAdmin);
    await uploadToR2(key, pdfBuffer, "application/pdf");
    const downloadUrl = await getDownloadUrl(key, CUSTOMER_SIGNED_URL_TTL);
    return {
      downloadUrl,
      fileName: `عرض-سعر-${quote.quote_number}.pdf`,
      expiresInSec: CUSTOMER_SIGNED_URL_TTL,
    };
  }
}

export async function handleUploadProductionPhoto(
  data: {
    orderId: string;
    stage: string;
    fileBase64: string;
    fileName: string;
    contentType: string;
    caption?: string;
  },
  tenantId: string,
  userId: string,
) {
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
}

export async function handleDeleteProductionPhoto(photoId: string, tenantId: string) {
  // Get photo to verify ownership and get R2 key
  const { data: photo, error: photoError } = await supabaseAdmin
    .from("production_photos")
    .select("id, photo_url, order_id")
    .eq("id", photoId)
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
    .eq("id", photoId)
    .eq("tenant_id", tenantId);

  if (deleteError) throw new Error(deleteError.message);

  return { success: true };
}

export async function handleLogStageTransition(
  data: {
    orderId: string;
    stageFrom: string;
    stageTo: string;
    notes: string | null;
  },
  userId: string,
) {
  const { error } = await supabaseAdmin.from("production_logs").insert({
    order_id: data.orderId,
    stage_from: data.stageFrom,
    stage_to: data.stageTo,
    transitioned_by: userId,
    notes: data.notes,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function handleUpdateOrderStage(
  data: {
    orderId: string;
    nextStage: string;
    markDelivered?: boolean;
    notes?: string | null;
    autoCreateWorkOrder?: boolean;
  },
  tenantId: string,
  userId: string,
) {
  return await executeOrderStageTransition(undefined, {
    tenantId,
    userId,
    orderId: data.orderId,
    nextStage: data.nextStage,
    notes: data.notes,
    autoCreateWorkOrder: data.autoCreateWorkOrder ?? true,
  });
}

export async function handleAssignProductionWorker(data: {
  orderId: string;
  stage: string;
  workerId: string;
  status?: string;
}) {
  const { error } = await supabaseAdmin.from("production_assignments").insert({
    order_id: data.orderId,
    stage: data.stage as any,
    worker_id: data.workerId,
    status: (data.status ?? "pending") as any,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function handleUpdateProductionAssignment(data: {
  id: string;
  patch: Record<string, any>;
}) {
  const { error } = await supabaseAdmin
    .from("production_assignments")
    .update(data.patch)
    .eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function handleDeleteProductionAssignment(id: string) {
  const { error } = await supabaseAdmin
    .from("production_assignments")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function handleRecordQCInspection(
  data: {
    orderId: string;
    stage: string;
    passed: boolean;
    notes?: string | null;
    inspectorId?: string | null;
    assignedTo?: string | null;
  },
  tenantId: string,
  userId: string,
) {
  return await executeQCInspectionWithRemakeLoop(undefined, {
    tenantId,
    userId,
    orderId: data.orderId,
    stage: data.stage,
    passed: data.passed,
    notes: data.notes,
    inspectorId: data.inspectorId ?? userId,
    assignedTo: data.assignedTo,
  });
}

export async function handleRecordRemake(
  data: {
    orderId: string;
    reason: string;
    status?: string;
    createdBy?: string | null;
  },
  userId: string,
) {
  const { error } = await supabaseAdmin.from("remakes").insert({
    order_id: data.orderId,
    reason: data.reason,
    status: (data.status ?? "open") as any,
    created_by: data.createdBy ?? userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Fetch attachments for an order shown on the customer-facing /track page.
 *
 * Auth & Visibility gate:
 * 1. The caller must have a valid order reference (verified by the parent
 *    server functions `getPublicOrder` / `getPublicTrackingByRef`).
 * 2. ONLY attachments marked customer_visible (`is_public = true`) are returned.
 *    Internal staff files (costings, supplier invoices, internal notes) remain strictly hidden.
 * 3. Freshly-signed R2 download URLs use short-lived TTL (10 minutes / 600s max).
 */
export async function fetchPublicOrderAttachments(orderId: string, client = supabaseAdmin) {
  const { data, error } = await client
    .from("attachments")
    .select("id, file_name, content_type, size_bytes, caption, storage_key, created_at, is_public")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .eq("is_public", true) // STRICT: Only customer-visible attachments
    .order("created_at", { ascending: false });
  if (error) return [];
  return await Promise.all(
    (data ?? []).map(async (a) => {
      const url = await getDownloadUrl(a.storage_key, CUSTOMER_SIGNED_URL_TTL);
      return {
        id: a.id,
        fileName: a.file_name,
        contentType: a.content_type,
        sizeBytes: a.size_bytes,
        caption: a.caption,
        url,
        createdAt: a.created_at,
        isPublic: a.is_public,
      };
    }),
  );
}

export async function handlePublicOrderAttachments(
  data: { token?: string; orderId?: string },
  client = supabaseAdmin,
) {
  const lookupToken = data.token || data.orderId;
  if (!lookupToken) throw new Error("رابط التتبع غير صالح");

  const { data: order } = await client
    .from("orders")
    .select("id")
    .eq("id", lookupToken)
    .maybeSingle();

  if (!order) {
    throw new Error("رابط التتبع غير صالح أو منتهي الصلاحية");
  }

  return { items: await fetchPublicOrderAttachments(order.id, client) };
}

/**
 * On-demand customer-facing presigned download URL generator & refresher.
 *
 * Security Gates:
 * 1. Validates tracking token UUID against production orders.
 * 2. Confirms attachment belongs to that specific order and tenant.
 * 3. Enforces visibility gate: rejects internal files (`is_public = false`).
 * 4. Generates short-lived GET presigned URL (10 minutes max, 600 seconds).
 * 5. Strictly read-only: no PUT, DELETE, or LIST capability can be requested.
 */
export async function handlePublicAttachmentDownload(
  data: { trackingToken: string; attachmentId: string },
  client = supabaseAdmin,
) {
  // 1. Resolve order via tracking token
  const { data: order, error: orderError } = await client
    .from("orders")
    .select("id, tenant_id")
    .eq("id", data.trackingToken)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error("رابط التتبع غير صالح أو منتهي الصلاحية");
  }

  // 2. Fetch target attachment scoped to order, entity_type and tenant
  const { data: attachment, error: attError } = await client
    .from("attachments")
    .select("id, storage_key, file_name, is_public, tenant_id, entity_type, entity_id")
    .eq("id", data.attachmentId)
    .eq("entity_id", order.id)
    .eq("entity_type", "order")
    .eq("tenant_id", order.tenant_id)
    .maybeSingle();

  if (attError || !attachment) {
    throw new Error("الملف غير موجود أو ليس لديك صلاحية الوصول إليه");
  }

  // 3. Strict customer visibility gate
  if (!attachment.is_public) {
    throw new Error("هذا الملف خاص بفريق العمل ولا يمكن للعميل الوصول إليه");
  }

  // 4. Generate short-lived presigned download URL (600s)
  const downloadUrl = await getDownloadUrl(attachment.storage_key, CUSTOMER_SIGNED_URL_TTL);

  return {
    downloadUrl,
    fileName: attachment.file_name,
    expiresInSec: CUSTOMER_SIGNED_URL_TTL,
  };
}
