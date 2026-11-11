import React, { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/lib/project.functions";
import type { ProjectListItem, HealthSeverity } from "@/lib/project-types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Clock,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { OpportunityFormModal } from "@/components/crm/OpportunityFormModal";

export const Route = createFileRoute("/admin/projects/")({
  component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const nav = useNavigate();

  const listProjectsFn = useServerFn(listProjects);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [projectTypeFilter, setProjectTypeFilter] = useState("all");

  // New Project Modal
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await listProjectsFn({
        data: {
          searchTerm: searchTerm || undefined,
          stageFilter: stageFilter !== "all" ? stageFilter : undefined,
          projectTypeFilter: projectTypeFilter !== "all" ? projectTypeFilter : undefined,
          page,
          pageSize,
        },
      });
      setProjects(res.rows);
      setTotalCount(res.totalCount);
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل تحميل المشاريع" : "Failed to load projects"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [page, stageFilter, projectTypeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProjects();
  };

  const getHealthBadge = (severity: HealthSeverity) => {
    switch (severity) {
      case "good":
        return <Badge className="bg-emerald-600 text-white text-[11px]">{isAr ? "سليم" : "Healthy"}</Badge>;
      case "warning":
        return <Badge className="bg-amber-600 text-white text-[11px]">{isAr ? "انتباه" : "Attention"}</Badge>;
      case "critical":
        return <Badge variant="destructive" className="text-[11px]">{isAr ? "حرج" : "Critical"}</Badge>;
      case "neutral":
      default:
        return <Badge variant="outline" className="text-[11px]">{isAr ? "مستقر" : "Normal"}</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FolderKanban className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {isAr ? "إدارة المشاريع التشغيلية (Job Workspace)" : "Customer Projects & Jobs"}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isAr
              ? "مساحة عمل موحدة لتتبع ومتابعة كل مشروع من الفرصة البيعية وحتى التسليم والضمان."
              : "Unified workspace tracking every customer project from commercial opportunity to warranty."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadProjects}
            disabled={loading}
            className="gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{isAr ? "تحديث" : "Refresh"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsNewProjectModalOpen(true)}
            className="gap-1.5 h-9"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? "مشروع جديد" : "New Project"}</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="shadow-xs">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isAr ? "بحث برقم المشروع، الاسم، العميل، أو الهاتف..." : "Search project #, name, customer, phone..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rtl:pl-3 rtl:pr-9 h-9 text-xs sm:text-sm"
              />
            </div>

            <div>
              <Select value={stageFilter} onValueChange={(val) => { setStageFilter(val); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={isAr ? "المرحلة" : "Stage"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "جميع المراحل" : "All Stages"}</SelectItem>
                  <SelectItem value="won">{isAr ? "معتمد / تعاقد (Won)" : "Won / Contract"}</SelectItem>
                  <SelectItem value="quotation">{isAr ? "عرض أسعار (Quotation)" : "Quotation"}</SelectItem>
                  <SelectItem value="negotiation">{isAr ? "تفاوض (Negotiation)" : "Negotiation"}</SelectItem>
                  <SelectItem value="design_measurement">{isAr ? "تصميم ومقاسات" : "Design & Measurement"}</SelectItem>
                  <SelectItem value="site_visit">{isAr ? "معاينة موقع" : "Site Visit"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Select value={projectTypeFilter} onValueChange={(val) => { setProjectTypeFilter(val); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs flex-1">
                  <SelectValue placeholder={isAr ? "نوع المشروع" : "Project Type"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "جميع الأنواع" : "All Types"}</SelectItem>
                  <SelectItem value="residential">{isAr ? "سكني" : "Residential"}</SelectItem>
                  <SelectItem value="commercial">{isAr ? "تجاري" : "Commercial"}</SelectItem>
                  <SelectItem value="office">{isAr ? "مكتبي" : "Office"}</SelectItem>
                  <SelectItem value="hospitality">{isAr ? "فندقي" : "Hospitality"}</SelectItem>
                </SelectContent>
              </Select>

              <Button type="submit" size="sm" variant="secondary" className="h-9 px-3">
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold">
              {isAr ? "قائمة المشاريع" : "Projects List"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {totalCount} {isAr ? "مشروع" : "projects"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-3">
              <FolderKanban className="w-12 h-12 mx-auto text-muted-foreground/30" />
              <p className="text-base font-medium">
                {isAr ? "لم يتم العثور على أي مشاريع مطابقة للبحث" : "No projects found matching the criteria."}
              </p>
              <Button size="sm" variant="outline" onClick={() => setIsNewProjectModalOpen(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? "إنشاء مشروع جديد" : "Create New Project"}</span>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم المشروع" : "Project #"}</th>
                    <th className="px-4 py-3">{isAr ? "اسم المشروع والنوع" : "Project Name"}</th>
                    <th className="px-4 py-3">{isAr ? "العميل" : "Customer"}</th>
                    <th className="px-4 py-3">{isAr ? "المرحلة التشغيلية" : "Stage"}</th>
                    <th className="px-4 py-3">{isAr ? "القيمة التقديرية" : "Value"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة الصحية" : "Health"}</th>
                    <th className="px-4 py-3">{isAr ? "المسؤول التجاري" : "Sales Owner"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "فتح مساحة العمل" : "Workspace"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold">
                        <Link
                          to="/admin/projects/$id"
                          params={{ id: p.id }}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <span>{p.projectNumber}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground truncate max-w-[200px]">{p.name}</p>
                        <Badge variant="outline" className="text-[10px] py-0 px-1 capitalize mt-0.5">
                          {p.projectType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{p.customerName}</p>
                        {p.customerPhone && (
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {p.customerPhone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={`text-xs capitalize font-medium ${
                            p.status === "won"
                              ? "bg-emerald-600 text-white"
                              : p.status === "lost"
                                ? "bg-rose-600 text-white"
                                : "bg-blue-600 text-white"
                          }`}
                        >
                          {p.stage}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {p.totalValue.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{isAr ? "ج.م." : "EGP"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {getHealthBadge(p.healthSeverity)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {p.salesOwnerName || "—"}
                      </td>
                      <td className="px-4 py-3 text-right rtl:text-left">
                        <Link to="/admin/projects/$id" params={{ id: p.id }}>
                          <Button size="sm" variant="default" className="h-8 gap-1 text-xs">
                            <span>{isAr ? "فتح المشروع" : "Open"}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between text-xs text-muted-foreground">
            <div>
              {isAr
                ? `صفحة ${page} من ${totalPages} (${totalCount} مشروع)`
                : `Page ${page} of ${totalPages} (${totalCount} projects)`}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 px-2"
              >
                {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 px-2"
              >
                {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* New Project Modal */}
      {isNewProjectModalOpen && (
        <OpportunityFormModal
          open={isNewProjectModalOpen}
          onOpenChange={setIsNewProjectModalOpen}
          onSuccess={() => {
            setIsNewProjectModalOpen(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}
