import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { recordInvoicePayment } from "@/lib/invoice-payment.functions";
import type { InvoiceItem, PaymentMethod } from "@/lib/invoice-types";
import { formatEGP } from "@/lib/pricing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CreditCard, Banknote, Building, Landmark, Receipt } from "lucide-react";

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceItem | null;
  onPaymentRecorded: () => void;
}

export function RecordPaymentModal({
  open,
  onOpenChange,
  invoice,
  onPaymentRecorded,
}: RecordPaymentModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const recordPaymentFn = useServerFn(recordInvoicePayment);

  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("instapay");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Set default amount to remaining balance when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && invoice) {
      setAmount(String(invoice.balanceDue));
      setReferenceNumber("");
      setNotes("");
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(isRtl ? "يرجى إدخال مبلغ صحيح" : "Please enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      await recordPaymentFn({
        data: {
          invoiceId: invoice.id,
          amount: numAmount,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });

      toast.success(
        isRtl
          ? `تم تسجيل الدفعة بنجاح (${formatEGP(numAmount)})`
          : `Payment of ${formatEGP(numAmount)} recorded successfully`,
      );
      onPaymentRecorded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تسجيل الدفعة" : "Failed to record payment"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <span>{isRtl ? "تسجيل دفعة جديدة" : "Record Invoice Payment"}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Invoice Summary Card */}
        <div className="bg-muted/40 p-3.5 rounded-xl border space-y-2 text-xs">
          <div className="flex justify-between items-center font-mono">
            <span className="text-muted-foreground">{isRtl ? "رقم الفاتورة:" : "Invoice #:"}</span>
            <span className="font-bold text-foreground">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{isRtl ? "إجمالي الفاتورة:" : "Total Amount:"}</span>
            <span className="font-semibold">{formatEGP(invoice.total)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{isRtl ? "المدفوع حتى الآن:" : "Paid to Date:"}</span>
            <span className="text-emerald-600 font-semibold">{formatEGP(invoice.paidAmount)}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-border/80">
            <span className="font-bold text-foreground">{isRtl ? "المتبقي للاستحقاق:" : "Balance Due:"}</span>
            <span className="font-bold text-base text-primary">{formatEGP(invoice.balanceDue)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-xs font-semibold">
              {isRtl ? "المبلغ المدفوع (ج.م) *" : "Payment Amount (EGP) *"}
            </Label>
            <Input
              id="pay-amount"
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className="text-base font-bold font-mono h-10 rounded-lg"
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isRtl ? "طريقة الدفع" : "Payment Method"}
            </Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-9 text-sm rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instapay">{isRtl ? "انستاباي (InstaPay)" : "InstaPay"}</SelectItem>
                <SelectItem value="bank_transfer">{isRtl ? "تحويل بنكي" : "Bank Transfer"}</SelectItem>
                <SelectItem value="cash">{isRtl ? "نقداً (كاش)" : "Cash"}</SelectItem>
                <SelectItem value="cheque">{isRtl ? "شيك بنكي" : "Cheque"}</SelectItem>
                <SelectItem value="card">{isRtl ? "بطاقة ائتمان / POS" : "Credit Card / POS"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference / Transaction ID */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref" className="text-xs">
              {isRtl ? "رقم العملية / الشيك (اختياري)" : "Reference / Cheque # (Optional)"}
            </Label>
            <Input
              id="pay-ref"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={isRtl ? "مثال: TXN-94827104" : "e.g., TXN-94827104"}
              className="text-sm rounded-lg"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes" className="text-xs">
              {isRtl ? "ملاحظات الدفعة" : "Notes"}
            </Label>
            <Textarea
              id="pay-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRtl ? "دفعة حجز 50% / دفعة استلام خشب..." : "Deposit / milestone details..."}
              rows={2}
              className="text-sm rounded-lg"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground font-semibold">
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2 rtl:ml-2 rtl:mr-0" />}
              <span>{isRtl ? "تأكيد الدفعة وإصدار الإيصال" : "Confirm Payment"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
