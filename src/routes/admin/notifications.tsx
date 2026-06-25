import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendTestNotification } from "@/lib/notifications.functions";
import {
  listNotificationTemplates,
  upsertNotificationTemplate,
  deleteNotificationTemplate,
  previewNotificationTemplate,
  type NotificationTemplateRow,
  type NotificationEvent,
  type NotificationChannel,
  type NotificationLanguage,
} from "@/lib/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/notifications")({ component: NotificationsPage });

const EVENT_VALUES: NotificationEvent[] = [
  "quote_sent",
  "order_opened",
  "stage_changed",
  "delivery_scheduled",
  "delivered",
];
const CHANNEL_VALUES: NotificationChannel[] = ["whatsapp", "email", "sms"];
const LANGUAGE_VALUES: NotificationLanguage[] = ["ar", "en", "fr"];

type DraftTemplate = {
  id?: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  language: NotificationLanguage;
  subject: string;
  body: string;
  active: boolean;
};

function blankDraft(): DraftTemplate {
  return {
    id: undefined,
    event: "stage_changed",
    channel: "whatsapp",
    language: "ar",
    subject: "",
    body: "",
    active: true,
  };
}

function NotificationsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t("notifications.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("notifications.subtitle")}</p>
      </div>
      <Tabs defaultValue="send" className="w-full">
        <TabsList>
          <TabsTrigger value="send">{t("notifications.tabSend")}</TabsTrigger>
          <TabsTrigger value="templates">{t("notifications.tabTemplates")}</TabsTrigger>
          <TabsTrigger value="log">{t("notifications.tabLog")}</TabsTrigger>
        </TabsList>
        <TabsContent value="send">
          <TestSendPanel />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesPanel />
        </TabsContent>
        <TabsContent value="log">
          <RecentLogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TestSendPanel() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("Test from PeleCanon ✓");
  const [sending, setSending] = useState(false);
  const sendTest = useServerFn(sendTestNotification);

  async function onSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return toast.error(t("notifications.phone"));
    setSending(true);
    try {
      const r: any = await sendTest({ data: { phone: phone.trim(), message: message.trim() } });
      if (r.status === "sent") toast.success(t("notifications.sent"));
      else if (r.status === "skipped")
        toast.warning(t("notifications.skipped", { reason: r.reason }));
      else toast.error(t("notifications.failed", { error: r.error ?? r.http ?? "unknown" }));
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("notifications.testSend")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSendTest}
          className="grid sm:grid-cols-[200px_1fr_auto] gap-3 items-end"
        >
          <div className="space-y-1.5">
            <Label>{t("notifications.phone")}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+201xxxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("notifications.message")}</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={1} />
          </div>
          <Button type="submit" disabled={sending} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? "..." : t("notifications.sendTest")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          {t("notifications.webhookHint")}
        </p>
      </CardContent>
    </Card>
  );
}

function RecentLogPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("notification_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const color = (s: string) =>
    s === "sent"
      ? ("default" as const)
      : s === "failed"
      ? ("destructive" as const)
      : ("secondary" as const);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t("notifications.recent")}</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("notifications.refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("notifications.when")}</TableHead>
              <TableHead>{t("notifications.event")}</TableHead>
              <TableHead>{t("notifications.channel")}</TableHead>
              <TableHead>{t("notifications.reference")}</TableHead>
              <TableHead>{t("notifications.recipient")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("notifications.error")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs">{r.event}</TableCell>
                <TableCell className="text-xs">{r.channel}</TableCell>
                <TableCell className="text-xs font-mono">{r.reference}</TableCell>
                <TableCell className="text-xs">{r.recipient}</TableCell>
                <TableCell>
                  <Badge variant={color(r.status)}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-[260px] truncate">
                  {r.error}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("notifications.noNotifications")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TemplatesPanel() {
  const { t } = useTranslation();
  const listTemplates = useServerFn(listNotificationTemplates);
  const upsertTemplate = useServerFn(upsertNotificationTemplate);
  const removeTemplate = useServerFn(deleteNotificationTemplate);
  const previewTemplate = useServerFn(previewNotificationTemplate);

  const [items, setItems] = useState<NotificationTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DraftTemplate | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    found: boolean;
    subject: string;
    body: string;
    vars: Record<string, string>;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<NotificationTemplateRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r: any = await listTemplates({ data: {} });
      setItems(r.items ?? []);
    } catch (err: any) {
      toast.error(err?.message || t("notifications.templates.loadError"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setEditing(blankDraft());
    setPreviewingId(null);
    setPreviewResult(null);
  }

  function startEdit(row: NotificationTemplateRow) {
    setEditing({
      id: row.id,
      event: row.event,
      channel: row.channel,
      language: row.language,
      subject: row.subject ?? "",
      body: row.body,
      active: row.active,
    });
    setPreviewingId(row.id);
    setPreviewResult(null);
    void runPreview(row);
  }

  async function runPreview(row: NotificationTemplateRow | DraftTemplate) {
    setPreviewLoading(true);
    try {
      const r: any = await previewTemplate({
        data: {
          event: row.event,
          channel: row.channel,
          language: row.language,
          reference: "ORD-0000",
          customer_name: "أحمد",
          stage: "finishing",
          date: new Date().toLocaleDateString(),
          total: "0",
        },
      });
      setPreviewResult({
        found: !!r.found,
        subject: r.subject || "",
        body: r.body || "",
        vars: r.vars || {},
      });
    } catch (err: any) {
      toast.error(err?.message || t("notifications.templates.previewError"));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onSave() {
    if (!editing) return;
    if (!editing.body.trim()) return toast.error(t("notifications.templates.body"));
    setSaving(true);
    try {
      await upsertTemplate({
        data: {
          id: editing.id,
          event: editing.event,
          channel: editing.channel,
          language: editing.language,
          subject: editing.subject.trim() || null,
          body: editing.body,
          active: editing.active,
        },
      });
      toast.success(t("notifications.templates.saved"));
      setEditing(null);
      setPreviewResult(null);
      setPreviewingId(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || t("notifications.templates.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    try {
      await removeTemplate({ data: { id: deleting.id } });
      toast.success(t("notifications.templates.deleted"));
      if (editing?.id === deleting.id) {
        setEditing(null);
        setPreviewResult(null);
      }
      setDeleting(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || t("notifications.templates.deleteError"));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">{t("notifications.tabTemplates")}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("notifications.refresh")}
            </Button>
            <Button size="sm" onClick={startNew} disabled={!!editing}>
              <Plus className="h-4 w-4 mr-2" />
              {t("notifications.templates.newTemplate")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {t("notifications.templates.subtitle")}
          </p>
          {items.length === 0 && !loading && (
            <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
              {t("notifications.templates.noTemplates")}
            </div>
          )}
          {items.length > 0 && (
            <ScrollArea className="border rounded-md max-h-[260px]">
              <div className="divide-y">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between gap-2 p-3 hover:bg-accent transition cursor-pointer ${
                      previewingId === row.id ? "bg-accent" : ""
                    }`}
                    onClick={() => startEdit(row)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">
                          {t(`notifications.templates.events.${row.event}`)}
                        </Badge>
                        <Badge variant="secondary">
                          {t(`notifications.templates.channels.${row.channel}`)}
                        </Badge>
                        <Badge variant="default">
                          {t(`notifications.templates.languages.${row.language}`)}
                        </Badge>
                        {!row.active && (
                          <Badge variant="destructive">{t("notifications.templates.active")}=false</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {row.subject || row.body}
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing({
                            id: row.id,
                            event: row.event,
                            channel: row.channel,
                            language: row.language,
                            subject: row.subject ?? "",
                            body: row.body,
                            active: row.active,
                          });
                          setPreviewingId(row.id);
                          void runPreview(row);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              {editing.id ? t("notifications.templates.event") : t("notifications.templates.newTemplate")}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setPreviewingId(null); setPreviewResult(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t("notifications.templates.event")}</Label>
                <Select
                  value={editing.event}
                  onValueChange={(v) => setEditing({ ...editing, event: v as NotificationEvent })}
                  disabled={!!editing.id}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_VALUES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`notifications.templates.events.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.templates.channel")}</Label>
                <Select
                  value={editing.channel}
                  onValueChange={(v) => setEditing({ ...editing, channel: v as NotificationChannel })}
                  disabled={!!editing.id}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNEL_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`notifications.templates.channels.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("notifications.templates.language")}</Label>
                <Select
                  value={editing.language}
                  onValueChange={(v) => setEditing({ ...editing, language: v as NotificationLanguage })}
                  disabled={!!editing.id}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_VALUES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {t(`notifications.templates.languages.${l}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("notifications.templates.subject")}</Label>
              <Input
                value={editing.subject}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("notifications.templates.body")}</Label>
              <Textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={6}
                dir={editing.language === "ar" ? "rtl" : "ltr"}
                className="font-mono text-sm"
              />
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium">{t("notifications.templates.variables")}: </span>
                {t("notifications.templates.tokens")}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                  id="active"
                />
                <Label htmlFor="active" className="cursor-pointer">
                  {t("notifications.templates.active")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => runPreview(editing)}
                  disabled={previewLoading || !editing.body.trim()}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {t("notifications.templates.preview")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditing(null); setPreviewResult(null); setPreviewingId(null); }}
                  disabled={saving}
                >
                  {t("notifications.templates.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={saving || !editing.body.trim()}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "..." : t("notifications.templates.save")}
                </Button>
              </div>
            </div>

            {(previewLoading || previewResult) && (
              <div className="border rounded-md bg-muted/40 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("notifications.templates.preview")}
                </div>
                {previewLoading && (
                  <div className="text-sm">{t("notifications.templates.previewLoading")}</div>
                )}
                {previewResult && !previewLoading && (
                  <>
                    {!previewResult.found && (
                      <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
                        {t("notifications.templates.previewEmpty")}
                      </div>
                    )}
                    {previewResult.subject && (
                      <div className="text-sm">
                        <span className="font-medium">Subject: </span>
                        <span className="whitespace-pre-wrap">{previewResult.subject}</span>
                      </div>
                    )}
                    {previewResult.body && (
                      <div className="text-sm whitespace-pre-wrap">{previewResult.body}</div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notifications.templates.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notifications.templates.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("notifications.templates.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              {t("notifications.templates.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
