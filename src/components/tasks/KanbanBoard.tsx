import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskCard } from "@/components/tasks/TaskCard";
import type { TaskStatus, TaskItem } from "@/lib/task-types";
import { toast } from "sonner";
import { CircleDot, PlayCircle, ClipboardCheck, CheckCircle2 } from "lucide-react";

interface KanbanBoardProps {
  tasks: TaskItem[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onSelectTask: (task: TaskItem) => void;
  userRole?: string;
  loading?: boolean;
  selectedTaskIds?: string[];
  onToggleSelectTask?: (taskId: string, selected: boolean) => void;
  canSelect?: boolean;
}

interface ColumnConfig {
  id: TaskStatus;
  titleAr: string;
  titleEn: string;
  icon: any;
  headerClass: string;
  bgClass: string;
}

const KANBAN_COLUMNS: ColumnConfig[] = [
  {
    id: "not_started",
    titleAr: "لم تبدأ",
    titleEn: "Not Started",
    icon: CircleDot,
    headerClass: "text-slate-700 dark:text-slate-300",
    bgClass: "border-slate-200/80 bg-slate-50/40 dark:bg-slate-900/20",
  },
  {
    id: "in_progress",
    titleAr: "قيد التنفيذ",
    titleEn: "In Progress",
    icon: PlayCircle,
    headerClass: "text-blue-700 dark:text-blue-400",
    bgClass: "border-blue-200/80 bg-blue-50/30 dark:bg-blue-950/10",
  },
  {
    id: "waiting_review",
    titleAr: "بانتظار المراجعة",
    titleEn: "Waiting Review",
    icon: ClipboardCheck,
    headerClass: "text-amber-700 dark:text-amber-400",
    bgClass: "border-amber-200/80 bg-amber-50/30 dark:bg-amber-950/10",
  },
  {
    id: "completed",
    titleAr: "مكتملة",
    titleEn: "Completed",
    icon: CheckCircle2,
    headerClass: "text-emerald-700 dark:text-emerald-400",
    bgClass: "border-emerald-200/80 bg-emerald-50/30 dark:bg-emerald-950/10",
  },
];

export function KanbanBoard({
  tasks,
  onStatusChange,
  onSelectTask,
  userRole,
  loading,
  selectedTaskIds = [],
  onToggleSelectTask,
  canSelect = false,
}: KanbanBoardProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const handleDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(colId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    if (userRole === "worker" && colId === "completed") {
      toast.error(
        isRtl
          ? "غير مسموح للفنيين باعتماد المهام مباشرة. يرجى إرسالها للمراجعة."
          : "Workers cannot mark tasks completed directly. Submit for review.",
      );
      return;
    }

    try {
      await onStatusChange(taskId, colId);
    } catch (err: any) {
      toast.error(err?.message || "Failed to move task");
    }
  };

  const tasksByColumn: Record<TaskStatus, TaskItem[]> = {
    not_started: [],
    in_progress: [],
    waiting_review: [],
    completed: [],
    cancelled: [],
  };

  for (const t of tasks) {
    if (tasksByColumn[t.status]) {
      tasksByColumn[t.status].push(t);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start min-h-[500px]">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasksByColumn[col.id];
        const isTarget = dragOverColumn === col.id;
        const Icon = col.icon;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`flex flex-col rounded-2xl border p-3.5 transition-all min-h-[480px] ${
              col.bgClass
            } ${isTarget ? "ring-2 ring-primary border-primary scale-[1.01]" : ""}`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/70">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${col.headerClass}`} />
                <span className={`font-semibold text-sm ${col.headerClass}`}>
                  {isRtl ? col.titleAr : col.titleEn}
                </span>
              </div>
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-background border text-foreground">
                {colTasks.length}
              </span>
            </div>

            {/* Task List */}
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
              {colTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-center text-xs text-muted-foreground/60 border-2 border-dashed border-border/50 rounded-xl p-4">
                  <span>{isRtl ? "لا توجد مهام" : "No tasks"}</span>
                </div>
              ) : (
                colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={onStatusChange}
                    onSelectTask={onSelectTask}
                    userRole={userRole}
                    isSelected={selectedTaskIds.includes(task.id)}
                    onToggleSelect={onToggleSelectTask}
                    canSelect={canSelect}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
