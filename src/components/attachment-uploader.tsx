import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { getR2BatchUploadUrls } from "@/lib/r2.functions";
import { getR2PublicUrl } from "@/lib/r2.utils";
import { registerAttachment } from "@/lib/attachments.functions";

const MAX_FILES = 20;
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = /^image\/|application\/pdf|text\/csv$/;

interface PendingFile {
  file: File;
  previewUrl?: string;
}

export function AttachmentUploader({
  entityType,
  entityId,
  isPublic = false,
  onUploaded,
}: {
  entityType: "order" | "quote" | "invoice" | "customer";
  entityId: string;
  isPublic?: boolean;
  onUploaded?: (rows: Array<{
    id: string;
    storageKey: string;
    publicUrl: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }>) => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({
    done: 0,
    failed: 0,
    total: 0,
  });
  const [caption, setCaption] = useState("");

  const getBatchUploadUrls = useServerFn(getR2BatchUploadUrls);
  const registerFn = useServerFn(registerAttachment);

  function handlePick(list: FileList | null) {
    if (!list) return;
    const next: PendingFile[] = [];
    for (const f of Array.from(list).slice(0, MAX_FILES)) {
      if (f.size > MAX_BYTES) {
        toast.error(`تجاوز ${f.name} 50MB`);
        continue;
      }
      if (!ALLOWED_MIME.test(f.type)) {
        toast.error(`نوع غير مدعوم: ${f.name}`);
        continue;
      }
      next.push({
        file: f,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      });
    }
    setFiles(next);
  }

  function removeAt(i: number) {
    setFiles(arr => {
      const removed = arr[i];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return arr.filter((_, idx) => idx !== i);
    });
  }

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, failed: 0, total: files.length });
    const written: Array<{
      id: string;
      storageKey: string;
      publicUrl: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    }> = [];
    let done = 0;
    let failed = 0;

    let uploads: Array<{ key: string; uploadUrl: string; publicUrl?: string }> = [];
    try {
      const info = await getBatchUploadUrls({
        data: {
          files: files.map(f => ({ filename: f.file.name, contentType: f.file.type })),
          entityType: "attachments",
          entityId,
        },
      });
      uploads = info.uploads ?? [];
    } catch (e: any) {
      const msg = e?.message ?? String(e) ?? "presign failed";
      toast.error(`فشل توقيع الروابط: ${msg}`);
      setBusy(false);
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i].file;
      const info = uploads[i];
      if (!info) {
        failed++;
        setProgress({ done, failed, total: files.length });
        continue;
      }
      try {
        const res = await fetch(info.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
          credentials: "omit",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`R2 رفض ${file.name}: HTTP ${res.status} ${txt.slice(0, 200)}`);
        }
        const publicUrl = info.publicUrl ?? getR2PublicUrl(info.key);
        const reg = await registerFn({
          data: {
            entityType,
            entityId,
            fileName: file.name,
            storageKey: info.key,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            caption: caption.trim() || null,
            isPublic,
          },
        });
        written.push({
          id: reg.item.id,
          storageKey: info.key,
          publicUrl,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
        done++;
      } catch (e: any) {
        console.error("[AttachmentUploader] upload failed", file.name, e?.message);
        failed++;
      }
      setProgress({ done, failed, total: files.length });
    }

    if (written.length) {
      onUploaded?.(written);
      toast.success(`تم رفع ${done} ملف(ات)`);
      setFiles([]);
      setCaption("");
    }
    if (failed > 0) toast.error(`فشل ${failed} ملف(ات)`);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2 p-3 border rounded-md bg-muted/30">
      <label className="text-xs font-medium">إرفاق ملفات</label>
      <input
        type="file"
        multiple
        accept="image/*,application/pdf,text/csv"
        onChange={e => handlePick(e.target.files)}
        className="text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-2 file:py-1"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs bg-background px-2 py-1 rounded border"
            >
              {p.previewUrl ? (
                <img
                  src={p.previewUrl}
                  alt=""
                  className="h-8 w-8 object-cover rounded"
                />
              ) : (
                <span className="inline-block h-8 w-8 bg-muted rounded" />
              )}
              <span className="truncate max-w-[160px]">{p.file.name}</span>
              <span className="text-muted-foreground">
                {(p.file.size / 1024).toFixed(0)}KB
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="إزالة"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Input
        placeholder="وصف مختصر (اختياري)"
        value={caption}
        onChange={e => setCaption(e.target.value)}
        className="text-xs"
      />
      {progress.total > 0 && (
        <div className="text-xs text-muted-foreground">
          {progress.done} / {progress.total}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        disabled={files.length === 0 || busy}
        onClick={upload}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        {busy ? "جارٍ الرفع…" : `رفع ${files.length} ملف(ات)`}
      </Button>
    </div>
  );
}