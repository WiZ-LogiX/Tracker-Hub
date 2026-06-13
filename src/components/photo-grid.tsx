import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useSignedR2Urls } from "@/lib/useSignedR2Urls";
import { STAGE_LABEL_AR, OrderStage } from "@/lib/stages";
import { ORDER_STAGES } from "@/lib/stages";

export interface PhotoRow {
  id: string;
  stage?: string | null;
  photo_url: string;
  caption?: string | null;
  created_at: string;
}

export function PhotoGrid({
  photos,
  onDelete,
  readOnly = false,
}: {
  photos: PhotoRow[];
  onDelete?: (p: PhotoRow) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const urls = photos.map(p => p.photo_url);
  const { data: signedMap, isLoading } = useSignedR2Urls(urls);

  const groups: Record<string, PhotoRow[]> = {};
  for (const p of photos) {
    const k = p.stage || "unknown";
    (groups[k] ||= []).push(p);
  }
  const stageOrder = ORDER_STAGES.filter(s => groups[s]);

  if (photos.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-6 text-center">
        {t("orders.noPhotos")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stageOrder.map(stage => (
        <div key={stage} className="space-y-1">
          <div className="text-xs font-medium text-gold">
            {STAGE_LABEL_AR[stage as OrderStage]}{" "}
            <span className="text-muted-foreground font-normal">
              ({groups[stage].length})
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {groups[stage].map(p => {
              const src = signedMap?.get(p.photo_url) ?? p.photo_url;
              return (
                <div key={p.id} className="relative group">
                  <a href={src} target="_blank" rel="noreferrer">
                    <img
                      src={src}
                      alt={p.caption ?? ""}
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded border bg-muted"
                    />
                  </a>
                  {p.caption && (
                    <div className="mt-1 text-[10px] text-muted-foreground truncate">
                      {p.caption}
                    </div>
                  )}
                  {!readOnly && onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      className="absolute top-1 left-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 inline-flex items-center gap-1"
                      aria-label={t("orders.delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t("orders.delete")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {isLoading && stageOrder.length === 0 && (
        <div className="text-xs text-muted-foreground">{t("orders.loading")}</div>
      )}
    </div>
  );
}