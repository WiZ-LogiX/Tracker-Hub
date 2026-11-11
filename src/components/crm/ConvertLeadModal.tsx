import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { convertLead, listSalesMembers } from "@/lib/crm.functions";
import { listCustomersWithStats } from "@/lib/customers.functions";
import type { LeadItem, ProjectType } from "@/lib/crm-types";
import { PROJECT_TYPES } from "@/lib/crm-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  UserCheck,
  Building,
  Sparkles,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

interface ConvertLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadItem | null;
  onSuccess?: (result: { customerId: string; opportunityId: string }) => void;
}

export function ConvertLeadModal({
  open,
  onOpenChange,
  lead,
  onSuccess,
}: ConvertLeadModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const convertLeadFn = useServerFn(convertLead);
  const listSalesMembersFn = useServerFn(listSalesMembers);
  const listCustomersFn = useServerFn(listCustomersWithStats);

  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [existingCustomers, setExistingCustomers] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [customerMode, setCustomerMode] = useState<"new" | "existing">("new");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // New Customer Fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Opportunity Fields
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("residential");
  const [dealValue, setDealValue] = useState<string>("");
  const [salesOwner, setSalesOwner] = useState<string>("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && lead) {
      // Pre-fill fields from lead
      setCustomerName(lead.name);
      setCustomerPhone(lead.phone || "");
      setCustomerEmail(lead.email || "");
      setCustomerAddress(lead.location || "");

      setOpportunityTitle(
        lead.interestedProduct
          ? `${lead.name} - ${lead.interestedProduct}`
          : isRtl
          ? `مشروع ${lead.name}`
          : `${lead.name} - Project`,
      );
      setDealValue(lead.estimatedBudget ? String(lead.estimatedBudget) : "0");
      setSalesOwner(lead.assignedSalesperson || "");
      setNextAction(lead.nextAction || "");
      setNextActionDate(lead.nextActionDate ? lead.nextActionDate.slice(0, 10) : "");
      setNotes(lead.notes || "");
      setCustomerMode("new");
      setSelectedCustomerId("");

      // Fetch team members & existing customers
      listSalesMembersFn()
        .then((m) => setSalesMembers(m))
        .catch(() => {});

      listCustomersFn({ data: { pageSize: 100 } })
        .then((res) => {
          setExistingCustomers(
            res.rows.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
            })),
          );
        })
        .catch(() => {});
    }
  }, [open, lead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;

    if (!opportunityTitle.trim()) {
      toast.error(isRtl ? "يرجى تحديد عنوان الصفقة / المشروع" : "Opportunity title is required");
      return;
    }

    if (customerMode === "existing" && !selectedCustomerId) {
      toast.error(isRtl ? "يرجى اختيار العميل المسجل" : "Please select an existing customer");
      return;
    }

    if (customerMode === "new" && !customerName.trim()) {
      toast.error(isRtl ? "اسم العميل مطلوب" : "Customer name is required");
      return;
    }

    setSubmitting(true);
    try {
      const result = await convertLeadFn({
        data: {
          leadId: lead.id,
          customerId: customerMode === "existing" ? selectedCustomerId : undefined,
          newCustomer:
            customerMode === "new"
              ? {
                  name: customerName.trim(),
                  phone: customerPhone.trim() || null,
                  email: customerEmail.trim() || null,
                  address: customerAddress.trim() || null,
                }
              : undefined,
          opportunityTitle: opportunityTitle.trim(),
          projectType,
          value: Number(dealValue) || 0,
          salesOwner: salesOwner || null,
          expectedCloseDate: expectedCloseDate || null,
          nextAction: nextAction.trim() || null,
          nextActionDate: nextActionDate || null,
          notes: notes.trim() || null,
        },
      });

      toast.success(
        isRtl
          ? `تم تحويل العميل بنجاح إلى الصفقة رقم ${result.opportunityNumber} والعميل ${result.customerName}`
          : `Lead converted into Deal ${result.opportunityNumber} (${result.customerName})`,
      );

      onOpenChange(false);
      if (onSuccess) {
        onSuccess({
          customerId: result.customerId,
          opportunityId: result.opportunityId,
        });
      }
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تحويل العميل المحتمل" : "Conversion failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl text-xs max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <span>
                {isRtl
                  ? `تحويل العميل المحتمل (${lead?.leadNumber || ""})`
                  : `Convert Lead to Deal & Customer (${lead?.leadNumber || ""})`}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isRtl
                ? "سيتم تحويل هذا العميل المحتمل إلى عميل دائم وإنشاء صفقة تجارية نشطة بالمسار البيعي."
                : "Converts this prospect into an official customer and creates a commercial deal in your pipeline."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Step 1: Customer Association */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-primary" />
                  <span>{isRtl ? "1. بيانات العميل" : "1. Customer Identity"}</span>
                </span>

                <div className="flex items-center gap-2 bg-muted p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCustomerMode("new")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      customerMode === "new"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isRtl ? "إنشاء عميل جديد" : "New Customer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("existing")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      customerMode === "existing"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isRtl ? "ربط بعميل مسجل" : "Existing Customer"}
                  </button>
                </div>
              </div>

              {customerMode === "existing" ? (
                <div className="space-y-1">
                  <Label className="text-xs">{isRtl ? "اختر العميل المسجل *" : "Select Customer *"}</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={isRtl ? "اختر عميلاً من القائمة..." : "Select existing customer..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {existingCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name} {c.phone ? `(${c.phone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">{isRtl ? "اسم العميل *" : "Customer Name *"}</Label>
                    <Input
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{isRtl ? "رقم الهاتف" : "Phone"}</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{isRtl ? "البريد الإلكتروني" : "Email"}</Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{isRtl ? "العنوان" : "Address"}</Label>
                    <Input
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Commercial Opportunity */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span>{isRtl ? "2. تفاصيل الفرصة البيعية" : "2. Opportunity & Project Details"}</span>
              </span>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "عنوان الصفقة / المشروع *" : "Deal / Project Title *"}</Label>
                <Input
                  required
                  value={opportunityTitle}
                  onChange={(e) => setOpportunityTitle(e.target.value)}
                  placeholder={isRtl ? "مثال: تجهيز فيلا، مطبخ مودرن..." : "e.g. Modern Villa Kitchen"}
                  className="h-8 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">{isRtl ? "المسؤول عن الصفقة" : "Sales Owner"}</Label>
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
                  <Label className="text-xs">{isRtl ? "تاريخ الإغلاق المتوقع" : "Expected Close Date"}</Label>
                  <Input
                    type="date"
                    value={expectedCloseDate}
                    onChange={(e) => setExpectedCloseDate(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Next Action */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">{isRtl ? "الخطوة التالية (Next Action)" : "Next Action"}</Label>
                  <Input
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder={isRtl ? "مثال: تحديد موعد المقايسة..." : "e.g. Schedule site visit"}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{isRtl ? "تاريخ الخطوة التالية" : "Next Action Date"}</Label>
                  <Input
                    type="date"
                    value={nextActionDate}
                    onChange={(e) => setNextActionDate(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "ملاحظات" : "Notes"}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
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
              className="h-8 text-xs font-semibold bg-primary text-primary-foreground gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {submitting
                  ? isRtl
                    ? "جارٍ التحويل..."
                    : "Converting..."
                  : isRtl
                  ? "تأكيد التحويل وإنشاء الصفقة"
                  : "Convert & Create Deal"}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
