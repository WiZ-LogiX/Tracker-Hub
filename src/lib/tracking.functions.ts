import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PHOTO_BUCKET = "production-photos";
const SIGNED_URL_TTL = 60 * 30; // 30 minutes

function normalizePhone(p: string) {
  return (p || "").replace(/\D/g, "").slice(-9);
}

function extractObjectPath(url: string): string | null {
  if (!url) return null;
  // Match both public and signed URL shapes
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
  if (m) return decodeURIComponent(m[1]);
  // If it's already a bare object path
  if (!url.startsWith("http")) return url.replace(/^\/+/, "");
  return null;
}

async function signPhotos<T extends { photo_url: string }>(photos: T[]): Promise<T[]> {
  if (!photos.length) return photos;
  const paths = photos.map(p => extractObjectPath(p.photo_url)).filter((x): x is string => !!x);
  if (!paths.length) return photos;
  const { data } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  const byPath = new Map<string, string>();
  (data ?? []).forEach((d: any) => { if (d?.path && d?.signedUrl) byPath.set(d.path, d.signedUrl); });
  return photos.map(p => {
    const path = extractObjectPath(p.photo_url);
    const signed = path ? byPath.get(path) : null;
    return signed ? { ...p, photo_url: signed } : p;
  });
}

export const getPublicOrdersByPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const norm = normalizePhone(data.phone);
    if (norm.length < 6) throw new Error("رقم الهاتف غير صالح");
    const { data: rows } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, current_stage, expected_delivery, delivered_at, customers!inner(name, phone)")
      .order("created_at", { ascending: false })
      .limit(50);
    const matches = (rows ?? []).filter((o: any) => normalizePhone((o.customers as any)?.phone ?? "") === norm);
    return matches.map((o: any) => ({
      order_number: o.order_number,
      current_stage: o.current_stage,
      expected_delivery: o.expected_delivery,
      delivered_at: o.delivered_at,
      customer_name: (o.customers as any)?.name,
    }));
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
      .select("id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name, phone)")
      .eq("order_number", data.orderNumber)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) throw new Error("لم يتم العثور على الأمر");

    const custPhone = (order.customers as any)?.phone ?? "";
    if (normalizePhone(custPhone) !== normalizePhone(data.phone)) {
      throw new Error("رقم الهاتف لا يطابق رقم الأمر");
    }

    const [{ data: logs }, { data: photos }] = await Promise.all([
      supabaseAdmin.from("production_logs")
        .select("id, stage_from, stage_to, transitioned_at, notes")
        .eq("order_id", order.id).order("transitioned_at"),
      supabaseAdmin.from("production_photos")
        .select("id, stage, photo_url, caption, created_at")
        .eq("order_id", order.id).order("created_at", { ascending: false }),
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
        customer_name: (order.customers as any)?.name,
      },
      logs: logs ?? [],
      photos: await signPhotos(photos ?? []),
    };
  });

export const getPublicTrackingByRef = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ reference: z.string().trim().min(3).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const ref = data.reference;
    // Try orders first
    let { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name)")
      .eq("order_number", ref).maybeSingle();

    // Then resolve via quote / invoice / rfq references → linked order if any
    if (!order) {
      const tries: Array<["quotes"|"invoices"|"quote_requests", string]> = [["quotes","quote_number"],["invoices","invoice_number"],["quote_requests","reference_number"]];
      for (const [tbl, col] of tries) {
        const { data: row } = await (supabaseAdmin.from(tbl) as any).select("id").eq(col, ref).maybeSingle();
        if (row) {
          if (tbl === "quote_requests") {
            const { data: q } = await supabaseAdmin.from("quotes").select("id").eq("request_id", (row as any).id).maybeSingle();
            if (q) {
              const { data: o } = await supabaseAdmin.from("orders").select("id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name)").eq("quote_id", (q as any).id).maybeSingle();
              order = o ?? null;
            }
          } else {
            const linkField = tbl === "invoices" ? "invoice_id" : "quote_id";
            const { data: o } = await supabaseAdmin.from("orders").select("id, order_number, current_stage, total, deposit, contract_date, expected_delivery, delivered_at, customers(name)").eq(linkField, (row as any).id).maybeSingle();
            order = o ?? null;
          }
          if (order) break;
        }
      }
    }
    if (!order) throw new Error("Reference not found");

    const [{ data: logs }, { data: photos }] = await Promise.all([
      supabaseAdmin.from("production_logs").select("id, stage_from, stage_to, transitioned_at, notes").eq("order_id", order.id).order("transitioned_at"),
      supabaseAdmin.from("production_photos").select("id, stage, photo_url, caption, created_at").eq("order_id", order.id).order("created_at", { ascending: false }),
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
        customer_name: (order.customers as any)?.name,
      },
      logs: logs ?? [],
      photos: await signPhotos(photos ?? []),
    };
  });
