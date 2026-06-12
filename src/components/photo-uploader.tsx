import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { getR2BatchUploadUrls } from "@/lib/r2.functions";
import { getR2PublicUrl } from "@/lib/r2.utils";

export function PhotoUploader({
  entityType,
  entityId,
  onUploaded,
  caption,
  onCaptionChange,
  maxFiles = 20,
}: {
  entityType: "production-photos" | "avatars" | "attachments" | "logos";
  entityId: string;
  onUploaded: (results: Array<{ key: string; publicUrl: string; caption: string | null }>) => void;
  caption?: string;
  onCaptionChange?: (value: string) => void;
  maxFiles?: number;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number } | null>(null);

  const getBatchUploadUrls = useServerFn(getR2BatchUploadUrls);

  function handlePick(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).slice(0, maxFiles);
    setFiles(next);
  }

  function removeAt(i: number) {
    setFiles(arr => arr.filter((_, idx) => idx !== i));
  }

  /**
   * Direct PUT to R2. Two failure modes show up as "Failed to fetch":
   *   1. CORS preflight rejection → opaque network error, no status.
   *   2. Mixed-content (http page → https R2).
   * We attempt a HEAD first to surface the real CORS failure with a useful
   * message; if that succeeds, the PUT is allowed too.
   */
  async function uploadOne(file: File, uploadUrl: string, key: string, publicUrl: string) {
    // Diagnostic: ping the bucket with HEAD first. If even a HEAD is CORS-rejected,
    // the user gets a clearer signal than the generic "Failed to fetch" on PUT.
    try {
      await fetch(uploadUrl.split("?")[0], {
        method: "HEAD",
        credentials: "omit",
      });
    } catch (e: any) {
      throw new Error(
        `CORS preflight failed for ${file.name}. The R2 bucket must allow PUT/GET/HEAD ` +
        `from this origin (see src/lib/r2.config.ts). Network error: ${e?.message ?? "unknown"}`,
      );
    }

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

    // 1. Server-side: get presigned PUT URLs for all files.
    let uploads: Array<{ key: string; uploadUrl: string; publicUrl?: string }> = [];
    try {
      const fileInfos = files.map(f => ({
        filename: f.name,
        contentType: f.type || "image/jpeg",
      }));
      const res = await getBatchUploadUrls({
        data: { files: fileInfos, entityType, entityId },
      });
      uploads = res.uploads ?? [];
    } catch (presignErr: any) {
      const msg =
        presignErr?.message ?? String(presignErr) ?? "presign failed";
      console.error("[PhotoUploader] presign failed", msg);
      toast.error(t("orders.uploadError") + ": " + msg);
      setProgress(null);
      setBusy(false);
      return;
    }

    // 2. Client-side: PUT each file directly to R2.
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
      } catch (e: any) {
        console.error("[PhotoUploader] PUT failed", file.name, e?.message);
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
        {t("orders.uploadPhotos")}
      </label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={e => handlePick(e.target.files)}
        className="text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-2 file:py-1"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-background px-2 py-1 rounded border">
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
          onChange={e => onCaptionChange(e.target.value)}
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
        {busy ? t("orders.uploading", { n: files.length }) : t("orders.upload", { n: files.length })}
      </Button>
    </div>
  );
}