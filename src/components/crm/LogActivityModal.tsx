import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { logCRMActivity } from "@/lib/crm.functions";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type LogActivityInput,
} from "@/lib/crm-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Users,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface LogActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "opportunity" | "lead";
  entityId: string;
  entityCode?: string;
  entityTitle?: string;
  defaultNextAction?: string;
  relatedTaskId?: string | null;
  onSuccess?: () => void;
}

const ICONS: Record<string, any> = {
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Users,
  FileText,
  Clock,
};

export function LogActivityModal({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityCode,
  entityTitle,
  defaultNextAction,
  relatedTaskId,
  onSuccess,
}: LogActivityModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const logActivityFn = useServerFn(logCRMActivity);

  const [activityType, setActivityType] = useState<ActivityType>("call");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState(defaultNextAction || "");
  const [nextActionDate, setNextActionDate] = useState("");
  const [markCompleted, setMarkCompleted] = useState(Boolean(relatedTaskId));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      toast.error(isRtl ? "يرجى كتابة ملاحظات النشاط التجاري" : "Activity notes are required");
      return;
    }

    setSubmitting(true);
    try {
      const input: LogActivityInput = {
        entityType,
        entityId,
        activityType,
        notes: notes.trim(),
        nextAction: nextAction.trim() || null,
        nextActionDate: nextActionDate || null,
        markFollowUpCompleted: markCompleted,
        relatedTaskId: relatedTaskId || null,
      };

      await logActivityFn({ data: input });

      toast.success(
        isRtl
          ? "تم تسجيل النشاط والمتابعة التجارية بنجاح"
          : "Commercial activity logged successfully",
      );
      setNotes("");
      setNextAction("");
      setNextActionDate("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "حدث خطأ أثناء التسجيل" : "Failed to log activity"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span>
              {isRtl ? "تسجيل نشاط ومتابعة تجارية" : "Log Sales Activity & Follow-Up"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {entityCode ? (
              <span className="font-mono font-semibold text-foreground mr-1">
                {entityCode}
              </span>
            ) : null}
            {entityTitle ? <span>— {entityTitle}</span> : null}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Activity Type Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isRtl ? "نوع النشاط التجاري" : "Activity Type"}
            </Label>
            <Select
              value={activityType}
              onValueChange={(val) => setActivityType(val as ActivityType)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((type) => {
                  const Icon = ICONS[type.icon] || Clock;
                  return (
                    <SelectItem key={type.value} value={type.value} className="text-xs">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        <span>{isRtl ? type.labelAr : type.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Activity Notes / Outcome */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isRtl ? "ملاحظات وتفاصيل التواصل / النتيجة" : "Activity Notes & Outcome"}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isRtl
                  ? "مثال: تم الاتصال بالعميل ومناقشة تفاصيل بنود عرض السعر، والعميل طلب مهلة ليوم الخميس..."
                  : "e.g. Called client, discussed quote pricing, client requested revision by Thursday..."
              }
              rows={3}
              className="text-xs resize-none"
              required
            />
          </div>

          {/* Mark Linked Task Completed */}
          {relatedTaskId && (
            <div className="flex items-center space-x-2 rtl:space-x-reverse bg-muted/40 p-2.5 rounded-lg border">
              <Checkbox
                id="mark-completed"
                checked={markCompleted}
                onCheckedChange={(checked) => setMarkCompleted(Boolean(checked))}
              />
              <Label
                htmlFor="mark-completed"
                className="text-xs font-medium cursor-pointer"
              >
                {isRtl
                  ? "إتمام وإغلاق مهمة المتابعة الحالية المرتبطة"
                  : "Mark linked follow-up task as completed"}
              </Label>
            </div>
          )}

          {/* Next Action Scheduling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isRtl ? "الإجراء التالي المطلوب" : "Next Action"}
              </Label>
              <Input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder={isRtl ? "إرسال مسودة معدلة..." : "Send updated draft..."}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isRtl ? "موعد الإجراء التالي" : "Next Action Date"}
              </Label>
              <Input
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs h-8"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !notes.trim()}
              className="text-xs h-8"
            >
              {submitting
                ? isRtl
                  ? "جاري الحفظ..."
                  : "Saving..."
                : isRtl
                ? "حفظ النشاط التجاري"
                : "Save Activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
