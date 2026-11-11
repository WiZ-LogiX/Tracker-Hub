import React, { useState, useEffect } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { getProjectWorkspaceData } from "@/lib/project.functions";
import type { ProjectWorkspaceData } from "@/lib/project-types";
import type { InvoiceItem } from "@/lib/invoice-types";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { ProjectLifecycleStepper } from "@/components/projects/ProjectLifecycleStepper";
import { ProjectOverviewTab } from "@/components/projects/ProjectOverviewTab";
import { ProjectCommercialTab } from "@/components/projects/ProjectCommercialTab";
import { ProjectProductionTab } from "@/components/projects/ProjectProductionTab";
import { ProjectTasksTab } from "@/components/projects/ProjectTasksTab";
import { ProjectInventoryTab } from "@/components/projects/ProjectInventoryTab";
import { ProjectDeliveryTab } from "@/components/projects/ProjectDeliveryTab";
import { ProjectFinancialsTab } from "@/components/projects/ProjectFinancialsTab";
import { ProjectQualityTab } from "@/components/projects/ProjectQualityTab";
import { ProjectDocumentsTab } from "@/components/projects/ProjectDocumentsTab";
import { ProjectTimelineTab } from "@/components/projects/ProjectTimelineTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskForm } from "@/components/tasks/TaskForm";
import { RecordPaymentModal } from "@/components/invoices/RecordPaymentModal";
import { CreateRemakeModal } from "@/components/remakes/CreateRemakeModal";
import { Customer360Drawer } from "@/components/customers/Customer360Drawer";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  FolderKanban,
  FileText,
  Package,
  CheckSquare,
  Boxes,
  Truck,
  DollarSign,
  ShieldCheck,
  Folder,
  History,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/projects/$id")({
  component: ProjectWorkspacePage,
});

