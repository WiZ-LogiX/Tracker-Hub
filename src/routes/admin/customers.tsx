import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Search, Phone, Mail, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/customers")({ component: CustomersPage });

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  governorate: string | null;
  address: string | null;
  created_at: string;
}

const blankCustomer: Customer = {
  id: '', name: '', phone: '', email: '', governorate: '', address: '', created_at: ''
};

function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Customer>(blankCustomer);

  async function load() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error(error.message);
      return;
    }
    const loaded = (data ?? []) as Customer[];
    setCustomers(loaded);
    setFilteredCustomers(loaded);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const filtered = customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.governorate?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCustomers(filtered);
  }, [searchTerm, customers]);

  function openNew() { 
    setEditing(null); 
    setForm(blankCustomer); 
    setOpen(true); 
  }
  
  function openEdit(c: Customer) { 
    setEditing(c); 
    setForm({ ...c }); 
    setOpen(true); 
  }

  async function save() {
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    if (!form.phone.trim()) return toast.error("رقم الهاتف مطلوب");

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email?.trim() || null,
      governorate: form.governorate?.trim() || null,
      address: form.address?.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast.success("تم تحديث العميل");
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(payload);
        if (error) throw error;
        toast.success("تم إضافة العميل");
      }
      setOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟ سيتم حذف العميل وجميع بياناته.")) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">إدارة العملاء</h1>
          <p className="text-sm text-muted-foreground mt-1">إضافة وتعديل وحذف العملاء</p>
        </div>
        <Button onClick={openNew} className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> عميل جديد
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">قائمة العملاء</CardTitle>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم، الهاتف، الإيميل، المحافظة..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>الإيميل</TableHead>
                <TableHead>المحافظة</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead>تاريخ الإضافة</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "لا توجد نتائج للبحث." : "لا يوجد عملاء بعد. اضغط 'عميل جديد' للبدء."}
                  </TableCell>
                </TableRow>
              )}
              {filteredCustomers.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{c.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.email ? (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{c.email}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.governorate ? (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{c.governorate}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.address ? (
                      <div className="flex items-center gap-1 max-w-xs truncate">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{c.address}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('ar-EG')}
                  </TableCell>
                  <TableCell className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="تعديل">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)} title="حذف">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل العميل" : "إضافة عميل جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الاسم الكامل *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: أحمد محمد علي"
              />
            </div>
            <div>
              <Label>رقم الهاتف *</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="01XXXXXXXXX"
                inputMode="tel"
              />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المحافظة</Label>
                <Input
                  value={form.governorate ?? ''}
                  onChange={e => setForm({ ...form, governorate: e.target.value })}
                  placeholder="القاهرة، الجيزة، الإسكندرية..."
                />
              </div>
            </div>
            <div>
              <Label>العنوان التفصيلي</Label>
              <Input
                value={form.address ?? ''}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="الشارع، رقم المبنى، الحي، المعلم..."
              />
            </div>
            <Button onClick={save} className="w-full">
              {editing ? "حفظ التعديلات" : "إضافة العميل"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}