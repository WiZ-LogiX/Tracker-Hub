import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface ShareTrackingLinkProps {
  url: string;
  ref: string | null;
  recipientPhone?: string | null;
  customerName?: string | null;
  variant?: "inline" | "block";
  /** When provided, WhatsApp button calls this instead of opening wa.me */
  onWhatsAppSend?: () => void;
  /** Show a loading spinner on the WhatsApp button */
  whatsappLoading?: boolean;
}

/**
 * Two-action share helper used by the production-tracking tab.
 *
 *  - Copy button copies the public `/track?ref=...` URL to the clipboard
 *    with a `navigator.clipboard.writeText` primary path and a hidden
 *    `textarea + document.execCommand("copy")` fallback for older Safari.
 *  - WhatsApp button opens `wa.me` deep-linked with the same URL plus a
 *    friendly Arabic message; includes the customer's phone when known so
 *    WhatsApp often pre-selects the existing conversation.
 *
 * The link is always derived relative to `window.location.origin` in
 * browser context so works in any environment without needing env vars.
 */
export function ShareTrackingLink({
  url,
  ref,
  recipientPhone,
  customerName,
  variant = "inline",
  onWhatsAppSend,
  whatsappLoading,
}: ShareTrackingLinkProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (typeof window === "undefined") return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success(t("track.copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch (err: any) {
      toast.error(err?.message || t("track.copyFailed"));
    }
  }

  function onWhatsApp() {
    if (onWhatsAppSend) {
      onWhatsAppSend();
      return;
    }
    const phone = (recipientPhone ?? "").replace(/[^\d]/g, "");
    const greeting = customerName ? `${customerName}، ` : "";
    const safeRef = ref ?? "";
    const text =
      `${greeting}رابط تتبع الطلب ${safeRef}: ${url}\n` +
      `يمكنكم متابعة المراحل والصور مباشرة عبر هذا الرابط.`;
    const href = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const wrapCls =
    variant === "block"
      ? "flex flex-col sm:flex-row gap-2 w-full"
      : "flex items-center gap-1";

  return (
    <div className={wrapCls}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onCopy}
        className="gap-1.5"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? t("track.copied") : t("track.copyLink")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="default"
        onClick={onWhatsApp}
        disabled={whatsappLoading}
        className="gap-1.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white"
      >
        {whatsappLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MessageCircle className="h-3.5 w-3.5" />
        )}
        {t("track.sendWhatsApp")}
      </Button>
    </div>
  );
}