function ProjectWorkspacePage() {
  const { id: projectId } = useParams({ from: "/admin/projects/$id" });
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getWorkspaceFn = useServerFn(getProjectWorkspaceData);

  const [data, setData] = useState<ProjectWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceItem | null>(null);
  const [isRemakeModalOpen, setIsRemakeModalOpen] = useState(false);
  const [customer360Id, setCustomer360Id] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceFn({ data: { projectId } });
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل تحميل بيانات المشروع" : "Failed to load project workspace"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleOpenRecordPayment = (invoiceId?: string) => {
    if (!data) return;
    const inv = invoiceId
      ? data.financials.invoices.find((i) => i.id === invoiceId)
      : data.financials.invoices.find((i) => i.balanceDue > 0) || data.financials.invoices[0];

    if (inv) {
      setSelectedInvoiceForPayment({
        id: inv.id,
        tenantId: "",
        invoiceNumber: inv.invoiceNumber,
        quoteId: "",
        orderId: inv.orderId || null,
        customerId: data.header.customerId,
        total: inv.total,
        depositAmount: 0,
        paidAmount: inv.paidAmount,
        balanceDue: inv.balanceDue,
        status: (inv.status === "paid" ? "paid" : inv.status === "partially_paid" ? "partially_paid" : "unpaid") as "unpaid" | "partially_paid" | "paid" | "overdue",
        issuedAt: new Date(inv.issueDate),
        paymentCount: 0,
      });
      setIsPaymentModalOpen(true);
    } else {
      toast.info(isAr ? "لا توجد فواتير مفتوحة للسداد" : "No open invoices for payment");
    }
  };

  if (loading && !data) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-6 gap-4">
          <Skeleton className="h-10 col-span-6" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <FolderKanban className="w-12 h-12 text-muted-foreground/40 mx-auto" />
        <h2 className="text-lg font-bold">{isAr ? "المشروع غير موجود" : "Project Not Found"}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لم يتم العثور على بيانات المشروع المحدد، قد يكون تم حذفه أو ليس لديك صلاحية الوصول إليه."
            : "The requested project could not be found or you do not have permission to view it."}
        </p>
        <Link to="/admin/projects">
          <Button variant="outline" className="gap-2">
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? "العودة لقائمة المشاريع" : "Back to Projects"}</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Nav & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/projects">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{isAr ? "المشاريع" : "Projects"}</span>
            </Button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-xs font-mono font-semibold text-foreground">
            {data.header.projectNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{isAr ? "تحديث" : "Refresh"}</span>
          </Button>
        </div>
      </div>

      {/* Project Header */}
      <ProjectHeader
        header={data.header}
        onOpenCustomer360={(custId) => setCustomer360Id(custId)}
      />

      {/* 13-Stage Project Lifecycle Stepper */}
      <ProjectLifecycleStepper steps={data.header.lifecycle} />

      {/* 10 Workspace Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-10 p-1 bg-muted/60 inline-flex min-w-[900px] sm:min-w-0">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>{isAr ? "نظرة عامة" : "Overview"}</span>
            </TabsTrigger>
            <TabsTrigger value="commercial" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              <span>{isAr ? "التجاري والأسعار" : "Commercial"}</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-1.5 text-xs">
              <Package className="w-3.5 h-3.5" />
              <span>{isAr ? "خط التصنيع" : "Production"}</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5 text-xs">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isAr ? "المهام" : "Tasks"}</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5 text-xs">
              <Boxes className="w-3.5 h-3.5" />
              <span>{isAr ? "المخزون" : "Inventory"}</span>
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-1.5 text-xs">
              <Truck className="w-3.5 h-3.5" />
              <span>{isAr ? "التوريد والتركيب" : "Delivery"}</span>
            </TabsTrigger>
            <TabsTrigger value="financials" className="gap-1.5 text-xs">
              <DollarSign className="w-3.5 h-3.5" />
              <span>{isAr ? "المالية" : "Financials"}</span>
            </TabsTrigger>
            <TabsTrigger value="quality" className="gap-1.5 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isAr ? "الجودة" : "Quality"}</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs">
              <Folder className="w-3.5 h-3.5" />
              <span>{isAr ? "المستندات" : "Documents"}</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5 text-xs">
              <History className="w-3.5 h-3.5" />
              <span>{isAr ? "الجدول الزمني" : "Timeline"}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Contents */}
        <TabsContent value="overview">
          <ProjectOverviewTab
            data={data}
            onOpenCreateTask={() => setIsTaskModalOpen(true)}
            onOpenRecordPayment={() => handleOpenRecordPayment()}
            onOpenCreateRemake={() => setIsRemakeModalOpen(true)}
          />
        </TabsContent>

        <TabsContent value="commercial">
          <ProjectCommercialTab
            commercial={data.commercial}
            customerId={data.header.customerId}
            projectId={data.header.projectId}
          />
        </TabsContent>

        <TabsContent value="production">
          <ProjectProductionTab
            production={data.production}
            orders={data.orders}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <ProjectTasksTab
            tasks={data.tasks}
            onOpenCreateTask={() => setIsTaskModalOpen(true)}
          />
        </TabsContent>

        <TabsContent value="inventory">
          <ProjectInventoryTab
            inventory={data.inventory}
          />
        </TabsContent>

        <TabsContent value="delivery">
          <ProjectDeliveryTab
            delivery={data.delivery}
          />
        </TabsContent>

        <TabsContent value="financials">
          <ProjectFinancialsTab
            financials={data.financials}
            onOpenRecordPayment={(invId) => handleOpenRecordPayment(invId)}
            currentUserRole={data.currentUserRole}
          />
        </TabsContent>

        <TabsContent value="quality">
          <ProjectQualityTab
            quality={data.quality}
            onOpenCreateRemake={() => setIsRemakeModalOpen(true)}
          />
        </TabsContent>

        <TabsContent value="documents">
          <ProjectDocumentsTab
            projectId={data.header.projectId}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <ProjectTimelineTab
            timeline={data.timeline}
          />
        </TabsContent>
      </Tabs>

      {/* Sub-Modals */}
      {isTaskModalOpen && (
        <TaskForm
          open={isTaskModalOpen}
          onOpenChange={setIsTaskModalOpen}
          defaultCustomerId={data.header.customerId}
          defaultOrderId={data.orders[0]?.id}
          onTaskCreated={() => {
            setIsTaskModalOpen(false);
            loadData();
          }}
        />
      )}

      {isPaymentModalOpen && selectedInvoiceForPayment && (
        <RecordPaymentModal
          open={isPaymentModalOpen}
          onOpenChange={setIsPaymentModalOpen}
          invoice={selectedInvoiceForPayment}
          onPaymentRecorded={() => {
            setIsPaymentModalOpen(false);
            loadData();
          }}
        />
      )}

      {isRemakeModalOpen && (
        <CreateRemakeModal
          open={isRemakeModalOpen}
          onOpenChange={setIsRemakeModalOpen}
          customerId={data.header.customerId}
          orderId={data.orders[0]?.id}
          ordersList={data.orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))}
          onCreated={() => {
            setIsRemakeModalOpen(false);
            loadData();
          }}
        />
      )}

      {customer360Id && (
        <Customer360Drawer
          customerId={customer360Id}
          open={!!customer360Id}
          onOpenChange={(open) => !open && setCustomer360Id(null)}
          userRole={data.currentUserRole}
        />
      )}
    </div>
  );
}
