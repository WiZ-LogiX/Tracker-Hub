import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log } from "@/lib/log";
import { getStageLabelAr } from "@/lib/stages";
import { templateRender } from "@/lib/template-render";
import type { TenantContext } from "@/lib/tenant-context";
import { buildTrackingLink, type NotifyPayload, type NotifyResult } from "./whatsapp-share.functions";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deliver a payload to the configured n8n webhook with retries.
 *
 * The n8n workflow is expected to fan out to Evolution API (or any other
 * channel the workflow defines). Every attempt is recorded in
 * `notification_log`; failures on the final attempt also land in
 * `notification_dlq` for replay.
 */
export async function deliverToN8n(
  ctx: { tenantId: string; role: string },
  payload: NotifyPayload,
  options?: { dlqOnFail?: boolean },
): Promise<NotifyResult> {
  const dlqOnFail = options?.dlqOnFail !== false;
  const webhook = process.env.N8N_NOTIFY_WEBHOOK_URL;
  const recipient = payload.to.phone ?? payload.to.email ?? "";
  const channel = payload.channels[0] ?? "whatsapp";

  if (!webhook) {
    await supabaseAdmin.from("notification_log").insert({
      tenant_id: ctx.tenantId,
      entity_type: payload.entity.type,
      entity_id: payload.entity.id || null,
      reference: payload.reference,
      event: payload.event,
      channel,
      recipient,
      status: "skipped",
      error_message: "N8N_NOTIFY_WEBHOOK_URL not configured",
      payload,
    });
    return { status: "skipped", reason: "webhook_not_configured" };
  }

  const token = process.env.N8N_WEBHOOK_TOKEN;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Webhook-Token"] = token;

  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      lastStatus = res.status;

      if (res.ok) {
        await supabaseAdmin.from("notification_log").insert({
          tenant_id: ctx.tenantId,
          entity_type: payload.entity.type,
          entity_id: payload.entity.id || null,
          reference: payload.reference,
          event: payload.event,
          channel,
          recipient,
          status: "sent",
          payload,
        });
        return { status: "sent", http: res.status, attempts: attempt };
      }

      lastError = `HTTP ${res.status}: ${await res.text().catch(() => "")}`;
    } catch (err: any) {
      lastError = err?.message ?? String(err);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  // Failed after retries: log + route to DLQ
  await supabaseAdmin.from("notification_log").insert({
    tenant_id: ctx.tenantId,
    entity_type: payload.entity.type,
    entity_id: payload.entity.id || null,
    reference: payload.reference,
    event: payload.event,
    channel,
    recipient,
    status: "failed",
    error_message: lastError,
    payload,
  });

  if (dlqOnFail) {
    await supabaseAdmin.from("notification_dlq").insert({
      tenant_id: ctx.tenantId,
      event: payload.event,
      channel,
      payload,
      error_message: lastError,
    });
  }

  log.error("Notification delivery failed", {
    event: payload.event,
    reference: payload.reference,
    error: lastError,
    attempts: MAX_RETRIES,
  });

  return { status: "failed", http: lastStatus, error: lastError, attempts: MAX_RETRIES };
}

export async function handleSendTrackingWhatsapp(
  client: any,
  ctx: TenantContext,
  data: { orderId?: string; orderNumber?: string; language?: "en" | "fr" | "ar" },
): Promise<NotifyResult> {
  let orderQuery = client
    .from("orders")
    .select("id, order_number, tracking_token, current_stage, expected_delivery, tenant_id, customers(name, phone, email)");

  if (data.orderId) {
    orderQuery = orderQuery.eq("id", data.orderId);
  } else if (data.orderNumber) {
    orderQuery = orderQuery.eq("order_number", data.orderNumber).eq("tenant_id", ctx.tenantId);
  } else {
    throw new Error("Either orderId or orderNumber is required");
  }

  const { data: order } = await orderQuery.maybeSingle();

  if (!order || (order as any).tenant_id !== ctx.tenantId) {
    throw new Error("Order not found or access denied");
  }
  const customer = (order as any).customers as { name?: string; phone?: string; email?: string } | null;
  if (!customer?.phone) {
    return { status: "skipped", reason: "no_customer_phone" } as NotifyResult;
  }

  const language = data.language ?? "ar";
  const channel = "whatsapp";

  // Load template (prefer requested language, fall back to English).
  let { data: tpl } = await client
    .from("notification_templates")
    .select("subject, body")
    .eq("event", "stage_changed")
    .eq("channel", channel)
    .eq("language", language)
    .eq("tenant_id", ctx.tenantId)
    .eq("active", true)
    .maybeSingle();
  if (!tpl) {
    const { data: fallback } = await client
      .from("notification_templates")
      .select("subject, body")
      .eq("event", "stage_changed")
      .eq("channel", channel)
      .eq("language", "en")
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .maybeSingle();
    tpl = fallback;
  }
  if (!tpl) {
    return { status: "skipped", reason: "no_template" } as NotifyResult;
  }

  const orderNumber = (order as any).order_number as string;
  const trackingTokenOrNumber = (order as any).tracking_token || orderNumber;
  const link = buildTrackingLink(trackingTokenOrNumber);
  const vars: Record<string, string> = {
    customer_name: customer.name ?? "",
    reference: orderNumber,
    link,
  };
  if ((order as any).current_stage) vars["stage"] = getStageLabelAr(String((order as any).current_stage));
  if ((order as any).expected_delivery)
    vars["date"] = new Date((order as any).expected_delivery).toLocaleDateString();

  const body = templateRender((tpl as any).body, vars);
  const subject = templateRender((tpl as any).subject ?? "", vars);

  const payload: NotifyPayload = {
    event: "stage_changed",
    reference: orderNumber,
    channels: [channel],
    to: { phone: customer.phone, email: customer.email ?? null },
    subject,
    message: body,
    link,
    locale: language,
    entity: { type: "order", id: (order as any).id },
    extra: { triggered_by: "manual" },
  };

  return deliverToN8n(ctx, payload);
}
