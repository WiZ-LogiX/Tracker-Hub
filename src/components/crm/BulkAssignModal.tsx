import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { bulkAssignCRMEntities, listSalesMembers } from "@/lib/crm.functions";
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
import { Users2, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface BulkAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "opportunity" | "lead";
  entityIds: string[];
  onSuccess?: () => void;
}

export function BulkAssignModal({
  open,
  onOpenChange,
  entityType,
  entityIds,
  onSuccess,
}: BulkAssignModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const bulkAssignFn = useServerFn(bulkAssignCRMEntities);
  const listSalesMembersFn = useServerFn(listSalesMembers);

  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [targetOwnerId, setTargetOwnerId] = useState<string>("unassigned");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (open) {
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
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entityIds.length === 0) {
      toast.error(isRtl ? "لم يتم تحديد أي عناصر" : "No items selected");
      return;
    }

    setSubmitting(true);
    try {
      const salesOwnerId = targetOwnerId === "unassigned" ? null : targetOwnerId;
      await bulkAssignFn({
        data: {
          entityType,
          entityIds,
          salesOwnerId,
        },
      });

      toast.success(
        isRtl
          ? `تم إسناد ${entityIds.length} عنصر بنجاح`
          : `Successfully assigned ${entityIds.length} items`,
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "حدث خطأ أثناء الإسناد الجماعي" : "Failed bulk assignment"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Users2 className="h-5 w-5 text-primary" />
            <span>
              {isRtl
                ? `إسناد جماعي (${entityIds.length} ${entityType === "opportunity" ? "صفقة" : "عميل محتمل"})`
                : `Bulk Assignment (${entityIds.length} ${entityType === "opportunity" ? "Deals" : "Leads"})`}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isRtl
              ? "سيتم تحويل مسؤولية المتابعة لجميع العناصر المحددة دفعة واحدة إلى مسؤول المبيعات المختار وتوثيق العملية في سجل التدقيق."
              : "Reassign all selected records to the chosen salesperson in one atomic operation with full audit trail."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isRtl ? "المسؤول التجاري المستهدف" : "Target Sales Representative"}
            </Label>
            <Select
              value={targetOwnerId}
              onValueChange={setTargetOwnerId}
              disabled={loadingMembers}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={isRtl ? "اختر مسؤول المبيعات..." : "Select rep..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned" className="text-xs text-muted-foreground">
                  {isRtl ? "— فك الإسناد (جعله غير مسند) —" : "— Unassign (Remove Owner) —"}
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
              disabled={submitting || loadingMembers || entityIds.length === 0}
              className="text-xs h-8 gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>
                {submitting
                  ? isRtl
                    ? "جاري المعالجة..."
                    : "Processing..."
                  : isRtl
                  ? `تنفيذ الإسناد (${entityIds.length})`
                  : `Assign (${entityIds.length})`}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
