import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { getR2BatchUploadUrls } from "@/lib/r2.functions";
import { getR2PublicUrl } from "@/lib/r2.utils";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PhotoUploader({
  entityType,
  entityId,
  onUploaded,
  caption,
  onCaptionChange,
  maxFiles = 20,
  label,
  accept = "image/*",
}: {
  entityType: "production-photos" | "avatars" | "attachments" | "logos";
  entityId: string;
  onUploaded: (results: Array<{ key: string; publicUrl: string; caption: string | null }>) => void;
  caption?: string;
  onCaptionChange?: (value: string) => void;
  maxFiles?: number;
  label?: string;
  accept?: string;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number } | null>(
    null,
  );

  const getBatchUploadUrls = useServerFn(getR2BatchUploadUrls);

  function handlePick(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).slice(0, maxFiles);
    setFiles(next);
  }

  function removeAt(i: number) {
    setFiles((arr) => arr.filter((_, idx) => idx !== i));
  }

  /**
   * Upload directly to R2 via presigned PUT. The browser issues a CORS
   * preflight automatically (PUT with Content-Type is non-simple). We do NOT
   * manually probe OPTIONS — every browser fetch with
   * `Access-Control-Request-*` headers is treated as a preflight, and double-
   * probing adds nothing beyond what the real PUT already enforces. If the
   * bucket CORS doesn't allow our origin, the PUT will fail and the rejection
   * surfaces as a real network error in the catch below.
   */
  async function uploadOne(file: File, uploadUrl: string, key: string, publicUrl: string) {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
      credentials: "omit",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`R2 rejected ${file.name}: HTTP ${res.status} ${txt.slice(0, 200)}`);
    }
    return { key, publicUrl };
  }

  async function upload() {
    if (files.length === 0) return;
    if (!entityId) {
      toast.error(t("orders.uploadError"));
      return;
    }
    setBusy(true);
    setProgress({ done: 0, failed: 0, total: files.length });
    const results: Array<{ key: string; publicUrl: string; caption: string | null }> = [];

    let uploads: Array<{ key: string; uploadUrl: string; publicUrl?: string }> = [];
    try {
      const fileInfos = files.map((f) => ({
        filename: f.name,
        contentType: f.type || "image/jpeg",
      }));
      const res = await getBatchUploadUrls({
        data: { files: fileInfos, entityType, entityId },
      });
      uploads = res.uploads ?? [];
    } catch (presignErr: unknown) {
      const msg = errorMessage(presignErr);
      console.error("[PhotoUploader] presign failed", msg);
      toast.error(t("orders.uploadError") + ": " + msg);
      setProgress(null);
      setBusy(false);
      return;
    }

    let done = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const info = uploads[i];
      if (!info) {
        failed++;
        setProgress({ done, failed, total: files.length });
        continue;
      }
      try {
        const { key, publicUrl } = await uploadOne(
          file,
          info.uploadUrl,
          info.key,
          info.publicUrl || getR2PublicUrl(info.key),
        );
        results.push({ key, publicUrl, caption: caption ?? null });
        done++;
      } catch (e: unknown) {
        console.error("[PhotoUploader] upload failed", file.name, errorMessage(e));
        failed++;
      }
      setProgress({ done, failed, total: files.length });
    }

    if (done > 0) {
      onUploaded(results);
      toast.success(t("orders.uploadSuccess", { n: done }));
    }
    if (failed > 0) {
      toast.error(t("orders.uploadFailed", { n: failed }));
    }
    setFiles([]);
    setProgress(null);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2 p-3 border rounded-md bg-muted/30">
      <label className="text-xs font-medium text-foreground">
        {label ?? t("orders.uploadPhotos")}
      </label>
      <input
        type="file"
        accept={accept}
        multiple
        onChange={(e) => handlePick(e.target.files)}
        className="text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-2 file:py-1"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-background px-2 py-1 rounded border"
            >
              {f.name}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={t("common.delete")}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {onCaptionChange && (
        <Input
          type="text"
          placeholder={t("orders.photoCaption")}
          value={caption ?? ""}
          onChange={(e) => onCaptionChange(e.target.value)}
          className="text-xs"
        />
      )}
      {progress && (
        <div className="text-xs text-muted-foreground">
          {t("orders.uploading", { n: progress.done })} / {progress.total}
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
        {busy
          ? t("orders.uploading", { n: files.length })
          : t("orders.upload", { n: files.length })}
      </Button>
    </div>
  );
}
