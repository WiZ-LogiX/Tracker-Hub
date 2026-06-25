import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  getAttachmentUrl,
  deleteAttachment,
  listAttachments,
  type AttachmentRow,
} from "@/lib/attachments.functions";
import { getR2PublicUrl } from "@/lib/r2.utils";

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
  entityType: "order" | "quote" | "invoice" | "customer";
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
    if (att.isPublic) {
      window.open(getR2PublicUrl(att.storageKey), "_blank", "noopener,noreferrer");
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

  if (loading) {
    return <div className="text-xs text-muted-foreground">...جاري تحميل المرفقات</div>;
  }
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">{t("common.noData")}</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {items.map(att => {
        const isImage = att.contentType.startsWith("image/");
        const previewSrc = att.isPublic
          ? getR2PublicUrl(att.storageKey)
          : signed[att.id] ?? "";
        return (
          <div
            key={att.id}
            className="flex items-center gap-3 p-2 border rounded-md bg-card"
          >
            {previewSrc && isImage ? (
              <img
                src={previewSrc}
                alt={att.fileName}
                className="h-12 w-12 object-cover rounded border bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                {isImage ? (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{att.fileName}</div>
              <div className="text-xs text-muted-foreground">
                {prettySize(att.sizeBytes)}
                {att.caption ? ` • ${att.caption}` : ""}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => open(att)}
              aria-label="فتح"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(att)}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}