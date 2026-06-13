import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getR2ViewUrls } from "@/lib/r2-views.functions";

/**
 * Sprint 0.3: TanStack Query wrapper around the R2 signed-URL server fn.
 *
 * Photos stored in `production_photos.photo_url` are public CDN URLs (or
 * legacy R2 URLs). For private buckets we re-sign them through the server.
 * The cache is 25 minutes — slightly less than the 30-minute signed-URL TTL
 * we issue server-side, so consumers never see a stale signature.
 *
 * The hook is stable across re-renders for the same input by keying on a
 * sorted, deduped `urlsKey`. Pass `enabled: false`-style controls via the
 * caller; we only fetch when there's at least one URL.
 */
export function useSignedR2Urls(urls: string[]) {
  const fetchViews = useServerFn(getR2ViewUrls);

  const sorted = Array.from(new Set(urls)).filter(Boolean).sort();
  const urlsKey = sorted.join("\n");

  return useQuery({
    queryKey: ["r2", "views", urlsKey],
    enabled: sorted.length > 0,
    staleTime: 25 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchViews({ data: { urls: sorted } });
      const map = new Map<string, string>();
      for (const v of res.views) map.set(v.original, v.url);
      return map;
    },
  });
}