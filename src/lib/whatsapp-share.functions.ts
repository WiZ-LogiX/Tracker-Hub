import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";
import { log } from "@/lib/log";
import { getStageLabelAr } from "@/lib/stages";
import { templateRender } from "@/lib/template-render";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export type NotifyPayload = {
  event: string;
  reference: string;
  channels: string[];
  to: { phone?: string | null; email?: string | null };
  subject?: string;
  message: string;
  link?: string;
  locale: string;
  entity: { type: string; id: string };
  extra?: Record<string, string>;
};

export type NotifyResult =
  | { status: "sent"; http: number; attempts: number }
  | { status: "failed"; http?: number; error?: string; attempts: number; reason?: string }
  | { status: "skipped"; reason: string };

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
 *
 * Required env: `N8N_NOTIFY_WEBHOOK_URL`. Optional: `N8N_WEBHOOK_TOKEN`
 * (sent as `X-Webhook-Token` header). `SITE_URL` is used to build the
 * customer-facing tracking link; falls back to a relative path.
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
      entity_id: payload.entity.id,
      reference: payload.reference,
      event: payload.event,
      channel,
      recipient,
      status: "skipped",
      payload: payload as any,
      error: "N8N_NOTIFY_WEBHOOK_URL not configured",
    });
    return { status: "skipped", reason: "no_webhook" };
  }

  const insertLog = async (status: string, extras: Record<string, unknown> = {}) => {
    await supabaseAdmin.from("notification_log").insert({
      tenant_id: ctx.tenantId,
      entity_type: payload.entity.type,
      entity_id: payload.entity.id,
      reference: payload.reference,
      event: payload.event,
      channel,
      recipient,
      status,
      payload: payload as any,
      ...extras,
    });
  };

  const insertDlq = async (error: string) => {
    await supabaseAdmin.from("notification_dlq").insert({
      tenant_id: ctx.tenantId,
      entity_type: payload.entity.type,
      entity_id: payload.entity.id,
      reference: payload.reference,
      event: payload.event,
      channel,
      recipient,
      payload: payload as any,
      error,
      attempts: MAX_RETRIES,
      last_attempt_at: new Date().toISOString(),
    });
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.N8N_WEBHOOK_TOKEN) headers["X-Webhook-Token"] = process.env.N8N_WEBHOOK_TOKEN;
      const res = await fetch(webhook, { method: "POST", headers, body: JSON.stringify(payload) });
      const respText = await res.text();

      if (res.ok) {
        await insertLog("sent", { response: { status: res.status, body: respText.slice(0, 2000) } });
        return { status: "sent", http: res.status, attempts: attempt };
      }

      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        await insertLog("failed", {
          response: { status: res.status, body: respText.slice(0, 2000) },
          error: `HTTP ${res.status} (non-retryable)`,
        });
        return { status: "failed", http: res.status, attempts: attempt, reason: "non_retryable_http" };
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log.warn("notification retry", { attempt, delay, http: res.status, ref: payload.reference });
        await sleep(delay);
      } else {
        if (dlqOnFail) {
          await insertDlq(`HTTP ${res.status} after ${MAX_RETRIES} attempts`);
        }
        await insertLog("failed", {
          response: { status: res.status, body: respText.slice(0, 2000) },
          error: `HTTP ${res.status} after ${MAX_RETRIES} attempts`,
        });
        log.error("notification DLQ", { ref: payload.reference, http: res.status });
        return { status: "failed", http: res.status, attempts: attempt, reason: "max_retries_exceeded" };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log.warn("notification retry (network)", { attempt, delay, error: msg, ref: payload.reference });
        await sleep(delay);
      } else {
        if (dlqOnFail) {
          await insertDlq(`${msg} after ${MAX_RETRIES} attempts`);
        }
        await insertLog("failed", { error: msg });
        return { status: "failed", error: msg, attempts: attempt, reason: "network" };
      }
    }
  }

  return { status: "failed", attempts: MAX_RETRIES, reason: "unreachable" };
}

function buildTrackingLink(reference: string): string {
  const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) {
    log.warn("SITE_URL not configured — tracking link will be relative (useless in WhatsApp)", { reference });
    return "";
  }
  return `${siteUrl}/track?ref=${encodeURIComponent(reference)}`;
}

/**
 * Manual "send tracking link via WhatsApp" trigger fired from the production
 * tracking order dialog. Goes through the **same n8n webhook** as automatic
 * notifications, so the message is delivered through Evolution API from the
 * configured business number — not the agent's personal one.
 *
 * Reuses the `stage_changed` template + event so the n8n workflow doesn't
 * need a new branch; `extra.triggered_by=manual` lets the analytics / Log
 * tab distinguish manual resends from automatic stage-advance notifications.
 *
 * Only `owner | admin | sales` may fire this — workers / viewers cannot
 * initiate customer contact.
 */
const SendTrackingInput = z.object({
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().trim().min(1).max(64).optional(),
  language: z.enum(["en", "fr", "ar"]).optional(),
});

export const sendTrackingWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => SendTrackingInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin", "sales"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    const client = (context as any).supabase;
    let orderQuery = client
      .from("orders")
      .select("id, order_number, current_stage, expected_delivery, tenant_id, customers(name, phone, email)");

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
    const link = buildTrackingLink(orderNumber);
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
  });
