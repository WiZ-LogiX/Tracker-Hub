import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  AlertCircle,
  PlayCircle,
  ClipboardCheck,
  CheckCircle2,
  Package,
  Calendar,
  FileText,
  Hammer,
  RotateCcw,
  Truck,
  ArrowUpRight,
  Headphones,
} from "lucide-react";
import type { TaskItem, TaskStatus } from "@/lib/task-types";

interface MyTasksViewProps {
  tasks: TaskItem[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onSelectTask: (task: TaskItem) => void;
  userRole?: string;
  loading?: boolean;
}

export function MyTasksView({
  tasks,
  onStatusChange,
  onSelectTask,
  userRole,
  loading = false,
}: MyTasksViewProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [subFilter, setSubFilter] = useState<"all" | "in_progress" | "overdue" | "completed">("all");

  const overdueTasks: TaskItem[] = [];
  const todayTasks: TaskItem[] = [];
  const upcomingTasks: TaskItem[] = [];
  const inReviewTasks: TaskItem[] = [];
  const completedTasks: TaskItem[] = [];

  for (const t of tasks) {
    if (t.status === "completed") {
      completedTasks.push(t);
      continue;
    }
    if (t.status === "cancelled") {
      continue;
    }
    if (t.status === "waiting_review") {
      inReviewTasks.push(t);
      continue;
    }

    if (t.dueDate) {
      const dueTime = new Date(t.dueDate).getTime();
      if (dueTime < startOfToday.getTime()) {
        overdueTasks.push(t);
      } else if (dueTime <= endOfToday.getTime()) {
        todayTasks.push(t);
      } else {
        upcomingTasks.push(t);
      }
    } else {
      upcomingTasks.push(t);
    }
  }

  const renderSection = (
    titleAr: string,
    titleEn: string,
    items: TaskItem[],
    icon: any,
    badgeClass: string,
    isAlert = false,
  ) => {
    const Icon = icon;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1 border-b">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${isAlert ? "text-destructive" : "text-primary"}`} />
            <span className="font-bold text-sm text-foreground">
              {isRtl ? titleAr : titleEn}
            </span>
          </div>
          <Badge variant="outline" className={`text-xs font-mono font-bold ${badgeClass}`}>
            {items.length}
          </Badge>
        </div>

        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-3 text-center bg-muted/20 rounded-lg border border-dashed">
            {isRtl ? "لا توجد مهام في هذا القسم" : "No tasks in this section"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((task) => (
              <Card
                key={task.id}
                className={`border rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer bg-card ${
                  task.isOverdue ? "border-destructive/60 bg-destructive/5" : "border-border/80"
                }`}
                onClick={() => onSelectTask(task)}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header: Code & Priority */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {task.taskCode}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold capitalize ${
                        task.priority === "critical"
                          ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                          : task.priority === "high"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {task.priority}
                    </Badge>
                  </div>

                  {/* Title & Category */}
                  <div>
                    <div className="font-bold text-sm text-foreground leading-snug line-clamp-2">
                      {task.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {task.category}
                    </div>
                  </div>

                  {/* Context Links */}
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
                    {task.caseNumber && (
                      <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-700 px-1.5 py-0.5 rounded font-mono font-medium">
                        <Headphones className="h-3 w-3" />
                        {task.caseNumber}
                      </span>
                    )}
                  </div>

                  {/* Due Date & Returned Notes */}
                  {task.dueDate && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{new Date(task.dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}</span>
                    </div>
                  )}

                  {task.reviewNotes && task.status === "in_progress" && (
                    <div className="p-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px]">
                      <span className="font-bold">{isRtl ? "ملاحظات الإرجاع: " : "Returned Notes: "}</span>
                      {task.reviewNotes}
                    </div>
                  )}

                  {/* Worker Action Buttons */}
                  <div className="pt-2 border-t flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                    {task.status === "not_started" && (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                        onClick={() => onStatusChange(task.id, "in_progress")}
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        <span>{isRtl ? "بدء التنفيذ" : "Start Work"}</span>
                      </Button>
                    )}

                    {task.status === "in_progress" && (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                        onClick={() => onStatusChange(task.id, "waiting_review")}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <span>{isRtl ? "إرسال للمراجعة" : "Submit for Review"}</span>
                      </Button>
                    )}

                    {task.status === "waiting_review" && (
                      <div className="w-full text-center text-xs text-amber-700 font-medium py-1.5 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{isRtl ? "قيد مراجعة المشرف" : "Under Supervisor Review"}</span>
                      </div>
                    )}

                    {task.status === "completed" && (
                      <div className="w-full text-center text-xs text-emerald-700 font-medium py-1.5 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{isRtl ? "تم الاعتماد والاكتمال" : "Completed & Verified"}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const inProgressCount = inProgressTasks.length;
  const overdueCount = overdueTasks.length;
  const completedCount = completedTasks.length;
  const allCount = tasks.filter((t) => t.status !== "cancelled").length;

  return (
    <div className="space-y-6">
      {/* Workspace Quick Sub-Filters */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b">
        <Button
          variant={subFilter === "all" ? "default" : "outline"}
          size="sm"
          className="text-xs h-8 rounded-lg gap-1.5"
          onClick={() => setSubFilter("all")}
        >
          <span>{isRtl ? "كل مهامي" : "My Tasks"}</span>
          <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono">
            {allCount}
          </Badge>
        </Button>

        <Button
          variant={subFilter === "in_progress" ? "default" : "outline"}
          size="sm"
          className="text-xs h-8 rounded-lg gap-1.5"
          onClick={() => setSubFilter("in_progress")}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          <span>{isRtl ? "قيد التنفيذ" : "In Progress"}</span>
          <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono">
            {inProgressCount}
          </Badge>
        </Button>

        <Button
          variant={subFilter === "overdue" ? "default" : "outline"}
          size="sm"
          className="text-xs h-8 rounded-lg gap-1.5"
          onClick={() => setSubFilter("overdue")}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{isRtl ? "متأخرة" : "Overdue"}</span>
          <Badge
            variant={overdueCount > 0 ? "destructive" : "secondary"}
            className="text-[10px] px-1 py-0 font-mono"
          >
            {overdueCount}
          </Badge>
        </Button>

        <Button
          variant={subFilter === "completed" ? "default" : "outline"}
          size="sm"
          className="text-xs h-8 rounded-lg gap-1.5"
          onClick={() => setSubFilter("completed")}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{isRtl ? "مكتملة" : "Completed"}</span>
          <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono">
            {completedCount}
          </Badge>
        </Button>
      </div>

      {subFilter === "in_progress" &&
        renderSection(
          "مهام قيد التنفيذ",
          "Tasks In Progress",
          inProgressTasks,
          PlayCircle,
          "bg-blue-50 text-blue-700 border-blue-200",
        )}

      {subFilter === "overdue" &&
        renderSection(
          "مهام متأخرة عن الموعد",
          "Overdue Tasks",
          overdueTasks,
          AlertCircle,
          "bg-destructive/10 text-destructive border-destructive/20",
          true,
        )}

      {subFilter === "completed" &&
        renderSection(
          "مهام مكتملة",
          "Completed Tasks",
          completedTasks,
          CheckCircle2,
          "bg-emerald-50 text-emerald-700 border-emerald-200",
        )}

      {subFilter === "all" && (
        <div className="space-y-8">
          {/* Overdue Section */}
          {overdueTasks.length > 0 &&
            renderSection(
              "مهام متأخرة عن الموعد",
              "Overdue Tasks",
              overdueTasks,
              AlertCircle,
              "bg-destructive/10 text-destructive border-destructive/20",
              true,
            )}

          {/* Today Section */}
          {renderSection(
            "مهام اليوم",
            "Due Today",
            todayTasks,
            Clock,
            "bg-amber-50 text-amber-700 border-amber-200",
          )}

          {/* Upcoming Section */}
          {renderSection(
            "مهام قادمة",
            "Upcoming Tasks",
            upcomingTasks,
            Calendar,
            "bg-blue-50 text-blue-700 border-blue-200",
          )}

          {/* Waiting Review Section */}
          {renderSection(
            "مهام بانتظار المراجعة والاعتماد",
            "Waiting for Review",
            inReviewTasks,
            ClipboardCheck,
            "bg-purple-50 text-purple-700 border-purple-200",
          )}

          {/* Completed Section */}
          {renderSection(
            "مهام مكتملة مؤخراً",
            "Recently Completed",
            completedTasks,
            CheckCircle2,
            "bg-emerald-50 text-emerald-700 border-emerald-200",
          )}
        </div>
      )}
    </div>
  );
}
