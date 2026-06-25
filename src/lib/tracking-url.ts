/**
 * Build the public customer-facing tracking URL for a given order number.
 *
 * Always derives from `window.location.origin` in browser context, so it
 * works in any environment (local dev, preview deploy, production) without
 * needing an env var. Falls back to a relative `/track?ref=...` path on
 * the server (e.g. during SSR).
 */
export function buildTrackingUrl(ref: string | null | undefined): string {
  const safe = ref ?? "";
  const target = `/track?ref=${encodeURIComponent(safe)}`;
  if (typeof window === "undefined") return target;
  return `${window.location.origin}${target}`;
}
