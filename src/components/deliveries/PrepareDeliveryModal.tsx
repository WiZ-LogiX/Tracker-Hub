import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { createDelivery } from "@/lib/delivery.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PrepareDeliveryModalProps {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (deliveryId: string) => void;
}

export function PrepareDeliveryModal({
  orderId,
  orderNumber,
  customerName,
  customerPhone,
  open,
  onOpenChange,
  onCreated,
}: PrepareDeliveryModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const createDeliveryFn = useServerFn(createDelivery);

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [recipientName, setRecipientName] = useState(customerName || "");
  const [recipientPhone, setRecipientPhone] = useState(customerPhone || "");
  const [scheduledDate, setScheduledDate] = useState("");
  const [installationRequired, setInstallationRequired] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryAddress.trim()) {
      toast.error(isRtl ? "يرجى إدخال عنوان التوصيل" : "Delivery address is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createDeliveryFn({
        data: {
          orderId,
          deliveryAddress: deliveryAddress.trim(),
          recipientName: recipientName.trim() || undefined,
          recipientPhone: recipientPhone.trim() || undefined,
          scheduledDate: scheduledDate || undefined,
          installationRequired,
          customerNotes: customerNotes.trim() || undefined,
        },
      });

      toast.success(
        isRtl
          ? `تم تجهيز إذن التوصيل بنجاح (${res.deliveryNumber})`
          : `Delivery record prepared successfully (${res.deliveryNumber})`,
      );
      onOpenChange(false);
      onCreated?.(res.deliveryId);
    } catch (err: any) {
      toast.error(err?.message || "Failed to prepare delivery");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span>{isRtl ? "تجهيز الشحن والتسليم للعميل" : "Prepare Delivery & Handover"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {orderNumber && (
            <div className="p-3 bg-muted/40 rounded-xl border text-xs flex items-center justify-between">
              <span className="text-muted-foreground">{isRtl ? "أمر البيع:" : "Linked Order:"}</span>
              <span className="font-mono font-bold text-foreground">{orderNumber}</span>
            </div>
          )}

          {/* Delivery Address */}
          <div className="space-y-1.5">
            <Label htmlFor="del-address" className="text-xs font-semibold">
              {isRtl ? "عنوان التوصيل وموقع التركيب *" : "Delivery / Installation Address *"}
            </Label>
            <Textarea
              id="del-address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder={isRtl ? "الشارع، رقم المبنى، الشقة، المنطقة..." : "Street, Building, Area..."}
              required
              className="text-xs min-h-[60px]"
            />
          </div>

          {/* Recipient Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "اسم المستلم" : "Recipient Name"}</Label>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={customerName || ""}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "رقم الهاتف للتواصل" : "Phone"}</Label>
              <Input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder={customerPhone || ""}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Scheduled Date */}
          <div className="space-y-1.5">
            <Label htmlFor="del-sched-date" className="text-xs font-semibold">
              {isRtl ? "تاريخ التوصيل المجدول" : "Scheduled Delivery Date"}
            </Label>
            <Input
              id="del-sched-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Installation Required Checkbox */}
          <div className="flex items-center gap-2 p-3 bg-muted/20 border rounded-xl">
            <input
              type="checkbox"
              id="inst-req"
              checked={installationRequired}
              onChange={(e) => setInstallationRequired(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="inst-req" className="text-xs cursor-pointer">
              {isRtl ? "هذا الطلب يتطلب فنيين لتركيبه بموقع العميل" : "Installation required on site"}
            </Label>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isRtl ? "ملاحظات التوصيل" : "Delivery Notes"}</Label>
            <Textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder={isRtl ? "تعليمات خاصة للسائق أو فريق التركيب..." : "Special instructions for delivery..."}
              className="text-xs min-h-[50px]"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs h-9"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !deliveryAddress.trim()}
              className="text-xs h-9 bg-primary text-primary-foreground font-semibold"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 rtl:mr-0 rtl:ml-1.5" />}
              <span>{isRtl ? "تجهيز إذن التوصيل" : "Prepare Delivery"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
