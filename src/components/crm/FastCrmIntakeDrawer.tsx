import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { quickCrmIntake } from "@/lib/crm.functions";
import type { LeadSource, QuickCrmIntakeResult } from "@/lib/crm-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  FileText,
  User,
  Phone,
  Layers,
  Coins,
  ChevronDown,
  ChevronUp,
  MapPin,
  Share2,
  FileEdit,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface FastCrmIntakeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: QuickCrmIntakeResult) => void;
}

const CATEGORY_OPTIONS = [
  { value: "Kitchen", labelEn: "Modern / Classic Kitchen", labelAr: "مطبخ مودرن / كلاسيك" },
  { value: "Dressing Room", labelEn: "Dressing Room & Wardrobes", labelAr: "غرفة ملابس ودواليب" },
  { value: "Bathroom Vanity", labelEn: "Bathroom Vanity Units", labelAr: "وحدات حمام" },
  { value: "Living & TV Unit", labelEn: "Living & TV Units", labelAr: "وحدات معيشة وتلفزيون" },
  { value: "Commercial Fit-Out", labelEn: "Commercial & Office Fit-Out", labelAr: "مقر تجاري / إداري" },
  { value: "Full Residence Joinery", labelEn: "Full Residence Joinery", labelAr: "تشطيب سكني متكامل" },
  { value: "Doors & Cladding", labelEn: "Doors & Wall Cladding", labelAr: "أبواب وتجاليد حوائط" },
  { value: "Custom Furniture", labelEn: "Bespoke Custom Furniture", labelAr: "أعمال نجارة مخصصة" },
];

const SOURCE_OPTIONS: Array<{ value: LeadSource; labelEn: string; labelAr: string }> = [
  { value: "walk_in", labelEn: "Showroom Visit / Walk-in", labelAr: "زيارة المعرض" },
  { value: "whatsapp", labelEn: "WhatsApp Inquiry", labelAr: "استفسار واتساب" },
  { value: "facebook", labelEn: "Facebook", labelAr: "فيسبوك" },
  { value: "instagram", labelEn: "Instagram", labelAr: "انستجرام" },
  { value: "referral", labelEn: "Client Referral / Word of Mouth", labelAr: "ترشيح عميل / صديق" },
  { value: "website", labelEn: "Website Lead", labelAr: "الموقع الإلكتروني" },
  { value: "exhibition", labelEn: "Exhibition / Event", labelAr: "معرض" },
  { value: "other", labelEn: "Other Source", labelAr: "مصدر آخر" },
];

