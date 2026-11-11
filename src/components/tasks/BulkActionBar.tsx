import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CheckSquare,
  UserCheck,
  Flag,
  Calendar,
  CheckCircle2,
  X,
  Loader2,
} from "lucide-react";
import type { TaskPriority, WorkforceMember } from "@/lib/task-types";

interface BulkActionBarProps {
  selectedCount: number;
  workforce: WorkforceMember[];
  onAssignWorker: (workerId: string) => Promise<void>;
  onChangePriority: (priority: TaskPriority) => Promise<void>;
  onSetDueDate: (date: string) => Promise<void>;
  onMarkCompleted: () => Promise<void>;
  onClearSelection: () => void;
  canManage: boolean;
}

export function BulkActionBar({
  selectedCount,
  workforce,
  onAssignWorker,
  onChangePriority,
  onSetDueDate,
  onMarkCompleted,
  onClearSelection,
  canManage,
}: BulkActionBarProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [busy, setBusy] = useState(false);

  if (selectedCount === 0 || !canManage) return null;

  return (
    <div className="fixed bottom-6 inset-x-4 max-w-4xl mx-auto bg-foreground text-background dark:bg-card dark:text-foreground shadow-2xl rounded-2xl p-3.5 z-40 border border-border/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5">
      {/* Selected counter */}
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold font-mono flex items-center justify-center text-xs">
          {selectedCount}
        </div>
        <div className="text-xs font-semibold">
          {isRtl ? `تم تحديد ${selectedCount} مهمة` : `${selectedCount} tasks selected`}
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Assign Worker */}
        <Select
          onValueChange={async (workerId) => {
            if (workerId === "none") return;
            setBusy(true);
            try {
              await onAssignWorker(workerId);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          <SelectTrigger className="h-8 text-xs bg-background text-foreground dark:bg-muted rounded-lg w-40">
            <UserCheck className="h-3.5 w-3.5 mr-1.5 rtl:ml-1.5 rtl:mr-0 text-primary" />
            <SelectValue placeholder={isRtl ? "إسناد إلى فني..." : "Assign worker..."} />
          </SelectTrigger>
          <SelectContent>
            {workforce.map((w) => (
              <SelectItem key={w.userId} value={w.userId} className="text-xs">
                {w.displayName} ({w.openTasksCount} {isRtl ? "مفتوحة" : "open"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Change Priority */}
        <Select
          onValueChange={async (p) => {
            setBusy(true);
            try {
              await onChangePriority(p as TaskPriority);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          <SelectTrigger className="h-8 text-xs bg-background text-foreground dark:bg-muted rounded-lg w-32">
            <Flag className="h-3.5 w-3.5 mr-1.5 rtl:ml-1.5 rtl:mr-0 text-amber-500" />
            <SelectValue placeholder={isRtl ? "تغيير الأولوية" : "Priority"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">{isRtl ? "منخفضة" : "Low"}</SelectItem>
            <SelectItem value="medium">{isRtl ? "متوسطة" : "Medium"}</SelectItem>
            <SelectItem value="high">{isRtl ? "عالية" : "High"}</SelectItem>
            <SelectItem value="critical">{isRtl ? "حرجة" : "Critical"}</SelectItem>
          </SelectContent>
        </Select>

        {/* Set Due Date */}
        <Input
          type="date"
          className="h-8 text-xs bg-background text-foreground dark:bg-muted rounded-lg w-36"
          onChange={async (e) => {
            if (!e.target.value) return;
            setBusy(true);
            try {
              await onSetDueDate(e.target.value);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        />

        {/* Mark Completed */}
        <Button
          size="sm"
          variant="secondary"
          className="h-8 text-xs gap-1.5 rounded-lg"
          onClick={async () => {
            setBusy(true);
            try {
              await onMarkCompleted();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          <span>{isRtl ? "اعتماد واكتمال" : "Complete"}</span>
        </Button>
      </div>

      {/* Clear selection */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
        onClick={onClearSelection}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
