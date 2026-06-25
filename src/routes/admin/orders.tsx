import { useEffect, useState } from "react";
import { useTranslation as _useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ORDER_STAGES, STAGE_LABEL_AR, OrderStage, nextStage, stageIndex, getStageLabelAr } from "@/lib/stages";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { sendNotification } from "@/lib/notifications.functions";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { PhotoUploader } from "@/components/photo-uploader";
import { AttachmentList } from "@/components/attachment-list";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { ShareTrackingLink } from "@/components/share-tracking-link";
import { buildTrackingUrl } from "@/lib/tracking-url";
import { sendTrackingWhatsapp } from "@/lib/whatsapp-share.functions";
import { OrderView, type OrderSummary, type OrderViewData } from "@/components/order-view";
import {
  uploadProductionPhoto,
  deleteProductionPhoto,
  logStageTransition,
  updateOrderStage,
  assignProductionWorker,
  updateProductionAssignment,
  deleteProductionAssignment,
  recordQCInspection,
  recordRemake,
  getPublicOrder,
  getPublicTrackingByRef,
  getPublicOrdersByPhone,
} from "@/lib/tracking.functions";

export const Route = createFileRoute("/admin/orders")({ component: OrdersPage });

function OrdersPage() {
  const { t } = _useTranslation();
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const [refreshAttach, setRefreshAttach] = useState(0);
  const { user } = useAuth();
  const notify = useServerFn(sendNotification);
  const updateStageFn = useServerFn(updateOrderStage);
  const assignWorkerFn = useServerFn(assignProductionWorker);
  const updateAssignmentFn = useServerFn(updateProductionAssignment);
  const deleteAssignmentFn = useServerFn(deleteProductionAssignment);
  const recordQCFn = useServerFn(recordQCInspection);
  const recordRemakeFn = useServerFn(recordRemake);
  const deletePhotoFn = useServerFn(deleteProductionPhoto);
  const fetchPublicOrder = useServerFn(getPublicOrder);
  const fetchByRef = useServerFn(getPublicTrackingByRef);
  const fetchByPhone = useServerFn(getPublicOrdersByPhone);
  const sendTrackingFn = useServerFn(sendTrackingWhatsapp);
  const [sendingTrackingId, setSendingTrackingId] = useState<string | null>(null);

  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackPhoneOnly, setTrackPhoneOnly] = useState("");
  const [trackOrderNumber, setTrackOrderNumber] = useState("");
  const [trackPhone, setTrackPhone] = useState("");
  const [trackMatches, setTrackMatches] = useState<OrderSummary[] | null>(null);
  const [trackResult, setTrackResult] = useState<OrderViewData | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);

  useEffect(() => {
    load();
    loadWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select("*, customers(name,phone)")
      .order("created_at", { ascending: false });
    setOrders(data ?? []);
  }

  async function loadWorkers() {
    const { data } = await supabase
      .from("workers")
      .select("*")
      .eq("active", true)
      .order("name");
    setWorkers(data ?? []);
  }

  async function onTrackPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTrackLoading(true);
    setTrackMatches(null);
    setTrackResult(null);
    try {
      const list: any = await fetchByPhone({ data: { phone: trackPhoneOnly.trim() } });
      const filtered = (list ?? []).filter((m: any) => m.order_number);
      if (!filtered.length) toast.error(t("track.noMatches"));
      setTrackMatches(filtered as OrderSummary[]);
    } catch (err: any) {
      toast.error(err?.message || t("track.searchError"));
    } finally {
      setTrackLoading(false);
    }
  }

  async function onTrackRefSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTrackLoading(true);
    try {
      const r: any = await fetchPublicOrder({
        data: { orderNumber: trackOrderNumber.trim(), phone: trackPhone.trim() },
      });
      setTrackResult(r as OrderViewData);
      setTrackMatches(null);
    } catch (err: any) {
      toast.error(err?.message || t("track.notFound"));
      setTrackResult(null);
    } finally {
      setTrackLoading(false);
    }
  }

  async function openTrackOrderFromList(orderNumber: string) {
    setTrackLoading(true);
    try {
      const r: any = await fetchByRef({ data: { reference: orderNumber } });
      setTrackResult(r as OrderViewData);
      setTrackMatches(null);
    } catch (err: any) {
      toast.error(err?.message || t("track.openError"));
    } finally {
      setTrackLoading(false);
    }
  }

  async function openOrder(o: any) {
    setSelected(o);
    setNote("");
    setCaption("");
    const [{ data: l }, { data: ph }, { data: as }, { data: qc }] = await Promise.all([
      supabase
        .from("production_logs")
        .select("*")
        .eq("order_id", o.id)
        .order("transitioned_at"),
      supabase
        .from("production_photos")
        .select("*")
        .eq("order_id", o.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("production_assignments")
        .select("*, workers(name)")
        .eq("order_id", o.id)
        .order("created_at"),
      supabase
        .from("qc_inspections")
        .select("*")
        .eq("order_id", o.id)
        .order("created_at", { ascending: false }),
    ]);
    setLogs(l ?? []);
    setPhotos(ph ?? []);
    setAssignments(as ?? []);
    setInspections(qc ?? []);
  }

  async function reloadOrderData(orderId: string) {
    const [{ data: ph }, { data: as }, { data: qc }] = await Promise.all([
      supabase
        .from("production_photos")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("production_assignments")
        .select("*, workers(name)")
        .eq("order_id", orderId)
        .order("created_at"),
      supabase
        .from("qc_inspections")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
    ]);
    setPhotos(ph ?? []);
    setAssignments(as ?? []);
    setInspections(qc ?? []);
  }

  async function handlePhotosUploaded(
    results: Array<{ key: string; publicUrl: string; caption: string | null }>,
  ) {
    if (!selected || results.length === 0) return;
    const rows = results.map(r => ({
      order_id: selected.id,
      tenant_id: selected.tenant_id,
      stage: selected.current_stage,
      photo_url: r.publicUrl || (r.key as string),
      caption: r.caption || caption || null,
      uploaded_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("production_photos").insert(rows as any);
    if (error) {
      toast.error(t("orders.uploadError") + ": " + error.message);
      return;
    }
    if (caption) setCaption("");
    await reloadOrderData(selected.id);
  }

  async function deletePhoto(p: any) {
    try {
      await deletePhotoFn({ data: { photoId: p.id } });
      if (selected) await reloadOrderData(selected.id);
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    }
  }

  async function onSendTracking(idOrNumber: string) {
    setSendingTrackingId(idOrNumber);
    try {
      // If it looks like a UUID, pass orderId; otherwise pass orderNumber
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber);
      const params = isUuid
        ? { orderId: idOrNumber }
        : { orderNumber: idOrNumber };
      const result: any = await sendTrackingFn({ data: params });
      if (result?.status === "sent") {
        toast.success(t("track.sentViaN8n") ?? "تم الإرسال عبر n8n");
      } else if (result?.status === "skipped") {
        toast.info(t("track.sendSkipped") ?? "تم التخطي: " + (result.reason ?? ""));
      } else {
        toast.error(t("track.sendFailed") ?? "فشل الإرسال");
      }
    } catch (e: any) {
      toast.error(e?.message || (t("track.sendFailed") ?? "فشل الإرسال"));
    } finally {
      setSendingTrackingId(null);
    }
  }

  async function assignWorker(stage: OrderStage, workerId: string) {
    if (!selected || !workerId) return;
    try {
      await assignWorkerFn({
        data: {
          orderId: selected.id,
          stage: stage as string,
          workerId,
          status: "pending",
        },
      });
      toast.success(t("common.save"));
      await reloadOrderData(selected.id);
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    }
  }

  async function updateAssignment(a: any, patch: any) {
    try {
      await updateAssignmentFn({ data: { id: a.id, patch } });
      await reloadOrderData(selected.id);
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    }
  }

  async function deleteAssignment(a: any) {
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      await deleteAssignmentFn({ data: { id: a.id } });
      await reloadOrderData(selected.id);
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    }
  }

  async function recordQC(stage: OrderStage, passed: boolean, qcNotes: string) {
    if (!selected) return;
    try {
      await recordQCFn({
        data: {
          orderId: selected.id,
          stage: stage as string,
          passed,
          notes: qcNotes || null,
          inspectorId: user?.id ?? null,
        },
      });
      if (!passed) {
        await recordRemakeFn({
          data: {
            orderId: selected.id,
            reason: qcNotes || `QC failed: ${stage}`,
            status: "open",
            createdBy: user?.id ?? null,
          },
        });
        toast.warning(t("orders.qcFail"));
      } else toast.success(t("orders.qcPass"));
      await reloadOrderData(selected.id);
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    }
  }

  function canAdvance(o: any): { ok: boolean; reason?: string } {
    if (o.current_stage === "quality_check") {
      const latest = inspections.find(i => i.stage === "quality_check");
      if (!latest) return { ok: false, reason: t("orders.advanceGate") };
      if (!latest.passed) return { ok: false, reason: t("orders.advanceGate") };
    }
    return { ok: true };
  }

  async function advance(o: any) {
    const next = nextStage(o.current_stage as OrderStage);
    if (!next) return toast.info(t("orders.completed"));
    const gate = canAdvance(o);
    if (!gate.ok) return toast.error(gate.reason!);
    try {
      await updateStageFn({
        data: {
          orderId: o.id,
          nextStage: next as string,
          markDelivered: next === "delivered",
        },
      });
    } catch (e: any) {
      return toast.error(e?.message ?? t("common.error"));
    }
    try {
      await logStageTransition({
        data: {
          orderId: o.id,
          stageFrom: o.current_stage as string,
          stageTo: next as string,
          notes: note || null,
        },
      });
    } catch (e: any) {
      // Log-only stage shouldn't block UI progression
      console.warn("logStageTransition failed:", e?.message ?? e);
    }
    try {
      const event =
        next === "delivered"
          ? "delivered"
          : next === "ready_for_pickup"
          ? "delivery_scheduled"
          : "stage_changed";
      await notify({
        data: {
          event: event as any,
          entityType: "order",
          entityId: o.id,
          extra: { stage: String(next) },
        },
      });
    } catch {
      /* notifications are best-effort */
    }
    toast.success(t("orders.advance", { stage: STAGE_LABEL_AR[next] }));
    await load();
    if (selected?.id === o.id) {
      const updated = (
        await supabase.from("orders").select("*, customers(name,phone)").eq("id", o.id).single()
      ).data;
      openOrder(updated);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t("orders.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("orders.subtitle")}</p>
      </div>

      <Collapsible
        open={trackerOpen}
        onOpenChange={setTrackerOpen}
        className="border rounded-lg bg-muted/20"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-muted/40 transition rounded-lg"
            aria-expanded={trackerOpen}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">
                {t("track.title")}
              </span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                — {t("track.subtitle")}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                trackerOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 space-y-4">
          <div className="grid lg:grid-cols-2 gap-4 pt-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("track.byPhoneTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <form
                  onSubmit={onTrackPhoneSubmit}
                  className="grid sm:grid-cols-3 gap-2 items-end"
                >
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">{t("track.phone")}</Label>
                    <Input
                      size={1}
                      value={trackPhoneOnly}
                      onChange={e =>
                        setTrackPhoneOnly(e.target.value.replace(/[^\d+]/g, ""))
                      }
                      placeholder="01xxxxxxxxx"
                      inputMode="tel"
                      className="h-8 text-sm"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8"
                    disabled={trackLoading}
                  >
                    {trackLoading ? "..." : t("track.search")}
                  </Button>
                </form>
                <p className="text-[10px] text-muted-foreground">
                  {t("track.phoneHint")}
                </p>

                {trackMatches && trackMatches.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[10px] text-muted-foreground">
                      {t("track.resultsCount", { n: trackMatches.length })}
                    </div>
                    {trackMatches.map((m) => (
                      <div
                        key={m.order_number ?? Math.random().toString()}
                        className="border rounded-md p-2 hover:bg-accent transition space-y-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => m.order_number && openTrackOrderFromList(m.order_number)}
                          className="w-full text-right"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-mono">{m.order_number}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {m.customer_name}
                            </span>
                          </div>
                          {m.current_stage && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {t("track.stage")}: {getStageLabelAr(m.current_stage as any)}
                            </div>
                          )}
                        </button>
                        <div className="flex items-center justify-between gap-2 pt-1 border-t">
                          <a
                            href={buildTrackingUrl(m.order_number)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-mono text-muted-foreground truncate hover:text-secondary flex-1 text-left"
                            title={buildTrackingUrl(m.order_number)}
                            dir="ltr"
                          >
                            {buildTrackingUrl(m.order_number)}
                          </a>
                          <ShareTrackingLink
                            url={buildTrackingUrl(m.order_number)}
                            ref={m.order_number}
                            recipientPhone={m.customer_phone ?? null}
                            customerName={m.customer_name ?? null}
                            onWhatsAppSend={() => m.order_number && onSendTracking(m.order_number)}
                            whatsappLoading={sendingTrackingId === m.order_number}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {trackMatches && trackMatches.length === 0 && (
                  <div className="mt-2 text-xs text-muted-foreground text-center py-2 border rounded-md">
                    {t("track.noMatches")}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("track.byRefTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={onTrackRefSubmit}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">{t("track.orderNumber")}</Label>
                    <Input
                      size={1}
                      value={trackOrderNumber}
                      onChange={e => setTrackOrderNumber(e.target.value)}
                      placeholder="ORD-..."
                      className="h-8 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("track.phone")}</Label>
                    <Input
                      size={1}
                      value={trackPhone}
                      onChange={e => setTrackPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      className="h-8 text-sm"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8"
                    disabled={trackLoading}
                  >
                    {trackLoading ? "..." : t("track.track")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {trackResult && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">
                  {t("track.title")}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setTrackResult(null)}
                >
                  ✕ {t("common.cancel")}
                </Button>
              </div>
              <OrderView data={trackResult} />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <div className="grid lg:grid-cols-3 gap-4">
        {ORDER_STAGES.slice(0, -1).map(stage => {
          const ordersInStage = orders.filter(o => o.current_stage === stage);
          if (ordersInStage.length === 0) return null;
          return (
            <Card key={stage}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">{STAGE_LABEL_AR[stage]}</h2>
                  <Badge variant="outline">{ordersInStage.length}</Badge>
                </div>
                {ordersInStage.map(o => (
                  <Dialog key={o.id}>
                    <DialogTrigger asChild>
                      <button
                        onClick={() => openOrder(o)}
                        className="w-full text-right p-3 border rounded-md hover:bg-muted transition"
                      >
                        <div className="font-medium text-sm">{o.customers?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.order_number} • {formatEGP(Number(o.total))}
                        </div>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{o.order_number}</DialogTitle>
                      </DialogHeader>
                      {selected && (
                        <OrderDetail
                          o={selected}
                          logs={logs}
                          photos={photos}
                          assignments={assignments}
                          inspections={inspections}
                          workers={workers}
                          note={note}
                          setNote={setNote}
                          caption={caption}
                          setCaption={setCaption}
                          onAdvance={() => advance(selected)}
                          onPhotosUploaded={handlePhotosUploaded}
                          onDeletePhoto={deletePhoto}
                          onAssign={assignWorker}
                          onUpdateAssignment={updateAssignment}
                          onDeleteAssignment={deleteAssignment}
                          onRecordQC={recordQC}
                          onSendTracking={onSendTracking}
                          sendingTrackingId={sendingTrackingId}
                          t={t}
                          refreshAttach={refreshAttach}
                          triggerRefreshAttach={() => setRefreshAttach((n) => n + 1)}
                        />
                      )}
                    </DialogContent>
                  </Dialog>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {orders.filter(o => o.current_stage === "completed").length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <h2 className="text-lg font-medium">{t("orders.completed")}</h2>
            {orders
              .filter(o => o.current_stage === "completed")
              .map(o => (
                <div
                  key={o.id}
                  className="p-3 border rounded-md text-sm flex justify-between"
                >
                  <div>{o.customers?.name} • {o.order_number}</div>
                  <div className="text-muted-foreground">{formatEGP(Number(o.total))}</div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {orders.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {t("orders.noOrders")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrderDetail({
  o,
  logs,
  photos,
  assignments,
  inspections,
  workers,
  note,
  setNote,
  caption,
  setCaption,
  onAdvance,
  onPhotosUploaded,
  onDeletePhoto,
  onAssign,
  onUpdateAssignment,
  onDeleteAssignment,
  onRecordQC,
  onSendTracking,
  sendingTrackingId,
  t,
  refreshAttach,
  triggerRefreshAttach,
}: any) {
  const idx = stageIndex(o.current_stage);
  const next = nextStage(o.current_stage);
  const gateOk =
    o.current_stage !== "quality_check" ||
    inspections.find((i: any) => i.stage === "quality_check")?.passed;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{t("orders.customer")}</div>
          <div>{o.customers?.name}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("orders.phone")}</div>
          <div>{o.customers?.phone}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("orders.total")}</div>
          <div>{formatEGP(Number(o.total))}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("orders.deposit")}</div>
          <div>{formatEGP(Number(o.deposit))}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">
          {t("orders.stageProgress")}
        </div>
        <div className="space-y-1">
          {ORDER_STAGES.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2 text-xs ${i <= idx ? "text-foreground" : "text-muted-foreground"}`}
            >
              <div
                className={`h-2 w-2 rounded-full ${i < idx ? "bg-secondary" : i === idx ? "bg-gold" : "bg-muted"}`}
              />
              <span className={i === idx ? "font-bold" : ""}>{STAGE_LABEL_AR[s]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">
          {t("orders.assignments", { n: assignments.length })}
        </div>
        {assignments.length === 0 && (
          <div className="text-xs text-muted-foreground">{t("orders.noAssignments")}</div>
        )}
        {assignments.map((a: any) => (
          <div key={a.id} className="border rounded-md p-2 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">{a.workers?.name ?? "—"}</span> •{" "}
                {STAGE_LABEL_AR[a.stage as OrderStage]}
              </div>
              <Badge
                variant={
                  a.status === "completed"
                    ? "default"
                    : a.status === "in_progress"
                    ? "secondary"
                    : "outline"
                }
              >
                {a.status}
              </Badge>
            </div>
            {(a.started_at || a.finished_at) && (
              <div className="text-[10px] text-muted-foreground">
                {a.started_at &&
                  t("orders.start") +
                    `: ${new Date(a.started_at).toLocaleString()}`}
                {a.finished_at &&
                  ` • ${t("orders.finish")}: ${new Date(a.finished_at).toLocaleString()}`}
              </div>
            )}
            <div className="flex gap-1">
              {a.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    onUpdateAssignment(a, {
                      status: "in_progress",
                      started_at: new Date().toISOString(),
                    })
                  }
                >
                  {t("orders.start")}
                </Button>
              )}
              {a.status === "in_progress" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    onUpdateAssignment(a, {
                      status: "completed",
                      finished_at: new Date().toISOString(),
                    })
                  }
                >
                  {t("orders.finish")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] text-destructive"
                onClick={() => onDeleteAssignment(a)}
              >
                {t("orders.delete")}
              </Button>
            </div>
          </div>
        ))}
        <AssignWorkerForm
          currentStage={o.current_stage}
          workers={workers}
          onAssign={onAssign}
          t={t}
        />
      </div>

      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">
          {t("orders.qcInspections", { n: inspections.length })}
        </div>
        {inspections.slice(0, 5).map((q: any) => (
          <div
            key={q.id}
            className="text-xs border rounded-md p-2 flex justify-between items-start"
          >
            <div>
              <div>{STAGE_LABEL_AR[q.stage as OrderStage]}</div>
              {q.notes && (
                <div className="text-muted-foreground mt-1 whitespace-pre-wrap">
                  {q.notes}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1">
                {new Date(q.created_at).toLocaleString()}
              </div>
            </div>
            <Badge variant={q.passed ? "default" : "destructive"}>
              {q.passed ? t("orders.qcPass") : t("orders.qcFail")}
            </Badge>
          </div>
        ))}
        <QCForm currentStage={o.current_stage} onSubmit={onRecordQC} t={t} />
      </div>

      <div className="pt-2 border-t space-y-3">
        <div className="text-xs text-muted-foreground">
          {t("orders.productionPhotos")} ({photos?.length || 0})
        </div>
        {photos?.length > 0 &&
          (() => {
            const groups: Record<string, any[]> = {};
            for (const p of photos) {
              const k = p.stage || "unknown";
              (groups[k] ||= []).push(p);
            }
            const order = ORDER_STAGES.filter(s => groups[s]);
            return (
              <div className="space-y-3 max-h-72 overflow-auto pr-1">
                {order.map(stage => (
                  <div key={stage} className="space-y-1">
                    <div className="text-xs font-medium text-gold">
                      {STAGE_LABEL_AR[stage]} ({groups[stage].length})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {groups[stage].map((p: any) => (
                        <div key={p.id} className="relative group">
                          <img
                            src={p.photo_url}
                            className="w-full aspect-square object-cover rounded border"
                            alt=""
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(t("common.confirmDelete"))) onDeletePhoto(p);
                            }}
                            className="absolute top-1 left-1 bg-destructive text-destructive-foreground text-[10px] rounded px-1.5 py-0.5 opacity-90 hover:opacity-100 shadow"
                            aria-label={t("orders.delete")}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        <PhotoUploader
          entityType="production-photos"
          entityId={o.id}
          caption={caption}
          onCaptionChange={setCaption}
          onUploaded={onPhotosUploaded}
        />
      </div>

      <div className="pt-2 border-t">
        <InternalNotes entityType="order" entityId={o.id} />
      </div>

      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">
          {t("orders.attachments") ?? "المرفقات"}
        </div>
        <AttachmentList
          entityType="order"
          entityId={o.id}
          refreshKey={refreshAttach}
        />
        <AttachmentUploader
          entityType="order"
          entityId={o.id}
          isPublic={false}
          onUploaded={() => triggerRefreshAttach()}
        />
      </div>

      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">
          {t("orders.shareTrackingLink") ?? t("orders.sendTrackingLink")}
        </div>
        <ShareTrackingLink
          url={buildTrackingUrl(o.order_number)}
          ref={o.order_number}
          recipientPhone={o.customers?.phone ?? null}
          customerName={o.customers?.name ?? null}
          variant="block"
          onWhatsAppSend={() => onSendTracking(o.id)}
          whatsappLoading={sendingTrackingId === o.id}
        />
        <p className="text-[10px] text-muted-foreground">
          {t("orders.shareTrackingLinkHint")}
        </p>
      </div>

      {next && (
        <div className="space-y-2 pt-2 border-t">
          {!gateOk && <div className="text-xs text-destructive">{t("orders.advanceGate")}</div>}
          <Label className="text-xs">{t("orders.notes")}</Label>
          <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
          <Button className="w-full" onClick={onAdvance} disabled={!gateOk}>
            {t("orders.advance", { stage: STAGE_LABEL_AR[next] })}
          </Button>
        </div>
      )}
    </div>
  );
}

function AssignWorkerForm({
  currentStage,
  workers,
  onAssign,
  t,
}: {
  currentStage: OrderStage;
  workers: any[];
  onAssign: (stage: OrderStage, workerId: string) => void;
  t: any;
}) {
  const [stage, setStage] = useState<OrderStage>(currentStage);
  const [workerId, setWorkerId] = useState<string>("");
  return (
    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
      <Select value={stage} onValueChange={v => setStage(v as OrderStage)}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_STAGES.slice(0, -1).map(s => (
            <SelectItem key={s} value={s}>
              {STAGE_LABEL_AR[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={workerId} onValueChange={setWorkerId}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-32">
          <SelectValue placeholder={t("orders.worker")} />
        </SelectTrigger>
        <SelectContent>
          {workers.map((w: any) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
              {w.role ? ` (${w.role})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={!workerId}
        onClick={() => {
          onAssign(stage, workerId);
          setWorkerId("");
        }}
      >
        {t("orders.assignWorker")}
      </Button>
    </div>
  );
}

function QCForm({
  currentStage,
  onSubmit,
  t,
}: {
  currentStage: OrderStage;
  onSubmit: (stage: OrderStage, passed: boolean, notes: string) => void;
  t: any;
}) {
  const [stage, setStage] = useState<OrderStage>(currentStage);
  const [notes, setNotes] = useState("");
  return (
    <div className="p-2 border rounded-md bg-muted/30 space-y-2">
      <Select value={stage} onValueChange={v => setStage(v as OrderStage)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_STAGES.slice(0, -1).map(s => (
            <SelectItem key={s} value={s}>
              {STAGE_LABEL_AR[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        rows={2}
        placeholder={t("orders.qcNotes")}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="text-xs"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => {
            onSubmit(stage, true, notes);
            setNotes("");
          }}
        >
          {t("orders.qcPass")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="flex-1 h-8 text-xs"
          onClick={() => {
            onSubmit(stage, false, notes);
            setNotes("");
          }}
        >
          {t("orders.qcFail")}
        </Button>
      </div>
    </div>
  );
}
