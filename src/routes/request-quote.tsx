import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/request-quote")({ component: RFQPage });

interface Category { id: string; name_ar: string; }

function RFQPage() {
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitted, setSubmitted] = useState<{ ref: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    category: '',
    width: '', height: '', depth: '', count: '',
    shape: '', material: '', notes: '', budget: '',
    name: '', phone: '', email: '', governorate: '', address: '',
  });

  useEffect(() => {
    supabase.from('categories').select('id,name_ar').then(({ data }) => setCategories((data ?? []) as Category[]));
  }, []);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit() {
    setLoading(true);
    const { data: cust, error: cErr } = await supabase.from('customers').insert({
      name: form.name, phone: form.phone, email: form.email || null,
      address: form.address || null, governorate: form.governorate || null,
    }).select('id').single();

    if (cErr) { setLoading(false); return toast.error(cErr.message); }

    const { data: rfq, error: rErr } = await supabase.from('quote_requests').insert({
      customer_id: cust!.id,
      customer_name: form.name, customer_phone: form.phone, customer_email: form.email || null,
      governorate: form.governorate || null,
      product_category: form.category,
      specs: {
        width: form.width, height: form.height, depth: form.depth, count: form.count,
        shape: form.shape, material: form.material,
      },
      notes: form.notes || null,
      budget_range: form.budget || null,
    }).select('reference_number').single();

    setLoading(false);
    if (rErr) return toast.error(rErr.message);
    setSubmitted({ ref: rfq!.reference_number });
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-secondary mx-auto mb-4" />
            <h1 className="font-serif text-2xl font-bold mb-2">استلمنا طلبك!</h1>
            <p className="text-muted-foreground mb-4">رقم المرجع</p>
            <div className="font-mono text-xl font-bold text-primary bg-muted rounded-lg py-3 mb-6">{submitted.ref}</div>
            <p className="text-sm text-muted-foreground mb-6">فريقنا هيتواصل معاك خلال 24-48 ساعة.</p>
            <Link to="/"><Button variant="outline">العودة للرئيسية</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowRight className="h-4 w-4 rtl-flip" /> رجوع
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">اطلب عرض سعر</CardTitle>
            <div className="flex gap-2 mt-4">
              {[1,2,3].map(n => (
                <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">الخطوة {step} من 3</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <div>
                  <Label>نوع المنتج *</Label>
                  <Select value={form.category} onValueChange={v => update('category', v)}>
                    <SelectTrigger><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.name_ar}>{c.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>العرض (سم)</Label><Input type="number" value={form.width} onChange={e => update('width', e.target.value)} /></div>
                  <div><Label>الارتفاع (سم)</Label><Input type="number" value={form.height} onChange={e => update('height', e.target.value)} /></div>
                  <div><Label>العمق (سم)</Label><Input type="number" value={form.depth} onChange={e => update('depth', e.target.value)} /></div>
                  <div><Label>العدد</Label><Input type="number" value={form.count} onChange={e => update('count', e.target.value)} /></div>
                </div>
                <div><Label>الشكل / التصميم</Label><Input placeholder="L / U / مستقيم..." value={form.shape} onChange={e => update('shape', e.target.value)} /></div>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setStep(2)} disabled={!form.category} className="gap-2">
                    التالي <ArrowLeft className="h-4 w-4 rtl-flip" />
                  </Button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div><Label>الخامة المفضلة</Label><Input placeholder="MDF / خشب زان / HPL..." value={form.material} onChange={e => update('material', e.target.value)} /></div>
                <div>
                  <Label>الميزانية التقديرية</Label>
                  <Select value={form.budget} onValueChange={v => update('budget', v)}>
                    <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="< 20000">أقل من 20,000 ج.م</SelectItem>
                      <SelectItem value="20000-50000">20,000 - 50,000 ج.م</SelectItem>
                      <SelectItem value="50000-100000">50,000 - 100,000 ج.م</SelectItem>
                      <SelectItem value="> 100000">أكثر من 100,000 ج.م</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>ملاحظات إضافية</Label><Textarea rows={4} value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="أي تفاصيل أو متطلبات خاصة..." /></div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(1)}>رجوع</Button>
                  <Button onClick={() => setStep(3)} className="gap-2">التالي <ArrowLeft className="h-4 w-4 rtl-flip" /></Button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div><Label>الاسم الكامل *</Label><Input value={form.name} onChange={e => update('name', e.target.value)} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>رقم الموبايل *</Label><Input value={form.phone} onChange={e => update('phone', e.target.value)} required /></div>
                  <div><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={e => update('email', e.target.value)} /></div>
                </div>
                <div><Label>المحافظة</Label><Input value={form.governorate} onChange={e => update('governorate', e.target.value)} /></div>
                <div><Label>العنوان</Label><Textarea rows={2} value={form.address} onChange={e => update('address', e.target.value)} /></div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(2)}>رجوع</Button>
                  <Button onClick={submit} disabled={loading || !form.name || !form.phone}>
                    {loading ? "جارٍ الإرسال..." : "إرسال الطلب"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
