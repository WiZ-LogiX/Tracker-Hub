const [stats, setStats] = useState({
    customers: 0,
    quotes: 0,
    orders: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const restorePricing = useServerFn(ensurePricingSetup);

  async function loadStats() {
    const [c, q, o] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("quotes").select("total"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
    ]);
    const revenue = (q.data ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    setStats({
      customers: c.count ?? 0,
      quotes: q.data?.length ?? 0,
      orders: o.count ?? 0,
      revenue,
    });
    setLoading(false);
  }

  async function deleteTransientData() {
    if (!confirm("هل أنت متأكد من حذف عروض الأسعار والفواتير وأوامر الإنتاج فقط؟\nسيتم الاحتفاظ بقوالب المنتجات والخامات والموردين والتشطيبات والقشرة والإكسسوارات وعوامل التسعير وقواعد الهدر والخصومات والعمال.")) return;
    setDeleting(true);
    try {
      const tables = [
        'production_photos',
        'production_logs',
        'production_assignments',
        'qc_inspections',
        'remakes',
        'orders',
        'invoices',
        'quote_items',
        'configurations',
        'quotes',
      ];
      
      let deleted = 0;
      for (const table of tables) {
        const { error, count } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (!error) deleted += count ?? 0;
      }
      
      toast.success(`تم حذف ${deleted} سجل (عروض أسعار، فواتير، أوامر إنتاج فقط)`);
      setStats({ ...stats, quotes: 0, orders: 0, revenue: 0 });
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  async function restorePricingData() {
    try {
      const r = await restorePricing();
      toast.success("تم استعادة عوامل وقواعد التسعير");
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الاستعادة");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("admin.panel")}</h1>
          <p className="text-sm text-muted-foreground mt-1">مرحباً {user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={deleteTransientData} 
            disabled={deleting}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "جارٍ الحذف..." : "حذف البيانات المؤقتة"}
          </Button>
        </div>
      </div>