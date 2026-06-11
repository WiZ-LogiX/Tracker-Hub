import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendTestNotification } from "@/lib/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("Test from PeleCanon ✓");
  const [sending, setSending] = useState(false);
  const sendTest = useServerFn(sendTestNotification);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("notification_log").select("*").order("created_at", { ascending: false }).limit(200);
    setRows(data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function onSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return toast.error(t("notifications.phone"));
    setSending(true);
    try {
      const r: any = await sendTest({ data: { phone: phone.trim(), message: message.trim() } });
      if (r.status === "sent") toast.success(t("notifications.sent"));
      else if (r.status === "skipped") toast.warning(t("notifications.skipped", { reason: r.reason }));
      else toast.error(t("notifications.failed", { error: r.error ?? r.http ?? "unknown" }));
      load();
    } catch (err: any) { toast.error(err?.message ?? "Error"); }
    finally { setSending(false); }
  }

  const color = (s: string) => s === "sent" ? "default" as const : s === "failed" ? "destructive" as const : "secondary" as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="font-serif text-3xl font-bold">{t("notifications.title")}</h1><p className="text-sm text-muted-foreground mt-1">{t("notifications.subtitle")}</p></div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />{t("notifications.refresh")}</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("notifications.testSend")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSendTest} className="grid sm:grid-cols-[200px_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5"><Label>{t("notifications.phone")}</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+201xxxxxxxxx" /></div>
            <div className="space-y-1.5"><Label>{t("notifications.message")}</Label><Textarea value={message} onChange={e => setMessage(e.target.value)} rows={1} /></div>
            <Button type="submit" disabled={sending} className="gap-2"><Send className="h-4 w-4" />{sending ? "..." : t("notifications.sendTest")}</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">{t("notifications.webhookHint")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("notifications.recent")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("notifications.when")}</TableHead><TableHead>{t("notifications.event")}</TableHead><TableHead>{t("notifications.channel")}</TableHead>
              <TableHead>{t("notifications.reference")}</TableHead><TableHead>{t("notifications.recipient")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead>{t("notifications.error")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{r.event}</TableCell>
                  <TableCell className="text-xs">{r.channel}</TableCell>
                  <TableCell className="text-xs font-mono">{r.reference}</TableCell>
                  <TableCell className="text-xs">{r.recipient}</TableCell>
                  <TableCell><Badge variant={color(r.status)}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs text-destructive max-w-[260px] truncate">{r.error}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("notifications.noNotifications")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}