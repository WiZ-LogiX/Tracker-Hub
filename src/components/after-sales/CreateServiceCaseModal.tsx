import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { createServiceCase } from "@/lib/after-sales.functions";
import { listCustomersWithStats } from "@/lib/customers.functions";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ShieldAlert, AlertCircle, Wrench, Headphones, HelpCircle, CheckSquare } from "lucide-react";
import type { ServiceCaseType, ServiceCasePriority } from "@/lib/after-sales-types";

interface CreateServiceCaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string | null;
  defaultCustomerName?: string | null;
  defaultOrderId?: string | null;
  defaultProjectId?: string | null;
  ordersList?: { id: string; orderNumber: string }[];
  onSuccess?: (newCase: any) => void;
}

export function CreateServiceCaseModal({
  open,
  onOpenChange,
  defaultCustomerId,
  defaultCustomerName,
  defaultOrderId,
  defaultProjectId,
  ordersList = [],
  onSuccess,
}: CreateServiceCaseModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const createCaseFn = useServerFn(createServiceCase);
  const listCustomersFn = useServerFn(listCustomersWithStats);

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(defaultCustomerId || "");
  const [selectedOrderId, setSelectedOrderId] = useState(defaultOrderId || "");
  const [caseType, setCaseType] = useState<ServiceCaseType>("complaint");
  const [priority, setPriority] = useState<ServiceCasePriority>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [createInspectionTask, setCreateInspectionTask] = useState(true);
  const [inspectionTaskTitle, setInspectionTaskTitle] = useState("");

  useEffect(() => {
    if (open) {
      if (defaultCustomerId) {
        setSelectedCustomerId(defaultCustomerId);
      } else {
        // Load customers if not prefilled
        listCustomersFn({ data: { pageSize: 50 } })
          .then((res) => {
            setCustomers(res.rows.map((c) => ({ id: c.id, name: c.name })));
          })
          .catch(() => {});
      }

      if (defaultOrderId) {
        setSelectedOrderId(defaultOrderId);
      }
    }
  }, [open, defaultCustomerId, defaultOrderId]);

  useEffect(() => {
    if (title && !inspectionTaskTitle) {
      setInspectionTaskTitle(
        isRtl ? `معاينة وبحث: ${title}` : `Inspect & investigate: ${title}`,
      );
    }
  }, [title, isRtl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      toast.error(isRtl ? "يرجى تحديد العميل" : "Please select a customer");
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      toast.error(isRtl ? "عنوان البلاغ يجب أن لا يقل عن 3 أحرف" : "Title must be at least 3 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await createCaseFn({
        data: {
          customerId: selectedCustomerId,
          orderId: selectedOrderId || null,
          projectId: defaultProjectId || null,
          type: caseType,
          priority,
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
          createInspectionTask,
          inspectionTaskTitle: createInspectionTask ? inspectionTaskTitle.trim() : undefined,
        },
      });

      toast.success(
        isRtl
          ? `تم فتح بلاغ ما بعد البيع بنجاح (${res.caseNumber})`
          : `Service case ${res.caseNumber} created successfully`,
      );
      onSuccess?.(res);
      onOpenChange(false);

      // Reset
      setTitle("");
      setDescription("");
      setDueDate("");
      setInspectionTaskTitle("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create service case");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Headphones className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold font-serif">
                  {isRtl ? "فتح بلاغ خدمة ما بعد البيع / ضمان" : "New After-Sales / Service Case"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {isRtl
                    ? "تسجيل شكوى، صيانة دورية، أو مطالبة ضمان وربطها بالعميل والمهام التشغيلية"
                    : "Log a customer complaint, maintenance request, or warranty claim"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs">
            {/* Customer selector (if not prefilled) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "العميل *" : "Customer *"}</Label>
              {defaultCustomerId ? (
                <div className="p-2.5 bg-muted/40 rounded-lg font-medium text-foreground text-xs border">
                  {defaultCustomerName || defaultCustomerId}
                </div>
              ) : (
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={isRtl ? "اختر العميل..." : "Select customer..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Type & Priority Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isRtl ? "نوع البلاغ *" : "Case Type *"}</Label>
                <Select value={caseType} onValueChange={(v) => setCaseType(v as ServiceCaseType)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="complaint" className="text-xs">
                      {isRtl ? "شكوى عميل (Complaint)" : "Complaint"}
                    </SelectItem>
                    <SelectItem value="warranty" className="text-xs">
                      {isRtl ? "مطالبة ضمان (Warranty)" : "Warranty Claim"}
                    </SelectItem>
                    <SelectItem value="service" className="text-xs">
                      {isRtl ? "خدمة وضبط (Service)" : "Service"}
                    </SelectItem>
                    <SelectItem value="maintenance" className="text-xs">
                      {isRtl ? "صيانة دورية (Maintenance)" : "Maintenance"}
                    </SelectItem>
                    <SelectItem value="other" className="text-xs">
                      {isRtl ? "أخرى (Other)" : "Other"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isRtl ? "درجة الأهمية *" : "Priority *"}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as ServiceCasePriority)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-xs">
                      {isRtl ? "منخفضة (Low)" : "Low"}
                    </SelectItem>
                    <SelectItem value="medium" className="text-xs">
                      {isRtl ? "متوسطة (Medium)" : "Medium"}
                    </SelectItem>
                    <SelectItem value="high" className="text-xs">
                      {isRtl ? "عالية (High)" : "High"}
                    </SelectItem>
                    <SelectItem value="critical" className="text-xs text-rose-600 font-semibold">
                      {isRtl ? "حرجة / عاجلة (Critical)" : "Critical"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Optional Linked Order */}
            {ordersList.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isRtl ? "أمر التنفيذ المرتبط" : "Linked Order"}</Label>
                <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={isRtl ? "حدد الطلب إن وجد..." : "Select order..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" className="text-xs">
                      {isRtl ? "غير مرتبط بأمر محدد" : "None"}
                    </SelectItem>
                    {ordersList.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.orderNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "موضوع / عنوان البلاغ *" : "Case Title *"}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isRtl ? "مثال: احتكاك مفصلة الباب السفلي بالدلفة" : "e.g. Lower hinge alignment issue"}
                className="h-9 text-xs"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "تفاصيل البلاغ / وصف المشكلة" : "Description / Details"}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isRtl ? "تفاصيل المشكلة المذكورة من العميل والموقع..." : "Detailed notes..."}
                className="text-xs min-h-[75px]"
              />
            </div>

            {/* Due date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "تاريخ الحل المستهدف" : "Target Due Date"}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Native Task Integration Checkbox */}
            <div className="p-3 bg-muted/30 border rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="createTaskCheck"
                  checked={createInspectionTask}
                  onCheckedChange={(c) => setCreateInspectionTask(!!c)}
                />
                <Label htmlFor="createTaskCheck" className="text-xs font-semibold cursor-pointer">
                  {isRtl
                    ? "توليد مهمة عمل ميدانية تلقائياً في نظام المهام التشغيلي"
                    : "Auto-generate operational inspection task in task system"}
                </Label>
              </div>

              {createInspectionTask && (
                <div className="pt-1.5 pl-6">
                  <Input
                    value={inspectionTaskTitle}
                    onChange={(e) => setInspectionTaskTitle(e.target.value)}
                    placeholder={isRtl ? "عنوان مهمة المعاينة..." : "Inspection task title..."}
                    className="h-8 text-xs bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {isRtl
                      ? "سيتم إدراج المهمة تلقائياً في لوحة المهام لفريق الفنيين مع ربطها بهذا البلاغ"
                      : "Task will be created in the native task board linked to this case"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-xs font-semibold gap-1.5"
            >
              {loading ? (
                <span>{isRtl ? "جاري الحفظ..." : "Saving..."}</span>
              ) : (
                <>
                  <Headphones className="h-3.5 w-3.5" />
                  <span>{isRtl ? "تسجيل البلاغ" : "Create Case"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
