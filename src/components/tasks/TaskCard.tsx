import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  AlertCircle,
  MoreVertical,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  ClipboardCheck,
  User,
  Package,
  Calendar,
  Hammer,
  RotateCcw,
  Truck,
  Undo2,
} from "lucide-react";
import type { TaskStatus, TaskPriority, TaskItem } from "@/lib/task-types";

interface TaskCardProps {
  task: TaskItem;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onSelectTask: (task: TaskItem) => void;
  userRole?: string;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string, selected: boolean) => void;
  canSelect?: boolean;
}

const PRIORITY_BADGE: Record<TaskPriority, { labelAr: string; labelEn: string; className: string }> = {
  low: { labelAr: "منخفضة", labelEn: "Low", className: "bg-slate-100 text-slate-700 border-slate-200" },
  medium: { labelAr: "متوسطة", labelEn: "Medium", className: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { labelAr: "عالية", labelEn: "High", className: "bg-amber-50 text-amber-700 border-amber-200" },
  critical: { labelAr: "حرجة", labelEn: "Critical", className: "bg-rose-50 text-rose-700 border-rose-200 animate-pulse font-bold" },
};

export function TaskCard({
  task,
  onStatusChange,
  onSelectTask,
  userRole,
  isSelected = false,
  onToggleSelect,
  canSelect = false,
}: TaskCardProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const priorityInfo = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
  const isWorker = userRole === "worker";

  return (
    <Card
      className={`border rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer bg-card ${
        task.isOverdue
          ? "border-destructive/60 bg-destructive/5"
          : isSelected
          ? "border-primary ring-1 ring-primary/40 bg-primary/5"
          : "border-border/80"
      }`}
      onClick={() => onSelectTask(task)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
      }}
    >
      <CardContent className="p-3.5 space-y-2.5">
        {/* Header: Code, Priority, Selection, Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {canSelect && onToggleSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onToggleSelect(task.id, !!checked)}
                onClick={(e) => e.stopPropagation()}
                className="rounded h-4 w-4"
              />
            )}
            <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
              {task.taskCode}
            </span>
            <Badge variant="outline" className={`text-[10px] font-semibold ${priorityInfo.className}`}>
              {isRtl ? priorityInfo.labelAr : priorityInfo.labelEn}
            </Badge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isRtl ? "start" : "end"} onClick={(e) => e.stopPropagation()}>
              {task.status !== "not_started" && !isWorker && (
                <DropdownMenuItem onClick={() => onStatusChange(task.id, "not_started")}>
                  <PauseCircle className="h-3.5 w-3.5 mr-2 rtl:ml-2 rtl:mr-0 text-slate-500" />
                  <span>{isRtl ? "لم تبدأ" : "Not Started"}</span>
                </DropdownMenuItem>
              )}
              {task.status !== "in_progress" && (
                <DropdownMenuItem onClick={() => onStatusChange(task.id, "in_progress")}>
                  <PlayCircle className="h-3.5 w-3.5 mr-2 rtl:ml-2 rtl:mr-0 text-blue-500" />
                  <span>{isRtl ? "بدء التنفيذ" : "In Progress"}</span>
                </DropdownMenuItem>
              )}
              {task.status !== "waiting_review" && (
                <DropdownMenuItem onClick={() => onStatusChange(task.id, "waiting_review")}>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-2 rtl:ml-2 rtl:mr-0 text-amber-500" />
                  <span>{isRtl ? "إرسال للمراجعة" : "Submit for Review"}</span>
                </DropdownMenuItem>
              )}
              {task.status === "waiting_review" && !isWorker && (
                <DropdownMenuItem onClick={() => onStatusChange(task.id, "in_progress")}>
                  <Undo2 className="h-3.5 w-3.5 mr-2 rtl:ml-2 rtl:mr-0 text-amber-600" />
                  <span>{isRtl ? "إرجاع للتعديل" : "Return for Changes"}</span>
                </DropdownMenuItem>
              )}
              {task.status !== "completed" && !isWorker && (
                <DropdownMenuItem onClick={() => onStatusChange(task.id, "completed")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2 rtl:ml-2 rtl:mr-0 text-emerald-600" />
                  <span>{isRtl ? "اعتماد واكتمال" : "Complete"}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title & Category */}
        <div>
          <h4 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground">
            {task.title}
          </h4>
          <span className="text-[11px] text-muted-foreground font-medium">
            {task.category}
          </span>
        </div>

        {/* Linked Business Entities */}
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {task.orderNumber && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-medium">
              <Package className="h-3 w-3" />
              {task.orderNumber}
            </span>
          )}
          {task.workOrderNumber && (
            <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-mono font-medium">
              <Hammer className="h-3 w-3" />
              {task.workOrderNumber}
            </span>
          )}
          {task.remakeNumber && (
            <span className="inline-flex items-center gap-1 bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono font-medium">
              <RotateCcw className="h-3 w-3" />
              {task.remakeNumber}
            </span>
          )}
          {task.deliveryNumber && (
            <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium">
              <Truck className="h-3 w-3" />
              {task.deliveryNumber}
            </span>
          )}
        </div>

        {/* Return notes notification if rejected */}
        {task.reviewNotes && task.status === "in_progress" && (
          <div className="p-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[10px] line-clamp-2">
            <span className="font-bold">{isRtl ? "ملاحظات المشرف: " : "Feedback: "}</span>
            {task.reviewNotes}
          </div>
        )}

        {/* Footer: Due Date & Assignees */}
        <div className="flex items-center justify-between pt-2 border-t border-border/70 text-xs">
          {/* Due date */}
          <div
            className={`flex items-center gap-1 text-[11px] font-medium ${
              task.isOverdue
                ? "text-destructive font-bold flex items-center gap-1"
                : "text-muted-foreground"
            }`}
          >
            {task.isOverdue ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Clock className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {task.dueDate
                ? new Date(task.dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </div>

          {/* Assignees initials/names */}
          <div className="flex items-center -space-x-1 rtl:space-x-reverse">
            {task.assignees && task.assignees.length > 0 ? (
              task.assignees.slice(0, 3).map((a, idx) => (
                <div
                  key={a.userId || idx}
                  title={a.userName || a.userEmail || a.userId}
                  className="h-6 w-6 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center border-2 border-card shadow-xs uppercase"
                >
                  {(a.userName || a.userEmail || "U").slice(0, 2)}
                </div>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground/60 italic">
                {isRtl ? "غير مسندة" : "Unassigned"}
              </span>
            )}
            {task.assignees && task.assignees.length > 3 && (
              <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center border-2 border-card">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
