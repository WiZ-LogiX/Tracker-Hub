import {
  LEAD_SOURCES,
  LOST_REASONS,
} from "@/lib/crm-types";

export function calculateRate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const rate = (numerator / denominator) * 100;
  return Math.round(rate * 10) / 10;
}

export function formatLostReasonLabel(key: string): { label: string; labelAr: string } {
  const found = LOST_REASONS.find((r) => r.value === key);
  if (found) {
    return { label: found.label, labelAr: found.labelAr };
  }
  if (key === "unspecified") {
    return { label: "Unspecified Reason", labelAr: "سبب غير محدد" };
  }
  return { label: key, labelAr: key };
}

const SOURCE_LABELS_AR: Record<string, string> = {
  whatsapp: "واتساب",
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  website: "الموقع الإلكتروني",
  referral: "توصية / ترشيح",
  walk_in: "زيارة المعرض",
  exhibition: "معرض",
  existing_customer: "عميل سابق",
  other: "أخرى",
};

export function formatSourceLabel(sourceKey: string): { label: string; labelAr: string } {
  const found = LEAD_SOURCES.find((s) => s.value === sourceKey);
  const labelAr = SOURCE_LABELS_AR[sourceKey] || sourceKey;
  if (found) {
    return { label: found.label, labelAr };
  }
  return { label: sourceKey, labelAr };
}
