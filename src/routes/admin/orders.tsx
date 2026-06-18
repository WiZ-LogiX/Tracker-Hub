import { useEffect, useState } from "react";
import { useTranslation as _useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STAGES, STAGE_LABEL_AR, OrderStage, nextStage, stageIndex } from "@/lib/stages";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { sendNotification } from "@/lib/notifications.functions";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { extractR2Key } from "@/lib/r2.utils";
import { PhotoUploader } from "@/components/photo-uploader";
import { AttachmentList } from "@/components/attachment-list";
import { AttachmentUploader } from "@/components/attachment-uploader";

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
    const { error } = await supabase.from("production_photos").delete().eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const key = p.photo_url ? extractR2Key(p.photo_url) : null;
    if (key) {
      try {
        await supabase.functions.invoke?.("delete-r2-object", { body: { key } });
      } catch {
        /* ignore */
      }
    }
    if (selected) await reloadOrderData(selected.id);
  }

  async function assignWorker(stage: OrderStage, workerId: string) {
    if (!selected || !workerId) return;
    const { error } = await supabase
      .from("production_assignments")
      .insert({
        order_id: selected.id,
        stage: stage as any,
        worker_id: workerId,
        status: "pending",
      });
    if (error) return toast.error(error.message);
    toast.success(t("common.save"));
    await reloadOrderData(selected.id);
  }

  async function updateAssignment(a: any, patch: any) {
    const { error } = await supabase
      .from("production_assignments")
      .update(patch)
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    await reloadOrderData(selected.id);
  }

  async function deleteAssignment(a: any) {
    if (!confirm(t("common.confirmDelete"))) return;
    await supabase.from("production_assignments").delete().eq("id", a.id);
    await reloadOrderData(selected.id);
  }

  async function recordQC(stage: OrderStage, passed: boolean, qcNotes: string) {
    if (!selected) return;
    const { error } = await supabase.from("qc_inspections").insert({
      order_id: selected.id,
      stage: stage as any,
      passed,
      notes: qcNotes || null,
      inspector_id: user?.id,
    } as any);
    if (error) return toast.error(error.message);
    if (!passed) {
      await supabase.from("remakes").insert({
        order_id: selected.id,
        reason: qcNotes || `QC failed: ${stage}`,
        status: "open",
        created_by: user?.id,
      } as any);
      toast.warning(t("orders.qcFail"));
    } else toast.success(t("orders.qcPass"));
    await reloadOrderData(selected.id);
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
    const { error } = await supabase
      .from("orders")
      .update({
        current_stage: next as any,
        ...(next === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
      })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    await supabase.from("production_logs").insert({
      order_id: o.id,
      stage_from: o.current_stage as any,
      stage_to: next as any,
      transitioned_by: user?.id,
      notes: note || null,
    } as any);
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

  async function sendTrackingLink(o: any) {
    try {
      const r: any = await notify({
        data: {
          event: "stage_changed",
          entityType: "order",
          entityId: o.id,
          extra: { stage: String(o.current_stage) },
        },
      });
      if (r?.status === "sent") toast.success(t("orders.trackingSent"));
      else if (r?.status === "skipped") toast.info(t("notifications.skipped", { reason: r?.reason ?? "" }));
      else toast.error(t("notifications.failed", { error: r?.http ?? "" }));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t("orders.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("orders.subtitle")}</p>
      </div>

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
                          onSendLink={() => sendTrackingLink(selected)}
                          onPhotosUploaded={handlePhotosUploaded}
                          onDeletePhoto={deletePhoto}
                          onAssign={assignWorker}
                          onUpdateAssignment={updateAssignment}
                          onDeleteAssignment={deleteAssignment}
                          onRecordQC={recordQC}
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
  onSendLink,
  onPhotosUploaded,
  onDeletePhoto,
  onAssign,
  onUpdateAssignment,
  onDeleteAssignment,
  onRecordQC,
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
                            onClick={() => onDeletePhoto(p)}
                            className="absolute top-1 left-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100"
                          >
                            {t("orders.delete")}
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
          {t("orders.sendTrackingLink")}
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={onSendLink}>
          {t("orders.sendTrackingLink")}
        </Button>
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