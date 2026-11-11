import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { createLead, updateLead, listSalesMembers } from "@/lib/crm.functions";
import type { LeadItem, LeadSource, LeadStatus } from "@/lib/crm-types";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/crm-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

interface LeadFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadToEdit?: LeadItem | null;
  onSuccess?: () => void;
}

export function LeadFormModal({
  open,
  onOpenChange,
  leadToEdit,
  onSuccess,
}: LeadFormModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const createLeadFn = useServerFn(createLead);
  const updateLeadFn = useServerFn(updateLead);
  const listSalesMembersFn = useServerFn(listSalesMembers);

  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState<LeadSource>("whatsapp");
  const [interestedProduct, setInterestedProduct] = useState("");
  const [estimatedBudget, setEstimatedBudget] = useState<string>("");
  const [assignedSalesperson, setAssignedSalesperson] = useState<string>("");
  const [status, setStatus] = useState<LeadStatus>("new");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      listSalesMembersFn()
        .then((members) => setSalesMembers(members))
        .catch(() => {});

      if (leadToEdit) {
        setName(leadToEdit.name);
        setPhone(leadToEdit.phone || "");
        setEmail(leadToEdit.email || "");
        setLocation(leadToEdit.location || "");
        setSource(leadToEdit.source);
        setInterestedProduct(leadToEdit.interestedProduct || "");
        setEstimatedBudget(leadToEdit.estimatedBudget ? String(leadToEdit.estimatedBudget) : "");
        setAssignedSalesperson(leadToEdit.assignedSalesperson || "");
        setStatus(leadToEdit.status);
        setNextAction(leadToEdit.nextAction || "");
        setNextActionDate(leadToEdit.nextActionDate ? leadToEdit.nextActionDate.slice(0, 10) : "");
        setNotes(leadToEdit.notes || "");
      } else {
        setName("");
        setPhone("");
        setEmail("");
        setLocation("");
        setSource("whatsapp");
        setInterestedProduct("");
        setEstimatedBudget("");
        setAssignedSalesperson("");
        setStatus("new");
        setNextAction("");
        setNextActionDate("");
        setNotes("");
      }
    }
  }, [open, leadToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(isRtl ? "يرجى إدخال اسم العميل المحتمل" : "Name is required");
      return;
    }

    setSubmitting(true);
    try {
      if (leadToEdit) {
        await updateLeadFn({
          data: {
            id: leadToEdit.id,
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            location: location.trim() || null,
            source,
            interestedProduct: interestedProduct.trim() || null,
            estimatedBudget: estimatedBudget ? Number(estimatedBudget) : null,
            assignedSalesperson: assignedSalesperson || null,
            status,
            nextAction: nextAction.trim() || null,
            nextActionDate: nextActionDate || null,
            notes: notes.trim() || null,
          },
        });
        toast.success(isRtl ? "تم تعديل بيانات العميل المحتمل بنجاح" : "Lead updated successfully");
      } else {
        await createLeadFn({
          data: {
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            location: location.trim() || null,
            source,
            interestedProduct: interestedProduct.trim() || null,
            estimatedBudget: estimatedBudget ? Number(estimatedBudget) : null,
            assignedSalesperson: assignedSalesperson || null,
            nextAction: nextAction.trim() || null,
            nextActionDate: nextActionDate || null,
            notes: notes.trim() || null,
          },
        });
        toast.success(isRtl ? "تم إنشاء العميل المحتمل بنجاح" : "Lead created successfully");
      }

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل حفظ البيانات" : "Failed to save lead"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-xs max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {leadToEdit
                ? isRtl
                  ? `تعديل العميل المحتمل (${leadToEdit.leadNumber})`
                  : `Edit Lead (${leadToEdit.leadNumber})`
                : isRtl
                ? "إضافة عميل محتمل جديد"
                : "New Lead Intake"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-4">
            {/* Name & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lead-name" className="text-xs">{isRtl ? "الاسم الكامل *" : "Full Name *"}</Label>
                <Input
                  id="lead-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isRtl ? "مثال: م. أحمد عبد الله" : "e.g. John Doe"}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="lead-phone" className="text-xs">{isRtl ? "رقم الهاتف / واتساب" : "Phone / WhatsApp"}</Label>
                <Input
                  id="lead-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Email & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "البريد الإلكتروني" : "Email"}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "المدينة / الموقع" : "Location / City"}</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={isRtl ? "القاهرة الجديدة، الشيخ زايد..." : "e.g. New Cairo"}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Source & Salesperson */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "مصدر العميل" : "Lead Source"}</Label>
                <Select value={source} onValueChange={(v: LeadSource) => setSource(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "المسؤول عن المتابعة" : "Assigned Salesperson"}</Label>
                <Select
                  value={assignedSalesperson || "none"}
                  onValueChange={(v) => setAssignedSalesperson(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={isRtl ? "اختر مسؤولاً" : "Select owner"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isRtl ? "بدون تعيين" : "Unassigned"}</SelectItem>
                    {salesMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Interested Product & Estimated Budget */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "المنتج أو الخدمة المطلوبة" : "Interested In"}</Label>
                <Input
                  value={interestedProduct}
                  onChange={(e) => setInterestedProduct(e.target.value)}
                  placeholder={isRtl ? "مثال: مطبخ خشب زان، دريسنج..." : "e.g. Modern kitchen"}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "الميزانية المتوقعة (ج.م)" : "Estimated Budget (EGP)"}</Label>
                <Input
                  type="number"
                  min={0}
                  value={estimatedBudget}
                  onChange={(e) => setEstimatedBudget(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Status if editing */}
            {leadToEdit && (
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "حالة العميل" : "Lead Status"}</Label>
                <Select value={status} onValueChange={(v: LeadStatus) => setStatus(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Next Action & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "الخطوة القادمة (Next Action)" : "Next Action"}</Label>
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder={isRtl ? "مثال: مكالمة تأكيد موعد، إرسال كتالوج..." : "e.g. Schedule call"}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "تاريخ الإجراء القادم" : "Next Action Date"}</Label>
                <Input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs">{isRtl ? "ملاحظات إضافية" : "Notes"}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isRtl ? "أية تفاصيل تخص متطلبات العميل..." : "Any additional context..."}
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="h-8 text-xs font-semibold"
            >
              {submitting
                ? isRtl
                  ? "جارٍ الحفظ..."
                  : "Saving..."
                : leadToEdit
                ? isRtl
                  ? "تحديث العميل"
                  : "Save Changes"
                : isRtl
                ? "إنشاء العميل المحتمل"
                : "Create Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
