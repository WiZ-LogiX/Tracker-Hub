import { useTranslation } from "react-i18next";
import { formatEGP } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LeadItem, LeadStatus, LeadSource } from "@/lib/crm-types";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/crm-types";
import {
  Search,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  MoreVertical,
  Plus,
  UserCheck,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";

interface LeadsTableProps {
  leads: LeadItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  onSearchChange: (search: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (source: string) => void;
  onPageChange: (page: number) => void;
  onNewLead: () => void;
  onEditLead: (lead: LeadItem) => void;
  onConvertLead: (lead: LeadItem) => void;
  isLoading?: boolean;
}

export function LeadsTable({
  leads,
  totalCount,
  page,
  pageSize,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sourceFilter,
  onSourceFilterChange,
  onPageChange,
  onNewLead,
  onEditLead,
  onConvertLead,
  isLoading,
}: LeadsTableProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case "new":
        return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200">{isRtl ? "جديد" : "New"}</Badge>;
      case "contacted":
        return <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200">{isRtl ? "تم التواصل" : "Contacted"}</Badge>;
      case "qualified":
        return <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200">{isRtl ? "مؤهل" : "Qualified"}</Badge>;
      case "converted":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200">{isRtl ? "تم التحويل" : "Converted"}</Badge>;
      case "lost":
        return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200">{isRtl ? "مفقود" : "Lost"}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceLabel = (source: LeadSource) => {
    const found = LEAD_SOURCES.find((s) => s.value === source);
    return found ? found.label : source;
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3 rtl:right-3 rtl:left-auto top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={isRtl ? "بحث بالاسم، الهاتف، الرقم..." : "Search name, phone, lead code..."}
              className="pl-9 rtl:pr-9 rtl:pl-3 h-9 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder={isRtl ? "الحالة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRtl ? "كل الحالات" : "All Statuses"}</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={onSourceFilterChange}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder={isRtl ? "المصدر" : "Source"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRtl ? "كل المصادر" : "All Sources"}</SelectItem>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={onNewLead} size="sm" className="h-9 gap-1.5 text-xs font-semibold">
          <Plus className="h-3.5 w-3.5" />
          <span>{isRtl ? "إضافة عميل محتمل" : "New Lead"}</span>
        </Button>
      </div>

      {/* Leads Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="font-semibold">{isRtl ? "الرمز" : "Code"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "الاسم ومعلومات الاتصال" : "Lead & Contact"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "المصدر" : "Source"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "المنتج والميزانية" : "Product & Budget"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "الحالة" : "Status"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "الخطوة التالية" : "Next Action"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "المسؤول" : "Owner"}</TableHead>
              <TableHead className="text-end font-semibold">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center text-xs text-muted-foreground">
                  {isRtl ? "لا توجد نتائج مطابقة" : "No leads found."}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const isConverted = lead.status === "converted";
                const hasNextAction = Boolean(lead.nextAction && lead.nextAction.trim());

                return (
                  <TableRow key={lead.id} className="text-xs hover:bg-muted/30 transition-colors">
                    {/* Code */}
                    <TableCell className="font-mono font-bold text-primary">
                      {lead.leadNumber}
                    </TableCell>

                    {/* Name & Contact */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-semibold text-foreground">{lead.name}</div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {lead.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span>{lead.phone}</span>
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span>{lead.email}</span>
                            </span>
                          )}
                          {lead.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span>{lead.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Source */}
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {getSourceLabel(lead.source)}
                      </Badge>
                    </TableCell>

                    {/* Product & Budget */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-foreground">{lead.interestedProduct || "—"}</div>
                        {lead.estimatedBudget ? (
                          <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                            {formatEGP(lead.estimatedBudget)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">{isRtl ? "غير محدد" : "Unspecified"}</div>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>

                    {/* Next Action */}
                    <TableCell>
                      {!hasNextAction ? (
                        <span className="text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-1 font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          <span>{isRtl ? "لا توجد خطوة" : "No action"}</span>
                        </span>
                      ) : (
                        <div className="space-y-0.5 text-[11px]">
                          <span className="text-foreground font-medium">{lead.nextAction}</span>
                          {lead.nextActionDate && (
                            <div className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(lead.nextActionDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Sales Owner */}
                    <TableCell className="text-muted-foreground text-[11px]">
                      {lead.assignedSalespersonName || "—"}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Quick WhatsApp button */}
                        {lead.phone && (
                          <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex"
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}

                        {/* Convert Lead Action */}
                        {!isConverted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onConvertLead(lead)}
                            className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10 font-semibold"
                          >
                            <UserCheck className="h-3 w-3" />
                            <span>{isRtl ? "تحويل لصفقة" : "Convert"}</span>
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onClick={() => onEditLead(lead)}>
                              {isRtl ? "تعديل البيانات" : "Edit Details"}
                            </DropdownMenuItem>
                            {!isConverted && (
                              <DropdownMenuItem onClick={() => onConvertLead(lead)}>
                                {isRtl ? "تحويل إلى عميل وفرصة بيعية" : "Convert to Deal & Customer"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {isRtl
              ? `عرض صفحة ${page} من إجمالي ${totalPages} (${totalCount} عميل محتمل)`
              : `Page ${page} of ${totalPages} (${totalCount} total leads)`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-7 text-xs"
            >
              {isRtl ? "السابق" : "Previous"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-7 text-xs"
            >
              {isRtl ? "التالي" : "Next"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
