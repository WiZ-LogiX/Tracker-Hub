import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, User, Tag, Calendar, Flag, CheckCircle2, Layers } from "lucide-react";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type WorkforceMember,
} from "@/lib/task-types";

interface TaskFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  status?: string;
  onStatusChange?: (v: string) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  assigneeId: string;
  onAssigneeChange: (v: string) => void;
  dueState: string;
  onDueStateChange: (v: string) => void;
  module?: "all" | "order" | "production" | "delivery" | "after_sales";
  onModuleChange?: (v: "all" | "order" | "production" | "delivery" | "after_sales") => void;
  workforce: WorkforceMember[];
  onNewTaskClick: () => void;
  userRole?: string;
}

export function TaskFilterBar({
  search,
  onSearchChange,
  status = "all",
  onStatusChange,
  priority,
  onPriorityChange,
  category,
  onCategoryChange,
  assigneeId,
  onAssigneeChange,
  dueState,
  onDueStateChange,
  module = "all",
  onModuleChange,
  workforce,
  onNewTaskClick,
  userRole,
}: TaskFilterBarProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const canCreate = userRole !== "worker" && userRole !== "viewer";
  const isWorker = userRole === "worker";

  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-card border rounded-xl p-3 shadow-xs">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={isRtl ? "بحث في المهام والرموز والعملاء..." : "Search tasks, codes..."}
          className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
        />
      </div>

      {/* Select Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status Filter */}
        {onStatusChange && (
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-28 sm:w-32 h-9 text-xs rounded-lg">
              <CheckCircle2 className="h-3 w-3 mr-1 rtl:ml-1 rtl:mr-0 text-muted-foreground" />
              <SelectValue placeholder={isRtl ? "الحالة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                {isRtl ? "كل الحالات" : "All Statuses"}
              </SelectItem>
              <SelectItem value="not_started" className="text-xs">
                {isRtl ? "قيد الانتظار" : "To Do"}
              </SelectItem>
              <SelectItem value="in_progress" className="text-xs">
                {isRtl ? "قيد التنفيذ" : "In Progress"}
              </SelectItem>
              <SelectItem value="waiting_review" className="text-xs">
                {isRtl ? "بانتظار المراجعة" : "In Review"}
              </SelectItem>
              <SelectItem value="completed" className="text-xs">
                {isRtl ? "مكتملة" : "Completed"}
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Operational Module Filter */}
        {onModuleChange && (
          <Select value={module} onValueChange={(v: any) => onModuleChange(v)}>
            <SelectTrigger className="w-32 sm:w-36 h-9 text-xs rounded-lg">
              <Layers className="h-3 w-3 mr-1 rtl:ml-1 rtl:mr-0 text-muted-foreground" />
              <SelectValue placeholder={isRtl ? "القسم" : "Module"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                {isRtl ? "كل الأقسام" : "All Modules"}
              </SelectItem>
              <SelectItem value="order" className="text-xs">
                {isRtl ? "أوامر الإنتاج" : "Orders"}
              </SelectItem>
              <SelectItem value="production" className="text-xs">
                {isRtl ? "أوامر التشغيل" : "Work Orders"}
              </SelectItem>
              <SelectItem value="delivery" className="text-xs">
                {isRtl ? "التوصيل والتركيب" : "Deliveries"}
              </SelectItem>
              <SelectItem value="after_sales" className="text-xs">
                {isRtl ? "ما بعد البيع" : "After-Sales"}
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Priority Filter */}
        <Select value={priority} onValueChange={onPriorityChange}>
          <SelectTrigger className="w-28 sm:w-32 h-9 text-xs rounded-lg">
            <Flag className="h-3 w-3 mr-1 rtl:ml-1 rtl:mr-0 text-muted-foreground" />
            <SelectValue placeholder={isRtl ? "الأولوية" : "Priority"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              {isRtl ? "كل الأولويات" : "All Priorities"}
            </SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p.key} value={p.key} className="text-xs">
                {isRtl ? p.labelAr : p.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category Filter */}
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-32 sm:w-36 h-9 text-xs rounded-lg">
            <Tag className="h-3 w-3 mr-1 rtl:ml-1 rtl:mr-0 text-muted-foreground" />
            <SelectValue placeholder={isRtl ? "التصنيف" : "Category"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              {isRtl ? "كل التصنيفات" : "All Categories"}
            </SelectItem>
            {TASK_CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key} className="text-xs">
                {isRtl ? c.labelAr : c.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee Filter (Managers only) */}
        {!isWorker && (
          <Select value={assigneeId} onValueChange={onAssigneeChange}>
            <SelectTrigger className="w-36 sm:w-40 h-9 text-xs rounded-lg">
              <User className="h-3 w-3 mr-1 rtl:ml-1 rtl:mr-0 text-muted-foreground" />
              <SelectValue placeholder={isRtl ? "المكلف" : "Assignee"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                {isRtl ? "كل الموظفين" : "All Assignees"}
              </SelectItem>
              {workforce.map((w) => (
                <SelectItem key={w.userId} value={w.userId} className="text-xs">
                  {w.displayName} ({w.openTasksCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Due State Filter */}
        <Select value={dueState} onValueChange={onDueStateChange}>
          <SelectTrigger className="w-32 sm:w-36 h-9 text-xs rounded-lg">
            <Calendar className="h-3 w-3 mr-1 rtl:ml-1 rtl:mr-0 text-muted-foreground" />
            <SelectValue placeholder={isRtl ? "الموعد" : "Due State"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              {isRtl ? "كل المواعيد" : "All Dates"}
            </SelectItem>
            <SelectItem value="overdue" className="text-xs text-destructive font-medium">
              {isRtl ? "متأخرة عن الموعد" : "Overdue"}
            </SelectItem>
            <SelectItem value="due_today" className="text-xs text-amber-600 font-medium">
              {isRtl ? "تستحق اليوم" : "Due Today"}
            </SelectItem>
            <SelectItem value="upcoming" className="text-xs text-blue-600">
              {isRtl ? "قادمة" : "Upcoming"}
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Action Button: Create Task */}
        {canCreate && (
          <Button
            onClick={onNewTaskClick}
            className="gap-2 bg-primary text-primary-foreground shadow-xs h-9 text-xs rounded-lg shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? "مهمة جديدة" : "New Task"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
