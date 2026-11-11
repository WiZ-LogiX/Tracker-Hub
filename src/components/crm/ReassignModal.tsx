import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { assignCRMEntity, listSalesMembers } from "@/lib/crm.functions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface ReassignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "opportunity" | "lead";
  entityId: string;
  entityCode?: string;
  entityTitle?: string;
  currentSalesOwnerId?: string | null;
  onSuccess?: () => void;
}

export function ReassignModal({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityCode,
  entityTitle,
  currentSalesOwnerId,
  onSuccess,
}: ReassignModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const assignEntityFn = useServerFn(assignCRMEntity);
  const listSalesMembersFn = useServerFn(listSalesMembers);

  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(currentSalesOwnerId || "unassigned");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedOwnerId(currentSalesOwnerId || "unassigned");
      setLoadingMembers(true);
      listSalesMembersFn()
        .then((members) => {
          setSalesMembers(members || []);
        })
        .catch(() => {
          setSalesMembers([]);
        })
        .finally(() => setLoadingMembers(false));
    }
  }, [open, currentSalesOwnerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const salesOwnerId = selectedOwnerId === "unassigned" ? null : selectedOwnerId;
      await assignEntityFn({
        data: {
          entityType,
          entityId,
          salesOwnerId,
        },
      });

      toast.success(
        isRtl
          ? "تم تحديث المسؤول التجاري بنجاح"
          : "Sales representative assigned successfully",
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "حدث خطأ أثناء الإسناد" : "Failed to reassign"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <UserCheck className="h-5 w-5 text-primary" />
            <span>
              {isRtl ? "إسناد / تغيير المسؤول التجاري" : "Assign Sales Representative"}
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
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isRtl ? "اختر المسؤول التجاري" : "Select Sales Representative"}
            </Label>
            <Select
              value={selectedOwnerId}
              onValueChange={setSelectedOwnerId}
              disabled={loadingMembers}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={isRtl ? "اختر مسؤول المبيعات..." : "Select rep..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned" className="text-xs text-muted-foreground">
                  {isRtl ? "— غير مسند (بدون مسؤول) —" : "— Unassigned —"}
                </SelectItem>
                {salesMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id} className="text-xs">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-medium">{member.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-mono">
                        ({member.role})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={submitting || loadingMembers}
              className="text-xs h-8"
            >
              {submitting
                ? isRtl
                  ? "جاري التحديث..."
                  : "Updating..."
                : isRtl
                ? "تأكيد الإسناد"
                : "Confirm Assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
