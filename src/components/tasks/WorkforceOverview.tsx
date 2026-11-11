import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  ClipboardCheck,
  Search,
  Filter,
  UserCheck,
  ShieldAlert,
} from "lucide-react";
import type { WorkforceMember } from "@/lib/task-types";

interface WorkforceOverviewProps {
  members: WorkforceMember[];
  onSelectWorker: (userId: string) => void;
  loading?: boolean;
}

export function WorkforceOverview({
  members,
  onSelectWorker,
  loading = false,
}: WorkforceOverviewProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.username.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalWorkers = members.length;
  const totalOpenTasks = members.reduce((sum, m) => sum + m.openTasksCount, 0);
  const totalCritical = members.reduce((sum, m) => sum + m.criticalTasksCount, 0);
  const totalOverdue = members.reduce((sum, m) => sum + m.overdueTasksCount, 0);
  const totalWaitingReview = members.reduce((sum, m) => sum + m.waitingReviewCount, 0);
  const totalCompletedToday = members.reduce((sum, m) => sum + m.completedTodayCount, 0);

  const getWorkloadLevel = (count: number) => {
    if (count === 0) return { labelAr: "متاح", labelEn: "Available", className: "bg-slate-100 text-slate-700" };
    if (count <= 2) return { labelAr: "خفيف", labelEn: "Light", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (count <= 5) return { labelAr: "متوسط", labelEn: "Moderate", className: "bg-blue-50 text-blue-700 border-blue-200" };
    return { labelAr: "مزدحم", labelEn: "Heavy", className: "bg-rose-50 text-rose-700 border-rose-200" };
  };

  return (
    <div className="space-y-5">
      {/* Metric summary banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border shadow-xs bg-card">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{isRtl ? "إجمالي الفريق" : "Workforce"}</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl font-bold font-mono">{totalWorkers}</div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-card">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{isRtl ? "مهام جارية" : "Active Tasks"}</span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-600">{totalOpenTasks}</div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-card">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{isRtl ? "مهام حرجة" : "Critical"}</span>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-xl font-bold font-mono text-rose-600">{totalCritical}</div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-card">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{isRtl ? "مهام متأخرة" : "Overdue"}</span>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
            <div className="text-xl font-bold font-mono text-destructive">{totalOverdue}</div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-card">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{isRtl ? "بانتظار المراجعة" : "In Review"}</span>
              <ClipboardCheck className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-600">{totalWaitingReview}</div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-card">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{isRtl ? "أُنجزت اليوم" : "Done Today"}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-600">{totalCompletedToday}</div>
          </CardContent>
        </Card>
      </div>

      {/* Directory search & filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRtl ? "بحث باسم الفني أو المستخدم..." : "Search worker by name..."}
            className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {["all", "worker", "sales", "admin", "owner"].map((r) => (
            <Button
              key={r}
              variant={roleFilter === r ? "default" : "outline"}
              size="sm"
              onClick={() => setRoleFilter(r)}
              className="h-8 text-xs capitalize rounded-lg"
            >
              {r === "all" ? (isRtl ? "الكل" : "All Roles") : r}
            </Button>
          ))}
        </div>
      </div>

      {/* Worker cards grid */}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {isRtl ? "جاري تحميل بيانات فريق العمل..." : "Loading workforce..."}
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed rounded-xl p-6">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <span>{isRtl ? "لم يتم العثور على موظفين يطابقون البحث" : "No workers match the search criteria"}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((worker) => {
            const workload = getWorkloadLevel(worker.openTasksCount);
            return (
              <Card
                key={worker.userId}
                className="border rounded-xl shadow-xs hover:shadow-md transition-all bg-card overflow-hidden"
              >
                <CardContent className="p-4 space-y-3.5">
                  {/* Worker header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                        {worker.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-sm leading-tight text-foreground">
                          {worker.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          @{worker.username}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px] capitalize font-medium">
                        {worker.role}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] font-medium ${workload.className}`}>
                        {isRtl ? workload.labelAr : workload.labelEn}
                      </Badge>
                    </div>
                  </div>

                  {/* Task counts breakdown */}
                  <div className="grid grid-cols-4 gap-1.5 p-2 bg-muted/40 rounded-lg text-center text-xs">
                    <div>
                      <div className="text-muted-foreground text-[10px]">{isRtl ? "مفتوحة" : "Open"}</div>
                      <div className="font-mono font-bold text-foreground">{worker.openTasksCount}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">{isRtl ? "حرجة" : "Critical"}</div>
                      <div className="font-mono font-bold text-rose-600">{worker.criticalTasksCount}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">{isRtl ? "متأخرة" : "Overdue"}</div>
                      <div className="font-mono font-bold text-destructive">{worker.overdueTasksCount}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">{isRtl ? "للمراجعة" : "Review"}</div>
                      <div className="font-mono font-bold text-amber-600">{worker.waitingReviewCount}</div>
                    </div>
                  </div>

                  {/* Action button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 gap-1.5 rounded-lg text-primary border-primary/20 hover:bg-primary/5"
                    onClick={() => onSelectWorker(worker.userId)}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>{isRtl ? "عرض مهام هذا الفني" : "View Assigned Tasks"}</span>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
