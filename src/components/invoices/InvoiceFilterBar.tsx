import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Receipt, DollarSign, Wallet } from "lucide-react";
import { formatEGP } from "@/lib/pricing";

interface InvoiceFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
}

export function InvoiceFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  totalInvoiced,
  totalPaid,
  totalOutstanding,
}: InvoiceFilterBarProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  return (
    <div className="space-y-3">
      {/* Top Financial Stat Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border rounded-xl p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">
              {isRtl ? "إجمالي الفواتير" : "Total Invoiced"}
            </span>
            <div className="font-bold text-lg text-foreground">{formatEGP(totalInvoiced)}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Receipt className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold text-emerald-600">
              {isRtl ? "إجمالي المحصل" : "Total Collected"}
            </span>
            <div className="font-bold text-lg text-emerald-600">{formatEGP(totalPaid)}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Wallet className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold text-primary">
              {isRtl ? "المستحقات المتبقية" : "Total Outstanding"}
            </span>
            <div className="font-bold text-lg text-primary">{formatEGP(totalOutstanding)}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 sm:max-w-sm w-full">
          <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isRtl ? "بحث برقم الفاتورة أو اسم العميل..." : "Search invoice # or customer..."}
            className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
          />
        </div>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm rounded-lg">
            <SelectValue placeholder={isRtl ? "حالة السداد" : "Status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRtl ? "كل الحالات" : "All Statuses"}</SelectItem>
            <SelectItem value="unpaid">{isRtl ? "غير مدفوعة" : "Unpaid"}</SelectItem>
            <SelectItem value="partially_paid">{isRtl ? "مدفوعة جزئياً" : "Partially Paid"}</SelectItem>
            <SelectItem value="paid">{isRtl ? "مدفوعة بالكامل" : "Paid"}</SelectItem>
            <SelectItem value="overdue">{isRtl ? "متأخرة" : "Overdue"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
