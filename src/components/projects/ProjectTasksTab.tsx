import React from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckSquare,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  User,
} from "lucide-react";
import type { TaskItem } from "@/lib/task-types";

interface ProjectTasksTabProps {
  tasks: TaskItem[];
  onOpenCreateTask?: () => void;
}

export function ProjectTasksTab({ tasks, onOpenCreateTask }: ProjectTasksTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getStatusBadge = (status: TaskItem["status"]) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "مكتملة" : "Completed"}</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "قيد التنفيذ" : "In Progress"}</Badge>;
      case "waiting_review":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">{isAr ? "بانتظار المراجعة" : "Waiting Review"}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{isAr ? "ملغاة" : "Cancelled"}</Badge>;
      case "not_started":
      default:
        return <Badge variant="outline">{isAr ? "لم تبدأ" : "Not Started"}</Badge>;
    }
  };

  const getPriorityBadge = (priority: TaskItem["priority"]) => {
    switch (priority) {
      case "critical":
        return <Badge variant="destructive" className="text-[10px]">{isAr ? "حرجة" : "Critical"}</Badge>;
      case "high":
        return <Badge className="bg-amber-600 text-white text-[10px]">{isAr ? "عالية" : "High"}</Badge>;
      case "low":
        return <Badge variant="secondary" className="text-[10px]">{isAr ? "منخفضة" : "Low"}</Badge>;
      case "medium":
      default:
        return <Badge variant="outline" className="text-[10px]">{isAr ? "متوسطة" : "Medium"}</Badge>;
    }
  };

  const openCount = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;

  return (
    <div className="space-y-6">
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "مهام ومتابعات المشروع" : "Project Tasks & Follow-ups"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {tasks.length}
            </Badge>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{overdueCount} {isAr ? "متأخرة" : "Overdue"}</span>
              </Badge>
            )}
          </div>
          {onOpenCreateTask && (
            <Button size="sm" onClick={onOpenCreateTask} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "إضافة مهمة جديدة" : "Add Task"}</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد مهام مسجلة لهذا المشروع بعد" : "No tasks recorded for this project yet."}
              </p>
              {onOpenCreateTask && (
                <Button size="sm" variant="outline" onClick={onOpenCreateTask} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إنشاء أول مهمة" : "Create First Task"}</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "كود المهمة" : "Task Code"}</th>
                    <th className="px-4 py-3">{isAr ? "عنوان المهمة" : "Title"}</th>
                    <th className="px-4 py-3">{isAr ? "الفئة" : "Category"}</th>
                    <th className="px-4 py-3">{isAr ? "الأولوية" : "Priority"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3">{isAr ? "تاريخ الاستحقاق" : "Due Date"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ الإنشاء" : "Created"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {t.taskCode}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{t.title}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {t.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                        {t.category}
                      </td>
                      <td className="px-4 py-3">{getPriorityBadge(t.priority)}</td>
                      <td className="px-4 py-3">{getStatusBadge(t.status)}</td>
                      <td className="px-4 py-3 text-xs" dir="ltr">
                        {t.dueDate ? (
                          <span
                            className={
                              t.isOverdue
                                ? "text-rose-600 font-bold flex items-center gap-1"
                                : "text-muted-foreground"
                            }
                          >
                            {typeof t.dueDate === "string" ? t.dueDate.slice(0, 10) : new Date(t.dueDate).toISOString().slice(0, 10)}
                            {t.isOverdue && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {typeof t.createdAt === "string" ? t.createdAt.slice(0, 10) : new Date(t.createdAt).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
