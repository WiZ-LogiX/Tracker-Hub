import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listTasks } from "@/lib/tasks.functions";
import type { TaskStatus } from "@/lib/task-types";
import { TaskForm } from "@/components/tasks/TaskForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckSquare, Plus, ExternalLink, Clock, AlertCircle } from "lucide-react";

interface OrderTasksWidgetProps {
  orderId: string;
  orderNumber: string;
  customerId?: string;
}

export function OrderTasksWidget({ orderId, orderNumber, customerId }: OrderTasksWidgetProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const listTasksFn = useServerFn(listTasks);

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await listTasksFn({
        data: {
          orderId,
          includeArchived: true,
        },
      });
      setTasks(res || []);
    } catch (e) {
      console.error("Failed to load order tasks", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      loadTasks();
    }
  }, [orderId]);

  const openCount = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;

  return (
    <div className="pt-3 border-t space-y-2.5">
      {/* Widget Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-xs text-foreground">
            {isRtl ? "مهام أمر التصنيع" : "Order Operational Tasks"}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono font-bold px-1.5 py-0">
            {openCount} {isRtl ? "مفتوحة" : "open"}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFormOpen(true)}
            className="h-6 px-2 text-[11px] gap-1 text-primary"
          >
            <Plus className="h-3 w-3" />
            <span>{isRtl ? "إضافة مهمة" : "Add Task"}</span>
          </Button>

          <Link to="/admin/tasks" className="text-muted-foreground hover:text-foreground">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="text-xs text-muted-foreground p-2 text-center">...</div>
      ) : tasks.length === 0 ? (
        <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border text-center">
          {isRtl ? "لا توجد مهام مرتبطة بهذا الأمر حتى الآن" : "No tasks linked to this order yet"}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to="/admin/tasks"
              search={{ taskId: task.id } as any}
              className="flex items-center justify-between p-2 rounded-lg border text-xs bg-card hover:bg-muted/40 transition-colors cursor-pointer group"
            >
              <div className="space-y-0.5 min-w-0 pr-2 rtl:pr-0 rtl:pl-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
                    {task.taskCode}
                  </span>
                  <span className="font-medium truncate">{task.title}</span>
                </div>
                {task.dueDate && (
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {task.isOverdue ? (
                      <AlertCircle className="h-3 w-3 text-destructive" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    <span>{new Date(task.dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}</span>
                  </div>
                )}
              </div>

              <Badge
                variant="outline"
                className={`text-[10px] capitalize shrink-0 ${
                  task.status === "completed"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : task.status === "in_progress"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : task.status === "waiting_review"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : ""
                }`}
              >
                {task.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Quick Task Create Dialog */}
      <TaskForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onTaskCreated={loadTasks}
        defaultOrderId={orderId}
        defaultCustomerId={customerId}
        defaultCategory="production"
      />
    </div>
  );
}