export function FastCrmIntakeDrawer({
  open,
  onOpenChange,
  onSuccess,
}: FastCrmIntakeDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();

  const quickCrmIntakeFn = useServerFn(quickCrmIntake);

  // Primary 4 fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("Kitchen");
  const [estimatedBudget, setEstimatedBudget] = useState("");

  // Collapsible Additional Details
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [savingAction, setSavingAction] = useState<"pipeline" | "quote" | null>(null);

  const resetForm = () => {
    setName("");
    setPhone("");
    setCategory("Kitchen");
    setEstimatedBudget("");
    setDetailsOpen(false);
    setSource("walk_in");
    setLocation("");
    setNotes("");
    setSavingAction(null);
  };

  const handleAction = async (action: "pipeline" | "quote") => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      toast.error(isRtl ? "يرجى كتابة اسم العميل" : "Customer name is required");
      return;
    }

    if (!trimmedPhone) {
      toast.error(isRtl ? "يرجى كتابة رقم الهاتف" : "Phone number is required");
      return;
    }

    setSavingAction(action);

    try {
      const budgetNum = estimatedBudget.trim() ? parseFloat(estimatedBudget.replace(/,/g, "")) : undefined;
      const initialStage = action === "quote" ? "quotation" : "new_lead";

      const result = await quickCrmIntakeFn({
        data: {
          name: trimmedName,
          phone: trimmedPhone,
          category,
          estimatedBudget: !isNaN(budgetNum as number) ? budgetNum : undefined,
          source,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
          initialStage,
        },
      });

      const customerBadge = result.isExistingCustomer
        ? (isRtl ? "عميل مسجل مسبقاً" : "Existing Customer")
        : (isRtl ? "عميل جديد" : "New Customer");

      if (action === "pipeline") {
        toast.success(
          isRtl
            ? `تم تسجيل الاستفسار كصفقة رقم ${result.opportunityNumber} (${customerBadge})`
            : `Inquiry saved as deal ${result.opportunityNumber} (${customerBadge})`,
        );
        onOpenChange(false);
        resetForm();
        if (onSuccess) onSuccess(result);
      } else {
        toast.success(
          isRtl
            ? `تم إنشاء الصفقة ${result.opportunityNumber}، جاري فتح محرر عرض السعر...`
            : `Deal ${result.opportunityNumber} created, opening quote builder...`,
        );
        onOpenChange(false);
        resetForm();
        if (onSuccess) onSuccess(result);
        navigate({
          to: "/admin/quotes/new",
          search: {
            customerId: result.customerId,
            opportunityId: result.opportunityId,
          },
        });
      }
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تسجيل الاستفسار" : "Failed to record inquiry"));
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="w-full sm:max-w-md p-0 flex flex-col h-full bg-background border-border overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="p-5 pb-3 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2 text-primary mb-1">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t("fastIntake.quickInquiry", "Fast CRM Intake")}
            </span>
          </div>
          <SheetTitle className="text-lg font-bold tracking-tight text-foreground">
            {isRtl ? "تسجيل استفسار عميل سريع" : "Quick Commercial Inquiry"}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {t(
              "fastIntake.quickInquiryDesc",
              "Rapid commercial intake: customer, opportunity, and direct quote handoff.",
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Primary 4 Fields */}
          <div className="space-y-3.5">
            {/* 1. Customer Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>{t("fastIntake.customerName", "Customer Name")}</span>
                <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder={t("fastIntake.customerNamePlaceholder", "e.g. Eng. Tarek Nour")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            </div>

            {/* 2. Phone Number */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>{t("fastIntake.phoneNumber", "Phone Number")}</span>
                <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder={t("fastIntake.phoneNumberPlaceholder", "010XXXXXXXX or +20...")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-xs font-mono"
                dir="ltr"
              />
            </div>

            {/* 3. Category / Interest */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>{t("fastIntake.category", "Category / Interest")}</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("fastIntake.categoryPlaceholder", "Select category")} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value} className="text-xs">
                      {isRtl ? cat.labelAr : cat.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Estimated Budget (EGP) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Coins className="h-3.5 w-3.5 text-primary" />
                <span>{t("fastIntake.budget", "Estimated Budget (EGP)")}</span>
              </Label>
              <Input
                type="number"
                placeholder={t("fastIntake.budgetPlaceholder", "e.g. 150000")}
                value={estimatedBudget}
                onChange={(e) => setEstimatedBudget(e.target.value)}
                className="h-9 text-xs font-mono"
                min="0"
                step="1000"
              />
            </div>
          </div>

          {/* Collapsible Additional Details */}
          <div className="border border-border/60 rounded-xl overflow-hidden bg-muted/15 transition-all">
            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileEdit className="h-3.5 w-3.5 text-primary/70" />
                <span>{t("fastIntake.optionalDetails", "Additional Details (Source, Location, Notes)")}</span>
              </span>
              {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {detailsOpen && (
              <div className="p-3.5 pt-1 space-y-3 border-t border-border/50 bg-background/50">
                {/* Acquisition Source */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium flex items-center gap-1 text-muted-foreground">
                    <Share2 className="h-3 w-3" />
                    <span>{t("fastIntake.source", "Acquisition Source")}</span>
                  </Label>
                  <Select value={source} onValueChange={(v) => setSource(v as LeadSource)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">
                          {isRtl ? s.labelAr : s.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Location / Area */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{t("fastIntake.location", "Location / Area")}</span>
                  </Label>
                  <Input
                    placeholder={t("fastIntake.locationPlaceholder", "e.g. New Cairo, Sheikh Zayed")}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    {t("fastIntake.notes", "Intake Notes")}
                  </Label>
                  <Textarea
                    placeholder={t("fastIntake.notesPlaceholder", "Specific requirements, dimensions, preferences...")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with 2 Primary Actions */}
        <SheetFooter className="p-4 border-t border-border/70 bg-muted/20 flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={savingAction !== null}
            onClick={() => handleAction("pipeline")}
            className="flex-1 h-9 text-xs font-semibold gap-1.5"
          >
            {savingAction === "pipeline" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            )}
            <span>{t("fastIntake.saveToPipeline", "Save to Pipeline")}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={savingAction !== null}
            onClick={() => handleAction("quote")}
            className="flex-1 h-9 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground shadow-xs"
          >
            {savingAction === "quote" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span>{t("fastIntake.saveAndBuildQuote", "Save & Build Quote")}</span>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
