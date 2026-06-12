import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEGP } from "@/lib/pricing";

export const Route = createFileRoute("/admin/quotes/")({ component: QuotesPage });

function QuotesPage() {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('quotes').select('*, customers(name,phone)').order('created_at', { ascending: false })
      .then(({ data }) => setQuotes(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t("quotes.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("quotes.subtitle")}</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("quotes.number")}</TableHead>
                <TableHead>{t("quotes.customer")}</TableHead>
                <TableHead>{t("quotes.total")}</TableHead>
                <TableHead>{t("quotes.status")}</TableHead>
                <TableHead>{t("quotes.validUntil")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("quotes.noQuotes")}</TableCell></TableRow>}
              {quotes.map(q => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs">{q.quote_number}</TableCell>
                  <TableCell>{q.customers?.name}</TableCell>
                  <TableCell className="font-medium">{formatEGP(Number(q.total))}</TableCell>
                  <TableCell><Badge>{q.status}</Badge></TableCell>
                  <TableCell className="text-xs">{q.valid_until}</TableCell>
                  <TableCell><Link to="/admin/quotes/$id" params={{ id: q.id }}><Button size="sm" variant="outline">{t("quotes.details")}</Button></Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}