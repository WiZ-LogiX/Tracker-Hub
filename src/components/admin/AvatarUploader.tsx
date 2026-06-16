import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { getR2BatchUploadUrls } from "@/lib/r2.functions";
import { getR2PublicUrl } from "@/lib/r2.utils";
import { updateUserAvatar } from "@/lib/auth.functions";

const MAX_DIMENSION = 512;

async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.round(bitmap.width * scale);
  const targetH = Math.round(bitmap.height * scale);
  // Prefer createImageBitmap + OffscreenCanvas when available; in Cloudflare
  // Workers we don't run this component, so the polyfill below is fine.
  const canvas: any = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(targetW, targetH)
    : Object.assign(document.createElement("canvas"), { width: targetW, height: targetH });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const blob = await canvas.convertToBlob
    ? await canvas.convertToBlob({ type: "image/webp", quality: 0.85 })
    : await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b: Blob | null) => (b ? resolve(b) : reject(new Error("Failed to encode"))),
          "image/webp",
          0.85,
        ),
      );
  return blob;
}

export function AvatarUploader({
  userId,
  currentKey,
  onUpdated,
  size = 64,
}: {
  userId: string;
  currentKey: string | null;
  onUpdated: (key: string | null) => void;
  size?: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const batchFn = useServerFn(getR2BatchUploadUrls);
  const updateFn = useServerFn(updateUserAvatar);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return toast.error("يجب اختيار صورة");
    }
    setBusy(true);
    try {
      const blob = await resizeImage(file);
      const filename = `${userId}-${Date.now()}.webp`;
      const contentType = "image/webp";

      const presign = await batchFn({
        data: {
          files: [{ filename, contentType }],
          entityType: "avatars",
          entityId: userId,
        },
      });
      const uploadInfo = (presign as any).uploads?.[0];
      if (!uploadInfo?.uploadUrl) throw new Error("فشل توقيع URL للرفع");

      // Upload directly to R2.
      const res = await fetch(uploadInfo.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
        credentials: "omit",
      });
      if (!res.ok) {
        throw new Error(`R2 رفض الصورة (HTTP ${res.status})`);
      }
      const publicUrl =
        uploadInfo.publicUrl ?? getR2PublicUrl(uploadInfo.key);

      // Persist the key on the user profile.
      await updateFn({
        data: { userId, avatarKey: uploadInfo.key },
      });

      onUpdated(uploadInfo.key);
      toast.success("تم تحديث الصورة");
      // We don't return the URL because we don't know the public CDN; consumers
      // can derive it via getR2PublicUrl(key) when rendering. The onUpdated
      // callback is enough for the page state.
      void publicUrl;
    } catch (e: any) {
      toast.error(e?.message ?? "فشل رفع الصورة");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      await updateFn({ data: { userId, avatarKey: null } });
      onUpdated(null);
      toast.success("تم إزالة الصورة");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل إزالة الصورة");
    } finally {
      setBusy(false);
    }
  }

  const currentUrl = currentKey ? getR2PublicUrl(currentKey) : null;

  return (
    <div className="flex items-center gap-3">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt="avatar"
          width={size}
          height={size}
          className="rounded-full border object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full border bg-muted flex items-center justify-center text-xs text-muted-foreground"
          style={{ width: size, height: size }}
        >
          — —
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="inline-flex">
          <input
            type="file"
            accept="image/*"
            onChange={onPick}
            disabled={busy}
            className="sr-only"
          />
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border cursor-pointer ${
              busy ? "opacity-50 pointer-events-none" : "hover:bg-accent"
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            {currentKey ? "استبدال" : "رفع صورة"}
          </span>
        </label>
        {currentKey ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={busy}
            className="h-6 px-2 text-xs text-destructive"
          >
            <X className="h-3.5 w-3.5" /> إزالة
          </Button>
        ) : null}
      </div>
    </div>
  );
}