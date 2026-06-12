async function deleteTransientData() {
    if (!confirm(t("dashboard.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const tables = [
        'production_photos', 'production_logs', 'production_assignments',
        'qc_inspections', 'remakes', 'orders', 'invoices',
        'quote_items', 'configurations', 'quotes',
      ];
      let deleted = 0;
      for (const table of tables) {
        const { error, count } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (!error) deleted += count ?? 0;
      }
      toast.success(t("dashboard.deleted", { count: deleted }));
      setStats({ ...stats, quotes: 0, orders: 0, revenue: 0 });
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }