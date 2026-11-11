import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/lib/useAuth";
import {
  listTasks,
  getTaskById,
  changeTaskStatus,
  listWorkforceMembers,
  bulkUpdateTasks,
} from "@/lib/tasks.functions";
import type { TaskStatus, TaskPriority, TaskItem, WorkforceMember } from "@/lib/task-types";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { MyTasksView } from "@/components/tasks/MyTasksView";
import { WorkforceOverview } from "@/components/tasks/WorkforceOverview";
import { BulkActionBar } from "@/components/tasks/BulkActionBar";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckSquare,
  Kanban,
  LayoutList,
  Users,
  AlertCircle,
  Clock,
  ClipboardCheck,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const tasksSearchSchema = z.object({
  tab: z.enum(["my_tasks", "kanban", "workforce"]).optional(),
  taskId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  module: z.enum(["all", "order", "production", "delivery", "after_sales"]).optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute("/admin/tasks")({
  validateSearch: (search: Record<string, unknown>) => tasksSearchSchema.parse(search),
  component: TasksPage,
});

function TasksPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole, user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = Route.useSearch();

  const isWorker = currentRole === "worker";
  const canManage = currentRole !== "worker" && currentRole !== "viewer";

  // Server functions
  const listTasksFn = useServerFn(listTasks);
  const getTaskByIdFn = useServerFn(getTaskById);
  const changeStatusFn = useServerFn(changeTaskStatus);
  const listWorkforceFn = useServerFn(listWorkforceMembers);
  const bulkUpdateFn = useServerFn(bulkUpdateTasks);

  // Active view tab (default to searchParams.tab if provided, or my_tasks for workers)
  const [activeTab, setActiveTab] = useState<string>(
    searchParams.tab || (isWorker ? "my_tasks" : "kanban"),
  );

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.status || "all");
  const [search, setSearch] = useState(searchParams.search || "");
  const [priority, setPriority] = useState(searchParams.priority || "all");
  const [category, setCategory] = useState("all");
  const [assigneeId, setAssigneeId] = useState(searchParams.assigneeId || "all");
  const [dueState, setDueState] = useState("all");
  const [moduleFilter, setModuleFilter] = useState<"all" | "order" | "production" | "delivery" | "after_sales">(
    (searchParams.module as any) || "all",
  );

  // Selection & Modal states
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Deep-linking effect: when taskId is provided in search params, fetch and open details directly
  useEffect(() => {
    if (searchParams.taskId) {
      let isMounted = true;
      getTaskByIdFn({ data: { taskId: searchParams.taskId } })
        .then((res: any) => {
          if (isMounted && res) {
            setSelectedTask(res as TaskItem);
            setIsDetailOpen(true);
          }
        })
        .catch((err) => {
          console.warn("Could not load deep-linked task", err);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [searchParams.taskId]);

  // Fetch Workforce Directory
  const {
    data: workforce = [],
    isLoading: isLoadingWorkforce,
    refetch: refetchWorkforce,
  } = useQuery({
    queryKey: ["workforce-members"],
    queryFn: async () => {
      const res = await listWorkforceFn();
      return (res as unknown as WorkforceMember[]) || [];
    },
  });

  // Fetch Tasks with filters
  const {
    data: tasks = [],
    isLoading: isLoadingTasks,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ["tasks", priority, category, assigneeId, dueState, search, statusFilter, moduleFilter],
    queryFn: async () => {
      const p = priority !== "all" ? (priority as any) : undefined;
      const c = category !== "all" ? (category as any) : undefined;
      const a = assigneeId !== "all" ? assigneeId : undefined;
      const d = dueState !== "all" ? (dueState as any) : undefined;
      const s = statusFilter !== "all" ? (statusFilter as any) : undefined;
      const m = moduleFilter !== "all" ? moduleFilter : undefined;

      const res = await listTasksFn({
        data: {
          status: s,
          priority: p,
          category: c,
          assigneeId: a,
          dueState: d,
          module: m,
          search: search || undefined,
        },
      });
      return (res as unknown as TaskItem[]) || [];
    },
  });

  // Status Change Mutation
  const statusMutation = useMutation({
    mutationFn: async ({
      taskId,
      status,
      reviewNotes,
    }: {
      taskId: string;
      status: TaskStatus;
      reviewNotes?: string;
    }) => {
      return await changeStatusFn({
        data: { taskId, status, reviewNotes },
      });
    },
    onMutate: async ({ taskId, status, reviewNotes }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const prevTasks = queryClient.getQueryData<TaskItem[]>([
        "tasks",
        priority,
        category,
        assigneeId,
        dueState,
        search,
      ]);

      if (prevTasks) {
        queryClient.setQueryData<TaskItem[]>(
          ["tasks", priority, category, assigneeId, dueState, search],
          prevTasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status,
                  reviewNotes: reviewNotes !== undefined ? reviewNotes : t.reviewNotes,
                }
              : t,
          ),
        );
      }
      return { prevTasks };
    },
    onError: (err: any, _vars, context) => {
      if (context?.prevTasks) {
        queryClient.setQueryData(
          ["tasks", priority, category, assigneeId, dueState, search],
          context.prevTasks,
        );
      }
      toast.error(err?.message || (isRtl ? "فشل تحديث حالة المهمة" : "Failed to update task status"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-members"] });
    },
    onSuccess: () => {
      toast.success(isRtl ? "تم تحديث حالة المهمة بنجاح" : "Task status updated successfully");
    },
  });

  // Bulk Operations Mutation
  const bulkMutation = useMutation({
    mutationFn: async (payload: {
      taskIds: string[];
      assigneeId?: string;
      priority?: TaskPriority;
      dueDate?: string | null;
      status?: TaskStatus;
    }) => {
      return await bulkUpdateFn({ data: payload });
    },
    onSuccess: (res: any) => {
      toast.success(
        isRtl
          ? `تم تحديث ${res?.updatedCount || selectedTaskIds.length} مهمة بنجاح`
          : `Updated ${res?.updatedCount || selectedTaskIds.length} tasks successfully`,
      );
      setSelectedTaskIds([]);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-members"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || (isRtl ? "فشل تنفيذ العملية المجمعة" : "Bulk update failed"));
    },
  });

  const handleStatusChange = async (
    taskId: string,
    newStatus: TaskStatus,
    reviewNotes?: string,
  ) => {
    await statusMutation.mutateAsync({ taskId, status: newStatus, reviewNotes });
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              reviewNotes: reviewNotes !== undefined ? reviewNotes : prev.reviewNotes,
            }
          : null,
      );
    }
  };

  const handleSelectTask = (task: TaskItem) => {
    setSelectedTask(task);
    setIsDetailOpen(true);
  };

  const handleEditTask = (task: TaskItem) => {
    setIsDetailOpen(false);
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const handleToggleSelectTask = (taskId: string, selected: boolean) => {
    setSelectedTaskIds((prev) =>
      selected ? [...prev, taskId] : prev.filter((id) => id !== taskId),
    );
  };

  // Bulk operation handlers
  const handleBulkAssignWorker = async (workerId: string) => {
    await bulkMutation.mutateAsync({
      taskIds: selectedTaskIds,
      assigneeId: workerId,
    });
  };

  const handleBulkChangePriority = async (newPriority: TaskPriority) => {
    await bulkMutation.mutateAsync({
      taskIds: selectedTaskIds,
      priority: newPriority,
    });
  };

  const handleBulkSetDueDate = async (newDueDate: string) => {
    await bulkMutation.mutateAsync({
      taskIds: selectedTaskIds,
      dueDate: newDueDate,
    });
  };

  const handleBulkMarkCompleted = async () => {
    await bulkMutation.mutateAsync({
      taskIds: selectedTaskIds,
      status: "completed",
    });
  };

  // KPI Calculations
  const metrics = useMemo(() => {
    const totalWorkers = workforce.length;
    const openTasks = tasks.filter(
      (t) => t.status !== "completed" && t.status !== "cancelled",
    ).length;
    const criticalTasks = tasks.filter(
      (t) =>
        t.priority === "critical" &&
        t.status !== "completed" &&
        t.status !== "cancelled",
    ).length;
    const overdueTasks = tasks.filter(
      (t) => t.isOverdue && t.status !== "completed" && t.status !== "cancelled",
    ).length;
    const waitingReview = tasks.filter((t) => t.status === "waiting_review").length;

    return {
      totalWorkers,
      openTasks,
      criticalTasks,
      overdueTasks,
      waitingReview,
    };
  }, [workforce, tasks]);

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <CheckSquare className="h-7 w-7 text-primary" />
            <span>{isRtl ? "إدارة المهام والعمليات" : "Task Management"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "متابعة مهام المصنع، وتعيين الفنيين، وتدفق المراجعة والاعتماد مع الربط المباشر بأوامر التشغيل والتسليم"
              : "Track factory operations, assign workforce, review work, and link tasks to orders & handovers"}
          </p>
        </div>
      </div>

      {/* Top Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="border rounded-xl shadow-xs bg-card">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-foreground leading-none">
                {metrics.totalWorkers}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">
                {isRtl ? "فريق العمل النشط" : "Active Workforce"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-xl shadow-xs bg-card">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center shrink-0">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-foreground leading-none">
                {metrics.openTasks}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">
                {isRtl ? "المهام الجارية" : "Open Tasks"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-xl shadow-xs bg-card">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400 leading-none">
                {metrics.criticalTasks}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">
                {isRtl ? "مهام حرجة" : "Critical Priority"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-xl shadow-xs bg-card">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 leading-none">
                {metrics.overdueTasks}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">
                {isRtl ? "مهام متأخرة" : "Overdue Tasks"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-xl shadow-xs bg-card col-span-2 sm:col-span-1">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 leading-none">
                {metrics.waitingReview}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">
                {isRtl ? "بانتظار المراجعة" : "Waiting Review"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <TaskFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        priority={priority}
        onPriorityChange={setPriority}
        category={category}
        onCategoryChange={setCategory}
        assigneeId={assigneeId}
        onAssigneeChange={setAssigneeId}
        dueState={dueState}
        onDueStateChange={setDueState}
        module={moduleFilter}
        onModuleChange={setModuleFilter}
        workforce={workforce}
        onNewTaskClick={() => {
          setEditingTask(null);
          setIsFormOpen(true);
        }}
        userRole={currentRole || undefined}
      />

      {/* Views Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 w-full sm:w-auto">
            <TabsTrigger value="kanban" className="flex items-center gap-2 text-xs">
              <Kanban className="h-4 w-4" />
              <span>{isRtl ? "لوحة كانبان" : "Kanban Board"}</span>
            </TabsTrigger>
            <TabsTrigger value="my_tasks" className="flex items-center gap-2 text-xs">
              <LayoutList className="h-4 w-4" />
              <span>{isRtl ? "مهامي" : "My Tasks"}</span>
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="workforce" className="flex items-center gap-2 text-xs">
                <Users className="h-4 w-4" />
                <span>{isRtl ? "فريق العمل والضغط" : "Workforce Workload"}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Tab 1: Kanban Board */}
        <TabsContent value="kanban" className="mt-0">
          <KanbanBoard
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onSelectTask={handleSelectTask}
            userRole={currentRole || undefined}
            loading={isLoadingTasks}
            selectedTaskIds={selectedTaskIds}
            onToggleSelectTask={handleToggleSelectTask}
            canSelect={canManage}
          />
        </TabsContent>

        {/* Tab 2: My Tasks View */}
        <TabsContent value="my_tasks" className="mt-0">
          <MyTasksView
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onSelectTask={handleSelectTask}
            userRole={currentRole || undefined}
            loading={isLoadingTasks}
          />
        </TabsContent>

        {/* Tab 3: Workforce Workload Overview (Managers Only) */}
        {canManage && (
          <TabsContent value="workforce" className="mt-0">
            <WorkforceOverview
              members={workforce}
              onSelectWorker={(workerId) => {
                setAssigneeId(workerId);
                setActiveTab("kanban");
              }}
              loading={isLoadingWorkforce}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Bulk Operations Floating Bar */}
      <BulkActionBar
        selectedCount={selectedTaskIds.length}
        workforce={workforce}
        onAssignWorker={handleBulkAssignWorker}
        onChangePriority={handleBulkChangePriority}
        onSetDueDate={handleBulkSetDueDate}
        onMarkCompleted={handleBulkMarkCompleted}
        onClearSelection={() => setSelectedTaskIds([])}
        canManage={canManage}
      />

      {/* Task Creation / Editing Dialog */}
      <TaskForm
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingTask(null);
        }}
        initialTask={editingTask}
        onTaskSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["workforce-members"] });
          refetchTasks();
          refetchWorkforce();
        }}
      />

      {/* Task Detail Drawer */}
      <TaskDetail
        task={selectedTask}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onStatusChange={handleStatusChange}
        onEditTask={handleEditTask}
        onTaskUpdated={() => {
          refetchTasks();
          refetchWorkforce();
        }}
        userRole={currentRole || undefined}
      />
    </div>
  );
}
