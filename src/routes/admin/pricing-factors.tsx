import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";
import { listTenantPricingFactors } from "@/lib/pricing-levers.functions";
import {
  createCatalogPricingFactor,
  updateCatalogPricingFactor,
  archiveCatalogPricingFactor,
} from "@/lib/catalog.functions";

const FACTOR_KEYS = [
  "labor",
  "overhead",
  "complexity",
  "rush",
  "margin",
  "luxury",
  "packaging",
  "site_visit",
  "transport",
] as const;

type FactorKey = (typeof FACTOR_KEYS)[number];

interface FactorRow {
  id: string;
  factor_key: string;
  value_type: string;
  percent: number;
  fixed_amount: number;
  archived_at: string | null;
}

function PricingFactorsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FactorRow | null>(null);
  const [formKey, setFormKey] = useState<FactorKey>("labor");
  const [formValueType, setFormValueType] = useState<"percent" | "fixed">("percent");
  const [formPercent, setFormPercent] = useState(15);
  const [formFixedAmount, setFormFixedAmount] = useState(0);

  const { data: factors = [], isLoading } = useQuery({
    queryKey: ["tenantPricingFactors"],
    queryFn: async () => {
      const result = await listTenantPricingFactors({ data: {} });
      return result as FactorRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: { factorKey: string; valueType: string; percent: number; fixedAmount: number }) =>
      createCatalogPricingFactor({
        data: {
          factorKey: input.factorKey as any,
          valueType: input.valueType as any,
          percent: input.percent,
          fixedAmount: input.fixedAmount,
        },
      }),
    onSuccess: () => {
      toast.success(t("pricingFactors.created", "Factor created"));
      queryClient.invalidateQueries({ queryKey: ["tenantPricingFactors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; valueType: string; percent: number; fixedAmount: number }) =>
      updateCatalogPricingFactor({
        data: {
          id: input.id,
          valueType: input.valueType as any,
          percent: input.percent,
          fixedAmount: input.fixedAmount,
        },
      }),
    onSuccess: () => {
      toast.success(t("pricingFactors.updated", "Factor updated"));
      queryClient.invalidateQueries({ queryKey: ["tenantPricingFactors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { id: string }) =>
      archiveCatalogPricingFactor({ data: input }),
    onSuccess: () => {
      toast.success(t("pricingFactors.archived", "Factor archived"));
      queryClient.invalidateQueries({ queryKey: ["tenantPricingFactors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const existingKeys = new Set(factors.map((f) => f.factor_key));
  const availableKeys = FACTOR_KEYS.filter((k) => !existingKeys.has(k));

  function openNew() {
    setEditing(null);
    setFormKey(availableKeys[0] ?? "labor");
    setFormValueType("percent");
    setFormPercent(0);
    setFormFixedAmount(0);
    setDialogOpen(true);
  }

  function openEdit(row: FactorRow) {
    setEditing(row);
    setFormKey(row.factor_key as FactorKey);
    setFormValueType((row.value_type as "percent" | "fixed") ?? "percent");
    setFormPercent(Number(row.percent));
    setFormFixedAmount(Number(row.fixed_amount));
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const payload = {
        valueType: formValueType,
        percent: formValueType === "percent" ? formPercent : 0,
        fixedAmount: formValueType === "fixed" ? formFixedAmount : 0,
      };
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createMutation.mutateAsync({ factorKey: formKey, ...payload });
      }
      setDialogOpen(false);
    } catch {
      // toast handled by mutation onError
    }
  }

  function handleArchive(row: FactorRow) {
    if (!confirm(t("pricingFactors.confirmArchive", "Archive this factor?")))
      return;
    archiveMutation.mutateAsync({ id: row.id });
  }

  const factorLabel = (key: string) => t(`breakdown.factor.${key}`, key);
  const factorDescription = (key: string) => t(`pricingFactors.desc.${key}`, "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {t("pricingFactors.title", "Pricing Factors")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t(
            "pricingFactors.subtitle",
            "Configure tenant-wide pricing factor percentages applied to every quotation unit.",
          )}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Badge variant="outline">{factors.length}</Badge>
              {t("pricingFactors.title", "Pricing Factors")}
            </CardTitle>
            <CardDescription>
              {t(
                "pricingFactors.description",
                "Each factor can be a percentage of base cost or a fixed EGP amount. Per-unit overrides in the quotation builder always use percentages.",
              )}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew} className="gap-1">
            <Plus className="h-3 w-3" /> {t("pricingFactors.add", "Add Factor")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : factors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "pricingFactors.empty",
                'No pricing factors configured. Click "Add Factor" to create one.',
              )}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pricingFactors.factor", "Factor")}</TableHead>
                  <TableHead>
                    {t("pricingFactors.description", "Description")}
                  </TableHead>
                  <TableHead className="text-center w-24">
                    {t("pricingFactors.type", "Type")}
                  </TableHead>
                  <TableHead className="text-right w-32">
                    {t("pricingFactors.value", "Value")}
                  </TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {factors.map((row) => {
                  const isFixed = row.value_type === "fixed";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {factorLabel(row.factor_key)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {factorDescription(row.factor_key)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={isFixed ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}
                        >
                          {isFixed ? "EGP" : "%"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-sm font-medium">
                          {isFixed
                            ? formatEGP(Number(row.fixed_amount))
                            : `${Number(row.percent)}%`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleArchive(row)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("pricingFactors.editTitle", "Edit Pricing Factor")
                : t("pricingFactors.addTitle", "Add Pricing Factor")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("pricingFactors.factor", "Factor")}</Label>
              {editing ? (
                <Input
                  value={factorLabel(editing.factor_key)}
                  disabled
                  className="bg-muted"
                />
              ) : (
                <Select
                  value={formKey}
                  onValueChange={(v) => setFormKey(v as FactorKey)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACTOR_KEYS.map((k) => (
                      <SelectItem
                        key={k}
                        value={k}
                        disabled={existingKeys.has(k)}
                      >
                        {factorLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("pricingFactors.valueType", "Value Type")}</Label>
              <Select
                value={formValueType}
                onValueChange={(v) => setFormValueType(v as "percent" | "fixed")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">
                    {t("pricingFactors.typePercent", "Percentage (%)")}
                  </SelectItem>
                  <SelectItem value="fixed">
                    {t("pricingFactors.typeFixed", "Fixed Amount (EGP)")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formValueType === "percent" ? (
              <div className="space-y-2">
                <Label>{t("pricingFactors.percent", "Percent %")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={formPercent}
                  onChange={(e) =>
                    setFormPercent(parseFloat(e.target.value) || 0)
                  }
                  className="w-32"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t("pricingFactors.fixedAmount", "Fixed Amount (EGP)")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formFixedAmount}
                  onChange={(e) =>
                    setFormFixedAmount(parseFloat(e.target.value) || 0)
                  }
                  className="w-48"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleSave}>
              {editing
                ? t("common.save", "Save")
                : t("pricingFactors.create", "Create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/pricing-factors")({
  beforeLoad: () => {
    // Obsolete pricing section has been removed from admin navigation.
    // Redirect direct/bookmarked visits to /admin.
    throw redirect({ to: "/admin", replace: true });
  },
  component: () => null,
});
