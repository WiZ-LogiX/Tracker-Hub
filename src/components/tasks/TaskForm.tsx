import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createTask, updateTask, listWorkforceMembers } from "@/lib/tasks.functions";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskItem,
  type WorkforceMember,
} from "@/lib/task-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_STAGES, STAGE_LABEL_AR } from "@/lib/stages";
import { toast } from "sonner";
import { Loader2, UserCheck, AlertCircle, Check, ChevronDown, ChevronUp, Link2 } from "lucide-react";

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskSaved?: () => void;
  onTaskCreated?: () => void;
  defaultOrderId?: string;
  defaultCustomerId?: string;
  defaultWorkOrderId?: string;
  defaultDeliveryId?: string;
  defaultRemakeId?: string;
  defaultCaseId?: string;
  defaultCategory?: string;
  defaultTitle?: string;
  defaultPriority?: TaskPriority;
  initialTask?: TaskItem | null;
}

export function TaskForm({
  open,
  onOpenChange,
  onTaskSaved,
  onTaskCreated,
  defaultOrderId,
  defaultCustomerId,
  defaultWorkOrderId,
  defaultDeliveryId,
  defaultRemakeId,
  defaultCaseId,
  defaultCategory,
  defaultTitle,
  defaultPriority,
  initialTask,
}: TaskFormProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const createTaskFn = useServerFn(createTask);
  const updateTaskFn = useServerFn(updateTask);
  const listWorkforceFn = useServerFn(listWorkforceMembers);

  const isEditing = !!initialTask;

  const [title, setTitle] = useState(defaultTitle || "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(defaultPriority || "medium");
  const [category, setCategory] = useState(defaultCategory || "production");
  const [dueDate, setDueDate] = useState("");
  const [orderId, setOrderId] = useState(defaultOrderId || "");
  const [quoteId, setQuoteId] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomerId || "");
  const [workOrderId, setWorkOrderId] = useState(defaultWorkOrderId || "");
  const [remakeId, setRemakeId] = useState(defaultRemakeId || "");
  const [deliveryId, setDeliveryId] = useState(defaultDeliveryId || "");
  const [caseId, setCaseId] = useState(defaultCaseId || "");
  const [productionStage, setProductionStage] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  // Entity lists loaded from tenant
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string }[]>([]);
  const [quotesList, setQuotesList] = useState<{ id: string; quote_number: string }[]>([]);
  const [customersList, setCustomersList] = useState<{ id: string; name: string }[]>([]);
  const [workOrdersList, setWorkOrdersList] = useState<{ id: string; work_order_number: string }[]>([]);
  const [remakesList, setRemakesList] = useState<{ id: string; remake_number: string }[]>([]);
  const [deliveriesList, setDeliveriesList] = useState<{ id: string; delivery_number: string }[]>([]);
  const [serviceCasesList, setServiceCasesList] = useState<{ id: string; case_number: string; title: string }[]>([]);
  const [workforce, setWorkforce] = useState<WorkforceMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showContext, setShowContext] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description || "");
      setPriority(initialTask.priority);
      setCategory(initialTask.category || "production");
      setDueDate(
        initialTask.dueDate
          ? new Date(initialTask.dueDate).toISOString().slice(0, 10)
          : "",
      );
      setOrderId(initialTask.orderId || defaultOrderId || "");
      setQuoteId(initialTask.quoteId || "");
      setCustomerId(initialTask.customerId || defaultCustomerId || "");
      setWorkOrderId(initialTask.workOrderId || defaultWorkOrderId || "");
      setRemakeId(initialTask.remakeId || defaultRemakeId || "");
      setDeliveryId(initialTask.deliveryId || defaultDeliveryId || "");
      setCaseId(initialTask.caseId || defaultCaseId || "");
      setProductionStage(initialTask.productionStage || "");
      setSelectedAssignees(initialTask.assignees?.map((a) => a.userId) || []);
      setShowContext(
        Boolean(
          initialTask.orderId ||
            initialTask.workOrderId ||
            initialTask.remakeId ||
            initialTask.deliveryId ||
            initialTask.caseId ||
            initialTask.customerId ||
            initialTask.quoteId ||
            defaultOrderId ||
            defaultCustomerId ||
            defaultWorkOrderId ||
            defaultDeliveryId ||
            defaultRemakeId ||
            defaultCaseId,
        ),
      );
    } else {
      setTitle(defaultTitle || "");
      setDescription("");
      setPriority(defaultPriority || "medium");
      setCategory(defaultCategory || "production");
      setDueDate("");
      setOrderId(defaultOrderId || "");
      setQuoteId("");
      setCustomerId(defaultCustomerId || "");
      setWorkOrderId(defaultWorkOrderId || "");
      setRemakeId(defaultRemakeId || "");
      setDeliveryId(defaultDeliveryId || "");
      setCaseId(defaultCaseId || "");
      setProductionStage("");
      setSelectedAssignees([]);
      setShowContext(
        Boolean(
          defaultOrderId ||
            defaultCustomerId ||
            defaultWorkOrderId ||
            defaultDeliveryId ||
            defaultRemakeId ||
            defaultCaseId,
        ),
      );
    }

    // Load scoped tenant entities
    supabase
      .from("orders")
      .select("id, order_number")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data && setOrdersList(data));

    supabase
      .from("quotes")
      .select("id, quote_number")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data && setQuotesList(data));

    supabase
      .from("customers")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(30)
      .then(({ data }) => data && setCustomersList(data));

    supabase
      .from("production_work_orders")
      .select("id, work_order_number")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data && setWorkOrdersList(data));

    supabase
      .from("remakes")
      .select("id, remake_number")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data && setRemakesList(data));

    supabase
      .from("delivery_handovers")
      .select("id, delivery_number")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data && setDeliveriesList(data));

    supabase
      .from("service_cases")
      .select("id, case_number, title")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => data && setServiceCasesList(data as any));

    // Load workforce with smart workload indicators
    listWorkforceFn()
      .then((res: any) => {
        if (Array.isArray(res)) {
          setWorkforce(res);
        }
      })
      .catch((err) => {
        console.error("Failed to load workforce directory", err);
      });
  }, [
    open,
    initialTask,
    defaultOrderId,
    defaultCustomerId,
    defaultWorkOrderId,
    defaultDeliveryId,
    defaultRemakeId,
    defaultCaseId,
    defaultCategory,
    defaultTitle,
    defaultPriority,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(isRtl ? "عنوان المهمة مطلوب" : "Task title is required");
      return;
    }

    setSubmitting(true);
    try {
      const formattedDueDate = dueDate ? new Date(dueDate).toISOString() : null;

      if (isEditing && initialTask) {
        await updateTaskFn({
          data: {
            taskId: initialTask.id,
            title: title.trim(),
            description: description.trim() || null,
            priority,
            category,
            dueDate: formattedDueDate,
            orderId: orderId && orderId !== "none" ? orderId : null,
            quoteId: quoteId && quoteId !== "none" ? quoteId : null,
            customerId: customerId && customerId !== "none" ? customerId : null,
            workOrderId: workOrderId && workOrderId !== "none" ? workOrderId : null,
            remakeId: remakeId && remakeId !== "none" ? remakeId : null,
            deliveryId: deliveryId && deliveryId !== "none" ? deliveryId : null,
            caseId: caseId && caseId !== "none" ? caseId : null,
            productionStage: productionStage && productionStage !== "none" ? productionStage : null,
            assigneeIds: selectedAssignees,
          },
        });
        toast.success(isRtl ? "تم تعديل المهمة بنجاح" : "Task updated successfully");
      } else {
        await createTaskFn({
          data: {
            title: title.trim(),
            description: description.trim() || null,
            priority,
            category,
            dueDate: formattedDueDate,
            orderId: orderId && orderId !== "none" ? orderId : null,
            quoteId: quoteId && quoteId !== "none" ? quoteId : null,
            customerId: customerId && customerId !== "none" ? customerId : null,
            workOrderId: workOrderId && workOrderId !== "none" ? workOrderId : null,
            remakeId: remakeId && remakeId !== "none" ? remakeId : null,
            deliveryId: deliveryId && deliveryId !== "none" ? deliveryId : null,
            caseId: caseId && caseId !== "none" ? caseId : null,
            productionStage: productionStage && productionStage !== "none" ? productionStage : null,
            assigneeIds: selectedAssignees,
          },
        });
        toast.success(isRtl ? "تم إنشاء المهمة بنجاح" : "Task created successfully");
      }

      onTaskSaved?.();
      onTaskCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل حفظ المهمة" : "Failed to save task"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold">
            {isEditing
              ? isRtl
                ? "تعديل المهمة"
                : "Edit Task"
              : isRtl
              ? "إنشاء مهمة جديدة"
              : "Create New Task"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className="text-xs font-semibold">
              {isRtl ? "عنوان المهمة *" : "Task Title *"}
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isRtl ? "مثال: تقطيع ألواح خشب المطبخ" : "e.g., Cut MDF panels for kitchen"}
              required
              className="text-sm rounded-lg"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc" className="text-xs font-semibold">
              {isRtl ? "تفاصيل المهمة والتعليمات" : "Description & Instructions"}
            </Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isRtl ? "تعليمات للفني أو مسؤول الجودة..." : "Instructions for worker or QC..."}
              rows={3}
              className="text-sm rounded-lg"
            />
          </div>

          {/* Assign Workers (Primary & Prominent) */}
          <div className="space-y-2 pt-1 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-primary" />
                <span>{isRtl ? "إسناد إلى الموظفين / الفنيين *" : "Assign Employees *"}</span>
              </Label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {selectedAssignees.length} {isRtl ? "محدد" : "selected"}
              </span>
            </div>

            {workforce.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center bg-muted/20 border border-dashed rounded-lg">
                {isRtl ? "جاري تحميل قائمة الموظفين..." : "Loading workforce..."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {workforce.map((worker) => {
                  const isSelected = selectedAssignees.includes(worker.userId);
                  return (
                    <div
                      key={worker.userId}
                      onClick={() => {
                        setSelectedAssignees((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== worker.userId)
                            : [...prev, worker.userId],
                        );
                      }}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-primary/20 text-primary font-bold text-[10px] flex items-center justify-center uppercase shrink-0">
                          {worker.displayName.slice(0, 2)}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold truncate">{worker.displayName}</div>
                          <div className="text-[10px] text-muted-foreground capitalize">
                            {worker.role}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {worker.overdueTasksCount > 0 && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                            {worker.overdueTasksCount} {isRtl ? "متأخر" : "overdue"}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono font-medium">
                          {worker.openTasksCount} {isRtl ? "مهام" : "tasks"}
                        </Badge>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "الأولوية" : "Priority"}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-sm rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p.key} value={p.key} className="text-sm">
                      {isRtl ? p.labelAr : p.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due" className="text-xs font-semibold">
                {isRtl ? "تاريخ الاستحقاق" : "Due Date"}
              </Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-sm rounded-lg"
              />
            </div>
          </div>

          {/* Optional Collapsible Business Context Links */}
          <div className="pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowContext(!showContext)}
              className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground py-1.5 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <span>
                  {isRtl
                    ? "ربط بالسجلات التشغيلية (أمر تصنيع، عميل، تشغيل...) — اختياري"
                    : "Link Related Business Records (Order, Work Order, Customer...) — Optional"}
                </span>
              </span>
              {showContext ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showContext && (
              <div className="space-y-3 pt-3 animate-in fade-in-50">
                {/* Category & Stage */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "التصنيف" : "Category"}</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_CATEGORIES.map((c) => (
                          <SelectItem key={c.key} value={c.key} className="text-sm">
                            {isRtl ? c.labelAr : c.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "مرحلة التصنيع" : "Stage"}</Label>
                    <Select value={productionStage} onValueChange={setProductionStage}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— غير محدد —" : "— None —"}</SelectItem>
                        {ORDER_STAGES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {STAGE_LABEL_AR[st] || st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Linked Order & Linked Work Order */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "ربط بأمر تصنيع" : "Link Order"}</Label>
                    <Select value={orderId} onValueChange={setOrderId}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                        {ordersList.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.order_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "ربط بأمر تشغيل" : "Link Work Order"}</Label>
                    <Select value={workOrderId} onValueChange={setWorkOrderId}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                        {workOrdersList.map((wo) => (
                          <SelectItem key={wo.id} value={wo.id}>
                            {wo.work_order_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Linked Remake & Linked Delivery */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "ربط بإعادة تصنيع" : "Link Remake"}</Label>
                    <Select value={remakeId} onValueChange={setRemakeId}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                        {remakesList.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.remake_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "ربط بتسليم / تركيب" : "Link Delivery"}</Label>
                    <Select value={deliveryId} onValueChange={setDeliveryId}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                        {deliveriesList.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.delivery_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Linked Customer & Linked Quotation */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "ربط بعميل" : "Link Customer"}</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                        {customersList.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isRtl ? "ربط بعرض سعر" : "Link Quotation"}</Label>
                    <Select value={quoteId} onValueChange={setQuoteId}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                        {quotesList.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.quote_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Linked Service Case (After-Sales) */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {isRtl ? "ربط ببلاغ خدمة (خدمة ما بعد البيع)" : "Link Service Case (After-Sales)"}
                  </Label>
                  <Select value={caseId} onValueChange={setCaseId}>
                    <SelectTrigger className="h-9 text-sm rounded-lg">
                      <SelectValue placeholder={isRtl ? "— اختياري —" : "— Optional —"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{isRtl ? "— لا يوجد —" : "— None —"}</SelectItem>
                      {serviceCasesList.map((sc) => (
                        <SelectItem key={sc.id} value={sc.id}>
                          {sc.case_number} — {sc.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground">
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2 rtl:ml-2 rtl:mr-0" />}
              <span>{isEditing ? (isRtl ? "تحديث المهمة" : "Update Task") : (isRtl ? "حفظ المهمة" : "Create Task")}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
