import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, ExternalLink, FileText, Image as ImageIcon, Eye, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  getAttachmentUrl,
  deleteAttachment,
  listAttachments,
  updateAttachmentVisibility,
  bulkUpdateAttachmentVisibility,
  type AttachmentRow,
} from "@/lib/attachments.functions";

function prettySize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function AttachmentList({
  entityType,
  entityId,
  refreshKey = 0,
  canDelete = true,
  onChanged,
}: {
  entityType: "order" | "quote" | "invoice" | "customer" | "task" | "opportunity" | "project" | "service_case";
  entityId: string;
  refreshKey?: number;
  canDelete?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState<Record<string, string>>({});

  const listFn = useServerFn(listAttachments);
  const signFn = useServerFn(getAttachmentUrl);
  const deleteFn = useServerFn(deleteAttachment);
  const updateVisibilityFn = useServerFn(updateAttachmentVisibility);
  const bulkVisibilityFn = useServerFn(bulkUpdateAttachmentVisibility);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listFn({ data: { entityType, entityId } });
      setItems(r.items ?? []);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (entityId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, refreshKey]);

  async function open(att: AttachmentRow) {
    if (att.downloadUrl) {
      window.open(att.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const r = await signFn({ data: { id: att.id } });
      setSigned(prev => ({ ...prev, [att.id]: r.url }));
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر توليد الرابط الموقّع");
    }
  }

  async function remove(att: AttachmentRow) {
    if (!confirm("حذف المرفق؟")) return;
    try {
      await deleteFn({ data: { id: att.id } });
      toast.success("تم الحذف");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحذف");
    }
  }

  async function toggleVisibility(att: AttachmentRow) {
    const nextState = !att.isPublic;
    const confirmMsg = nextState
      ? "تأكيد إتاحة الملف: هل أنت متأكد من إتاحة هذا الملف للعميل على صفحة التتبع؟"
      : "هل تريد إخفاء هذا الملف عن العميل وجعله خاصاً بالفريق فقط؟";

    if (!confirm(confirmMsg)) return;

    setUpdatingId(att.id);
    try {
      await updateVisibilityFn({ data: { id: att.id, isPublic: nextState } });
      setItems(prev =>
        prev.map(item => (item.id === att.id ? { ...item, isPublic: nextState } : item)),
      );
      toast.success(nextState ? "تم إتاحة الملف للعميل بنجاح" : "تم تحويل الملف إلى خاص بالفريق فقط");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تعديل مستوى الرؤية");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleBulkVisibility(isPublic: boolean) {
    if (!items.length) return;
    const confirmMsg = isPublic
      ? `هل تريد إتاحة جميع المرفقات (${items.length}) للعميل؟`
      : `هل تريد جعل جميع المرفقات (${items.length}) خاصة بالفريق فقط؟`;

    if (!confirm(confirmMsg)) return;

    try {
      await bulkVisibilityFn({ data: { ids: items.map(i => i.id), isPublic } });
      setItems(prev => prev.map(item => ({ ...item, isPublic })));
      toast.success(isPublic ? "تم إتاحة جميع المرفقات للعميل" : "تم جعل جميع المرفقات خاصة بالفريق");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تحديث مستوى الرؤية");
    }
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground">...جاري تحميل المرفقات</div>;
  }
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">{t("common.noData")}</div>;
  }
  return (
    <div className="space-y-2">
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-2 p-1.5 bg-muted/20 rounded border border-dashed text-xs">
          <span className="text-muted-foreground text-[11px]">
            إجراءات جماعية للمرفقات ({items.length}):
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
              onClick={() => handleBulkVisibility(true)}
            >
              <Eye className="h-3 w-3" />
              <span>إتاحة الكل للعميل</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:bg-muted"
              onClick={() => handleBulkVisibility(false)}
            >
              <Lock className="h-3 w-3" />
              <span>جعل الكل خاصاً بالفريق</span>
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map(att => {
          const isImage = att.contentType.startsWith("image/");
          const previewSrc = att.downloadUrl || signed[att.id] || "";
          const isBusy = updatingId === att.id;

          return (
            <div
              key={att.id}
              className={`flex items-center gap-3 p-2 border rounded-md bg-card transition ${
                att.isPublic ? "border-emerald-500/40 bg-emerald-500/[0.02]" : "border-border"
              }`}
            >
              {previewSrc && isImage ? (
                <img
                  src={previewSrc}
                  alt={att.fileName}
                  className="h-12 w-12 object-cover rounded border bg-muted shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                  {isImage ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate" title={att.fileName}>
                    {att.fileName}
                  </span>
                  {att.isPublic ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1.5 h-4 bg-emerald-500/10 text-emerald-700 border-emerald-500/30 gap-1 flex items-center"
                    >
                      <Eye className="h-2.5 w-2.5" />
                      <span>مرئي للعميل</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1.5 h-4 bg-muted text-muted-foreground border-border gap-1 flex items-center"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      <span>خاص بالفريق</span>
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {prettySize(att.sizeBytes)}
                  {att.caption ? ` • ${att.caption}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-7 w-7 ${
                    att.isPublic
                      ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  disabled={isBusy}
                  onClick={() => toggleVisibility(att)}
                  title={att.isPublic ? "إخفاء عن العميل (جعله خاصاً)" : "إتاحة للعميل على صفحة التتبع"}
                  aria-label={att.isPublic ? "إخفاء عن العميل" : "إتاحة للعميل"}
                >
                  {att.isPublic ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => open(att)}
                  aria-label="فتح"
                  title="فتح وتنزيل"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>

                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => remove(att)}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}