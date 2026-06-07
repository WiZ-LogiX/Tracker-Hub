import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useServerFn } from "@tanstack/react-start";
import { sendNotification } from "@/lib/notifications.functions";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { getR2BatchUploadUrls, deleteR2Object } from "@/lib/r2.functions";
import { getR2PublicUrl } from "@/lib/r2.server";

export const Route = createFileRoute("/admin/orders")({ component: OrdersPage });

function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const { user } = useAuth();
  const notify = useServerFn(sendNotification);
  const getBatchUploadUrls = useServerFn(getR2BatchUploadUrls);
  const deleteR2 = useServerFn(deleteR2Object);

  useEffect(() => { load(); loadWorkers(); }, []);
  async function load() {
    const { data } = await supabase.from('orders').select('*, customers(name,phone)').order('created_at', { ascending: false });
    setOrders(data ?? []);
  }
  async function loadWorkers() {
    const { data } = await supabase.from('workers').select('*').eq('active', true).order('name');
    setWorkers(data ?? []);
  }
  async function openOrder(o: any) {
    setSelected(o); setNote("");
    const [{ data: l }, { data: ph }, { data: as }, { data: qc }] = await Promise.all([
      supabase.from('production_logs').select('*').eq('order_id', o.id).order('transitioned_at'),
      supabase.from('production_photos').select('*').eq('order_id', o.id).order('created_at', { ascending: false }),
      supabase.from('production_assignments').select('*, workers(name)').eq('order_id', o.id).order('created_at'),
      supabase.from('qc_inspections').select('*').eq('order_id', o.id).order('created_at', { ascending: false }),
    ]);
    setLogs(l ?? []);
    setPhotos(ph ?? []);
    setAssignments(as ?? []);
    setInspections(qc ?? []);
  }
  async function reloadOrderData(orderId: string) {
    const [{ data: ph }, { data: as }, { data: qc }] = await Promise.all([
      supabase.from('production_photos').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('production_assignments').select('*, workers(name)').eq('order_id', orderId).order('created_at'),
      supabase.from('qc_inspections').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    ]);
    setPhotos(ph ?? []); setAssignments(as ?? []); setInspections(qc ?? []);
  }
  async function uploadPhotos(files: File[], caption: string) {
    if (!selected || files.length === 0) return;
    
    // Get presigned upload URLs from R2
    const fileInfos = files.map(f => ({ filename: f.name, contentType: f.type || 'image/jpeg' }));
    const { uploads } = await getBatchUploadUrls({
      data: { files: fileInfos, entityType: 'production-photos', entityId: selected.id },
    });

    let ok = 0, fail = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { key, uploadUrl } = uploads[i];
      
      try {
        // Upload directly to R2 using presigned URL
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'image/jpeg' },
        });
        
        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status}`);
        }

        // Store the R2 key and generate a public URL for display
        const photoUrl = getR2PublicUrl(key);
        const { error } = await supabase.from('production_photos').insert({
          order_id: selected.id,
          stage: selected.current_stage,
          photo_url: photoUrl,
          caption: caption || null,
          uploaded_by: user?.id,
        });
        
        if (error) throw error;
        ok++;
      } catch (err) {
        console.error('R2 upload error:', err);
        fail++;
      }
    }
    
    if (ok) toast.success(`تم رفع ${ok} صورة`);
    if (fail) toast.error(`فشل رفع ${fail} صورة`);
    await reloadOrderData(selected.id);
  }
  async function deletePhoto(p: any) {
    // Extract R2 key from photo_url if it's an R2 URL
    let r2Key: string | null = null;
    if (p.photo_url) {
      const { R2_ACCOUNT_ID, R2_BUCKET_NAME = 'pelecanon-assets' } = process.env;
      const publicUrlBase = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/`;
      if (p.photo_url.startsWith(publicUrlBase)) {
        r2Key = p.photo_url.slice(publicUrlBase.length);
      }
    }

    // Delete from database first
    const { error } = await supabase.from('production_photos').delete().eq('id', p.id);
    if (error) return toast.error(error.message);

    // Delete from R2 if we have the key
    if (r2Key) {
      try {
        await deleteR2({ data: { key: r2Key } });
      } catch (err) {
        console.error('R2 delete error:', err);
        // Don't show error to user since DB delete succeeded
      }
    }

    await reloadOrderData(selected.id);
  }

  async function assignWorker(stage: OrderStage, workerId: string) {
    if (!selected || !workerId) return;
    const { error } = await supabase.from('production_assignments').insert({
      order_id: selected.id, stage: stage as any, worker_id: workerId, status: 'pending',
    });
    if (error) return toast.error(error.message);
    toast.success("تم التكليف");
    await reloadOrderData(selected.id);
  }
  async function updateAssignment(a: any, patch: any) {
    const { error } = await supabase.from('production_assignments').update(patch).eq('id', a.id);
    if (error) return toast.error(error.message);
    await reloadOrderData(selected.id);
  }
  async function deleteAssignment(a: any) {
    if (!confirm("حذف التكليف؟")) return;
    await supabase.from('production_assignments').delete().eq('id', a.id);
    await reloadOrderData(selected.id);
  }

  async function recordQC(stage: OrderStage, passed: boolean, qcNotes: string) {
    if (!selected) return;
    const { error } = await supabase.from('qc_inspections').insert({
      order_id: selected.id, stage: stage as any, passed, notes: qcNotes || null, inspector_id: user?.id,
    });
    if (error) return toast.error(error.message);
    if (!passed) {
      await supabase.from('remakes').insert({
        order_id: selected.id, reason: qcNotes || `فشل فحص: ${STAGE_LABEL_AR[stage]}`,
        status: 'open', created_by: user?.id,
      });
      toast.warning("تم تسجيل الفحص كراسب وفتح إعادة تصنيع");
    } else {
      toast.success("تم تسجيل الفحص (ناجح)");
    }
    await reloadOrderData(selected.id);
  }

  function canAdvance(o: any): { ok: boolean; reason?: string } {
    if (o.current_stage === 'quality_check') {
      const latest = inspections.find(i => i.stage === 'quality_check');
      if (!latest) return { ok: false, reason: "يجب تسجيل فحص جودة أولاً" };
      if (!latest.passed) return { ok: false, reason: "آخر فحص جودة راسب — سجّل فحصاً جديداً ناجحاً" };
    }
    return { ok: true };
  }

  async function advance(o: any) {
    const next = nextStage(o.current_stage as OrderStage);
    if (!next) return toast.info("الأمر مكتمل");
    const gate = canAdvance(o);
    if (!gate.ok) return toast.error(gate.reason!);
    const { error } = await supabase.from('orders').update({
      current_stage: next as any,
      ...(next === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', o.id);
    if (error) return toast.error(error.message);
    await supabase.from('production_logs').insert({
      order_id: o.id, stage_from: o.current_stage as any, stage_to: next as any,
      transitioned_by: user?.id, notes: note || null,
    });
    try {
      const event = next === 'delivered' ? 'delivered' : (next === 'ready_for_pickup' ? 'delivery_scheduled' : 'stage_changed');
      await notify({ data: { event: event as any, entityType: 'order', entityId: o.id, extra: { stage: String(next) } } });
    } catch {}
    toast.success(`تم الانتقال لمرحلة: ${STAGE_LABEL_AR[next]}`);
    await load();
    if (selected?.id === o.id) {
      const updated = (await supabase.from('orders').select('*, customers(name,phone)').eq('id', o.id).single()).data;
      openOrder(updated);
    }
  }

  async function sendTrackingLink(o: any) {
    try {
      const r: any = await notify({ data: { event: 'stage_changed', entityType: 'order', entityId: o.id, extra: { stage: String(o.current_stage) } } });
      if (r?.status === 'sent') toast.success("تم إرسال رابط التتبع للعميل");
      else if (r?.status === 'skipped') toast.info(`تعذّر الإرسال: ${r?.reason ?? 'غير مهيأ'}`);
      else toast.error(`فشل الإرسال${r?.http ? ` (HTTP ${r.http})` : ''}`);
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الإرسال");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">تتبع الإنتاج</h1>
        <p className="text-sm text-muted-foreground mt-1">9 مراحل من العربون للتسليم</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {ORDER_STAGES.slice(0, -1).map(stage => {
          const ordersInStage = orders.filter(o => o.current_stage === stage);
          if (ordersInStage.length === 0) return null;
          return (
            <Card key={stage}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{STAGE_LABEL_AR[stage]}</span>
                  <Badge variant="outline">{ordersInStage.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ordersInStage.map(o => (
                  <Dialog key={o.id}>
                    <DialogTrigger asChild>
                      <button onClick={() => openOrder(o)} className="w-full text-right p-3 border rounded-md hover:bg-muted transition">
                        <div className="font-medium text-sm">{o.customers?.name}</div>
                        <div className="text-xs text-muted-foreground">{o.order_number} • {formatEGP(Number(o.total))}</div>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>{o.order_number}</DialogTitle></DialogHeader>
                      {selected && <OrderDetail
                        o={selected} logs={logs} photos={photos}
                        assignments={assignments} inspections={inspections} workers={workers}
                        note={note} setNote={setNote}
                        onAdvance={() => advance(selected)}
                        onSendLink={() => sendTrackingLink(selected)}
                        onUpload={uploadPhotos} onDeletePhoto={deletePhoto}
                        onAssign={assignWorker} onUpdateAssignment={updateAssignment} onDeleteAssignment={deleteAssignment}
                        onRecordQC={recordQC}
                      />}
                    </DialogContent>
                  </Dialog>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {orders.filter(o => o.current_stage === 'completed').length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">مكتمل</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {orders.filter(o => o.current_stage === 'completed').map(o => (
              <div key={o.id} className="p-3 border rounded-md text-sm flex justify-between">
                <div>{o.customers?.name} • {o.order_number}</div>
                <div className="text-muted-foreground">{formatEGP(Number(o.total))}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {orders.length === 0 && <Card><CardContent className="p-12 text-center text-muted-foreground">لا توجد أوامر إنتاج بعد. حوِّل عرض سعر مقبول لفاتورة لينشئ أمر إنتاج تلقائياً.</CardContent></Card>}
    </div>
  );
}

function OrderDetail({ o, logs, photos, assignments, inspections, workers, note, setNote, onAdvance, onSendLink, onUpload, onDeletePhoto, onAssign, onUpdateAssignment, onDeleteAssignment, onRecordQC }: any) {
  const idx = stageIndex(o.current_stage);
  const next = nextStage(o.current_stage);
  const gateOk = o.current_stage !== 'quality_check' || (inspections.find((i: any) => i.stage === 'quality_check')?.passed);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><div className="text-xs text-muted-foreground">العميل</div><div>{o.customers?.name}</div></div>
        <div><div className="text-xs text-muted-foreground">الموبايل</div><div>{o.customers?.phone}</div></div>
        <div><div className="text-xs text-muted-foreground">الإجمالي</div><div>{formatEGP(Number(o.total))}</div></div>
        <div><div className="text-xs text-muted-foreground">العربون</div><div>{formatEGP(Number(o.deposit))}</div></div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">تقدم المراحل</div>
        <div className="space-y-1">
          {ORDER_STAGES.map((s, i) => (
            <div key={s} className={`flex items-center gap-2 text-xs ${i <= idx ? 'text-foreground' : 'text-muted-foreground'}`}>
              <div className={`h-2 w-2 rounded-full ${i < idx ? 'bg-secondary' : i === idx ? 'bg-gold' : 'bg-muted'}`} />
              <span className={i === idx ? 'font-bold' : ''}>{STAGE_LABEL_AR[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Production assignments */}
      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">التكليفات ({assignments.length})</div>
        {assignments.length === 0 && <div className="text-xs text-muted-foreground">لا تكليفات بعد.</div>}
        {assignments.map((a: any) => (
          <div key={a.id} className="border rounded-md p-2 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <div><span className="font-medium">{a.workers?.name ?? '—'}</span> • {STAGE_LABEL_AR[a.stage as OrderStage]}</div>
              <Badge variant={a.status === 'completed' ? 'default' : a.status === 'in_progress' ? 'secondary' : 'outline'}>{a.status}</Badge>
            </div>
            {(a.started_at || a.finished_at) && (
              <div className="text-[10px] text-muted-foreground">
                {a.started_at && <>بدء: {new Date(a.started_at).toLocaleString('ar-EG')}</>}
                {a.finished_at && <> • انتهاء: {new Date(a.finished_at).toLocaleString('ar-EG')}</>}
              </div>
            )}
            <div className="flex gap-1">
              {a.status === 'pending' && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onUpdateAssignment(a, { status: 'in_progress', started_at: new Date().toISOString() })}>بدء</Button>}
              {a.status === 'in_progress' && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onUpdateAssignment(a, { status: 'completed', finished_at: new Date().toISOString() })}>إنهاء</Button>}
              <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive" onClick={() => onDeleteAssignment(a)}>حذف</Button>
            </div>
          </div>
        ))}
        <AssignWorkerForm currentStage={o.current_stage} workers={workers} onAssign={onAssign} />
      </div>

      {/* QC inspections */}
      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">فحوص الجودة ({inspections.length})</div>
        {inspections.slice(0, 5).map((q: any) => (
          <div key={q.id} className="text-xs border rounded-md p-2 flex justify-between items-start">
            <div>
              <div>{STAGE_LABEL_AR[q.stage as OrderStage]}</div>
              {q.notes && <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{q.notes}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(q.created_at).toLocaleString('ar-EG')}</div>
            </div>
            <Badge variant={q.passed ? 'default' : 'destructive'}>{q.passed ? 'ناجح' : 'راسب'}</Badge>
          </div>
        ))}
        <QCForm currentStage={o.current_stage} onSubmit={onRecordQC} />
      </div>

      {/* Photos */}
      <div className="pt-2 border-t space-y-3">
        <div className="text-xs text-muted-foreground">صور التصنيع ({photos?.length || 0})</div>
        {photos?.length > 0 && (() => {
          const groups: Record<string, any[]> = {};
          for (const p of photos) {
            const k = p.stage || 'unknown';
            (groups[k] ||= []).push(p);
          }
          const order = ORDER_STAGES.filter(s => groups[s]);
          return (
            <div className="space-y-3 max-h-72 overflow-auto pr-1">
              {order.map(stage => (
                <div key={stage} className="space-y-1">
                  <div className="text-xs font-medium text-gold">{STAGE_LABEL_AR[stage]} ({groups[stage].length})</div>
                  <div className="grid grid-cols-3 gap-2">
                    {groups[stage].map((p: any) => (
                      <div key={p.id} className="relative group">
                        <img src={p.photo_url} className="w-full aspect-square object-cover rounded border" />
                        <button type="button" onClick={() => onDeletePhoto(p)}
                          className="absolute top-1 left-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100">حذف</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        <PhotoUploader onUpload={onUpload} />
      </div>

      {/* Internal notes */}
      <div className="pt-2 border-t">
        <InternalNotes entityType="order" entityId={o.id} />
      </div>

      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">إرسال رابط التتبع للعميل (يفتح صفحة المراحل مع الصور)</div>
        <Button type="button" variant="outline" className="w-full" onClick={onSendLink}>
          إرسال رابط التتبع عبر واتساب
        </Button>
      </div>

      {next && (
        <div className="space-y-2 pt-2 border-t">
          {!gateOk && <div className="text-xs text-destructive">يجب تسجيل فحص جودة ناجح قبل الانتقال للمرحلة التالية.</div>}
          <Label className="text-xs">ملاحظات على الانتقال</Label>
          <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
          <Button className="w-full" onClick={onAdvance} disabled={!gateOk}>
            الانتقال للمرحلة التالية: {STAGE_LABEL_AR[next]}
          </Button>
        </div>
      )}
    </div>
  );
}

function AssignWorkerForm({ currentStage, workers, onAssign }: { currentStage: OrderStage; workers: any[]; onAssign: (s: OrderStage, w: string) => void }) {
  const [stage, setStage] = useState<OrderStage>(currentStage);
  const [workerId, setWorkerId] = useState<string>("");
  return (
    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
      <Select value={stage} onValueChange={v => setStage(v as OrderStage)}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-32"><SelectValue /></SelectTrigger>
        <SelectContent>{ORDER_STAGES.slice(0, -1).map(s => <SelectItem key={s} value={s}>{STAGE_LABEL_AR[s]}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={workerId} onValueChange={setWorkerId}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-32"><SelectValue placeholder="اختر عاملاً" /></SelectTrigger>
        <SelectContent>{workers.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.role ? ` (${w.role})` : ''}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" className="h-8 text-xs" disabled={!workerId} onClick={() => { onAssign(stage, workerId); setWorkerId(""); }}>تكليف</Button>
    </div>
  );
}

function QCForm({ currentStage, onSubmit }: { currentStage: OrderStage; onSubmit: (s: OrderStage, p: boolean, n: string) => void }) {
  const [stage, setStage] = useState<OrderStage>(currentStage);
  const [notes, setNotes] = useState("");
  return (
    <div className="p-2 border rounded-md bg-muted/30 space-y-2">
      <Select value={stage} onValueChange={v => setStage(v as OrderStage)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{ORDER_STAGES.slice(0, -1).map(s => <SelectItem key={s} value={s}>{STAGE_LABEL_AR[s]}</SelectItem>)}</SelectContent>
      </Select>
      <Textarea rows={2} placeholder="ملاحظات الفحص" value={notes} onChange={e => setNotes(e.target.value)} className="text-xs" />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => { onSubmit(stage, true, notes); setNotes(""); }}>ناجح</Button>
        <Button size="sm" variant="destructive" className="flex-1 h-8 text-xs" onClick={() => { onSubmit(stage, false, notes); setNotes(""); }}>راسب (يفتح إعادة تصنيع)</Button>
      </div>
    </div>
  );
}

function PhotoUploader({ onUpload }: { onUpload: (files: File[], caption: string) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 p-2 border rounded-md bg-muted/30">
      <input type="file" accept="image/*" multiple
        onChange={e => setFiles(Array.from(e.target.files ?? []))} className="text-xs" />
      {files.length > 0 && (
        <div className="text-xs text-muted-foreground">{files.length} ملف محدد</div>
      )}
      <input type="text" placeholder="وصف مشترك للصور (اختياري)" value={caption}
        onChange={e => setCaption(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background" />
      <Button size="sm" disabled={files.length === 0 || busy} onClick={async () => {
        if (files.length === 0) return;
        setBusy(true);
        await onUpload(files, caption);
        setFiles([]); setCaption("");
        setBusy(false);
      }}>{busy ? `جارٍ الرفع... (${files.length})` : `رفع ${files.length || ''} صورة`}</Button>
    </div>
  );
}
