import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import {
  createOpportunity,
  updateOpportunity,
  listSalesMembers,
} from "@/lib/crm.functions";
import { listCustomersWithStats } from "@/lib/customers.functions";
import type { OpportunityItem, ProjectType, PipelineStage } from "@/lib/crm-types";
import { PROJECT_TYPES, PIPELINE_STAGES } from "@/lib/crm-types";
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

interface OpportunityFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityToEdit?: OpportunityItem | null;
  defaultCustomerId?: string;
  onSuccess?: () => void;
}

export function OpportunityFormModal({
  open,
  onOpenChange,
  opportunityToEdit,
  defaultCustomerId,
  onSuccess,
}: OpportunityFormModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const createOpportunityFn = useServerFn(createOpportunity);
  const updateOpportunityFn = useServerFn(updateOpportunity);
  const listSalesMembersFn = useServerFn(listSalesMembers);
  const listCustomersFn = useServerFn(listCustomersWithStats);

  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("residential");
  const [value, setValue] = useState<string>("0");
  const [salesOwner, setSalesOwner] = useState<string>("");
  const [stage, setStage] = useState<PipelineStage>("new_lead");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      listSalesMembersFn()
        .then((m) => setSalesMembers(m))
        .catch(() => {});

      listCustomersFn({ data: { pageSize: 100 } })
        .then((res) => {
          setCustomers(
            res.rows.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
            })),
          );
        })
        .catch(() => {});

      if (opportunityToEdit) {
        setCustomerId(opportunityToEdit.customerId);
        setTitle(opportunityToEdit.title);
        setProjectType(opportunityToEdit.projectType);
        setValue(String(opportunityToEdit.value));
        setSalesOwner(opportunityToEdit.salesOwner || "");
        setStage(opportunityToEdit.stage);
        setExpectedCloseDate(opportunityToEdit.expectedCloseDate || "");
        setNextAction(opportunityToEdit.nextAction || "");
        setNextActionDate(
          opportunityToEdit.nextActionDate ? opportunityToEdit.nextActionDate.slice(0, 10) : "",
        );
        setSiteAddress(opportunityToEdit.siteAddress || "");
        setNotes(opportunityToEdit.notes || "");
      } else {
        setCustomerId(defaultCustomerId || "");
        setTitle("");
        setProjectType("residential");
        setValue("0");
        setSalesOwner("");
        setStage("new_lead");
        setExpectedCloseDate("");
        setNextAction("");
        setNextActionDate("");
        setSiteAddress("");
        setNotes("");
      }
    }
  }, [open, opportunityToEdit, defaultCustomerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(isRtl ? "عنوان الصفقة مطلوب" : "Title is required");
      return;
    }

    if (!opportunityToEdit && !customerId) {
      toast.error(isRtl ? "يرجى اختيار العميل" : "Customer is required");
      return;
    }

    setSubmitting(true);
    try {
      if (opportunityToEdit) {
        await updateOpportunityFn({
          data: {
            id: opportunityToEdit.id,
            title: title.trim(),
            projectType,
            value: Number(value) || 0,
            salesOwner: salesOwner || null,
            stage,
            expectedCloseDate: expectedCloseDate || null,
            nextAction: nextAction.trim() || null,
            nextActionDate: nextActionDate || null,
            siteAddress: siteAddress.trim() || null,
            notes: notes.trim() || null,
          },
        });
        toast.success(isRtl ? "تم تعديل الفرصة البيعية بنجاح" : "Opportunity updated successfully");
      } else {
        await createOpportunityFn({
          data: {
            customerId,
            title: title.trim(),
            projectType,
            value: Number(value) || 0,
            salesOwner: salesOwner || null,
            stage,
            expectedCloseDate: expectedCloseDate || null,
            nextAction: nextAction.trim() || null,
            nextActionDate: nextActionDate || null,
            siteAddress: siteAddress.trim() || null,
            notes: notes.trim() || null,
          },
        });
        toast.success(isRtl ? "تم إنشاء الفرصة البيعية بنجاح" : "Opportunity created successfully");
      }

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل حفظ البيانات" : "Failed to save"));
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
              {opportunityToEdit
                ? isRtl
                  ? `تعديل الفرصة البيعية (${opportunityToEdit.opportunityNumber})`
                  : `Edit Opportunity (${opportunityToEdit.opportunityNumber})`
                : isRtl
                ? "إنشاء فرصة بيعية جديدة"
                : "Create Commercial Deal"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-4">
            {/* Customer Picker (only if new) */}
            {!opportunityToEdit && (
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "العميل *" : "Customer *"}</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={isRtl ? "اختر العميل..." : "Select customer..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Title */}
            <div className="space-y-1">
              <Label htmlFor="opp-title" className="text-xs">{isRtl ? "عنوان الصفقة / المشروع *" : "Deal Title *"}</Label>
              <Input
                id="opp-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isRtl ? "مثال: تأثيث شقة بالكامل، مطبخ أكريليك..." : "e.g. Full apartment furnishing"}
                className="h-8 text-xs font-medium"
              />
            </div>

            {/* Project Type & Value */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "نوع المشروع" : "Project Type"}</Label>
                <Select value={projectType} onValueChange={(v: ProjectType) => setProjectType(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "القيمة التقديرية (ج.م)" : "Estimated Value (EGP)"}</Label>
                <Input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Sales Owner & Stage */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "المسؤول عن المبيعات" : "Sales Owner"}</Label>
                <Select
                  value={salesOwner || "none"}
                  onValueChange={(v) => setSalesOwner(v === "none" ? "" : v)}
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

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "المرحلة البيعية" : "Pipeline Stage"}</Label>
                <Select value={stage} onValueChange={(v: PipelineStage) => setStage(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Expected Close Date & Site Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "تاريخ الإغلاق المتوقع" : "Expected Close Date"}</Label>
                <Input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "موقع العمل / العنوان" : "Site Address"}</Label>
                <Input
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  placeholder={isRtl ? "عنوان الموقع..." : "e.g. Sheikh Zayed"}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Next Action & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "الخطوة القادمة (Next Action)" : "Next Action"}</Label>
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder={isRtl ? "مثال: إرسال عرض الأسعار..." : "e.g. Send proposal"}
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
                : opportunityToEdit
                ? isRtl
                  ? "تعديل الصفقة"
                  : "Save Changes"
                : isRtl
                ? "إنشاء الفرصة"
                : "Create Deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
