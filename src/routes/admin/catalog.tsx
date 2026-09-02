import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Package } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";
import {
  createCatalogMaterial, updateCatalogMaterial, archiveCatalogMaterial,
  createCatalogFinish, updateCatalogFinish, archiveCatalogFinish,
  createCatalogVeneer, updateCatalogVeneer, archiveCatalogVeneer,
  createCatalogHardware, updateCatalogHardware, archiveCatalogHardware,
  createCatalogAccessory, updateCatalogAccessory, archiveCatalogAccessory,
  createCatalogManufacturingOp, updateCatalogManufacturingOp, archiveCatalogManufacturingOp,
  createCatalogEdgeBand, updateCatalogEdgeBand, archiveCatalogEdgeBand,
} from "@/lib/catalog.functions";
import {
  listMaterials, listFinishes, listVeneers,
  listHardware, listAccessories, listManufacturingOperations,
  listEdgeBands,
} from "@/lib/catalog-v2.functions";

export const Route = createFileRoute("/admin/catalog")({ component: CatalogPage });

type CatalogKind = "materials" | "finishes" | "veneers" | "edge_bands" | "hardware" | "accessories" | "manufacturing";

interface CatalogItem {
  id: string;
  code: string;
  price?: number;
  [key: string]: unknown;
}

const KIND_CONFIG: Record<CatalogKind, { label: string; color: string; priceField: string; priceLabel: string; unitLabel: string }> = {
  materials: { label: "Materials", color: "bg-blue-100 text-blue-800", priceField: "price_per_unit", priceLabel: "Price/m²", unitLabel: "/ m²" },
  finishes: { label: "Finishes", color: "bg-indigo-100 text-indigo-800", priceField: "price_per_unit", priceLabel: "Price/m²", unitLabel: "/ m²" },
  veneers: { label: "Veneers", color: "bg-teal-100 text-teal-800", priceField: "price_per_m2", priceLabel: "Price/m²", unitLabel: "/ m²" },
  edge_bands: { label: "Edge Bands", color: "bg-rose-100 text-rose-800", priceField: "price_per_unit", priceLabel: "Price/m", unitLabel: "/ m" },
  hardware: { label: "Hardware", color: "bg-amber-100 text-amber-800", priceField: "price_per_piece", priceLabel: "Price/pc", unitLabel: "/ pc" },
  accessories: { label: "Accessories", color: "bg-green-100 text-green-800", priceField: "price_per_piece", priceLabel: "Price/pc", unitLabel: "/ pc" },
  manufacturing: { label: "Manufacturing", color: "bg-purple-100 text-purple-800", priceField: "rate", priceLabel: "Rate", unitLabel: "/ unit" },
};

function CatalogPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<CatalogKind>("materials");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formPrice, setFormPrice] = useState(0);
  const [formRateUnit, setFormRateUnit] = useState("piece");
  const [formBrand, setFormBrand] = useState("");
  const [formCountry, setFormCountry] = useState("");

  const fetchMaterials = useServerFn(listMaterials);
  const fetchFinishes = useServerFn(listFinishes);
  const fetchVeneers = useServerFn(listVeneers);
  const fetchEdgeBands = useServerFn(listEdgeBands);
  const fetchHardware = useServerFn(listHardware);
  const fetchAccessories = useServerFn(listAccessories);
  const fetchManufacturing = useServerFn(listManufacturingOperations);

  const createMaterialFn = useServerFn(createCatalogMaterial);
  const updateMaterialFn = useServerFn(updateCatalogMaterial);
  const archiveMaterialFn = useServerFn(archiveCatalogMaterial);
  const createFinishFn = useServerFn(createCatalogFinish);
  const updateFinishFn = useServerFn(updateCatalogFinish);
  const archiveFinishFn = useServerFn(archiveCatalogFinish);
  const createVeneerFn = useServerFn(createCatalogVeneer);
  const updateVeneerFn = useServerFn(updateCatalogVeneer);
  const archiveVeneerFn = useServerFn(archiveCatalogVeneer);
  const createEdgeBandFn = useServerFn(createCatalogEdgeBand);
  const updateEdgeBandFn = useServerFn(updateCatalogEdgeBand);
  const archiveEdgeBandFn = useServerFn(archiveCatalogEdgeBand);
  const createHardwareFn = useServerFn(createCatalogHardware);
  const updateHardwareFn = useServerFn(updateCatalogHardware);
  const archiveHardwareFn = useServerFn(archiveCatalogHardware);
  const createAccessoryFn = useServerFn(createCatalogAccessory);
  const updateAccessoryFn = useServerFn(updateCatalogAccessory);
  const archiveAccessoryFn = useServerFn(archiveCatalogAccessory);
  const createMfgFn = useServerFn(createCatalogManufacturingOp);
  const updateMfgFn = useServerFn(updateCatalogManufacturingOp);
  const archiveMfgFn = useServerFn(archiveCatalogManufacturingOp);

  const loadItems = useCallback(async (kind: CatalogKind) => {
    setLoading(true);
    try {
      let result: unknown;
      switch (kind) {
        case "materials": result = await fetchMaterials({ data: {} }); break;
        case "finishes": result = await fetchFinishes({ data: {} }); break;
        case "veneers": result = await fetchVeneers({ data: {} }); break;
        case "edge_bands": result = await fetchEdgeBands({ data: {} }); break;
        case "hardware": result = await fetchHardware({ data: {} }); break;
        case "accessories": result = await fetchAccessories({ data: {} }); break;
        case "manufacturing": result = await fetchManufacturing({ data: {} }); break;
      }
      setItems((Array.isArray(result) ? result : (result as any)?.items ?? []) as CatalogItem[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetchMaterials, fetchFinishes, fetchVeneers, fetchEdgeBands, fetchHardware, fetchAccessories, fetchManufacturing]);

  useEffect(() => { loadItems(activeTab); }, [activeTab, loadItems]);

  function openNew() {
    setEditing(null);
    setFormCode("");
    setFormPrice(0);
    setFormRateUnit("piece");
    setFormBrand("");
    setFormCountry("");
    setDialogOpen(true);
  }

  function openEdit(item: CatalogItem) {
    setEditing(item);
    setFormCode(item.code ?? "");
    const cfg = KIND_CONFIG[activeTab];
    setFormPrice(Number(item[cfg.priceField]) ?? 0);
    if (activeTab === "manufacturing") setFormRateUnit((item.rate_unit as string) ?? "piece");
    setFormBrand((item.brand as string) ?? "");
    setFormCountry((item.country_of_origin as string) ?? "");
    setDialogOpen(true);
  }

  async function save() {
    if (!formCode.trim()) return toast.error("Code is required");
    try {
      if (editing) {
        switch (activeTab) {
          case "materials": await updateMaterialFn({ data: { id: editing.id, code: formCode, pricePerUnit: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "finishes": await updateFinishFn({ data: { id: editing.id, code: formCode, pricePerUnit: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "veneers": await updateVeneerFn({ data: { id: editing.id, code: formCode, pricePerM2: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "edge_bands": await updateEdgeBandFn({ data: { id: editing.id, code: formCode, pricePerUnit: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "hardware": await updateHardwareFn({ data: { id: editing.id, code: formCode, pricePerPiece: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "accessories": await updateAccessoryFn({ data: { id: editing.id, code: formCode, pricePerPiece: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "manufacturing": await updateMfgFn({ data: { id: editing.id, code: formCode, rateUnit: formRateUnit as "piece" | "m" | "m2" | "minute", rate: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
        }
        toast.success("Updated");
      } else {
        switch (activeTab) {
          case "materials": await createMaterialFn({ data: { code: formCode, labelI18nKey: formCode, pricingUnit: "m2", pricePerUnit: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "finishes": await createFinishFn({ data: { code: formCode, pricePerUnit: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "veneers": await createVeneerFn({ data: { code: formCode, pricePerM2: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "edge_bands": await createEdgeBandFn({ data: { code: formCode, pricePerUnit: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "hardware": await createHardwareFn({ data: { code: formCode, pricePerPiece: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "accessories": await createAccessoryFn({ data: { code: formCode, pricePerPiece: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
          case "manufacturing": await createMfgFn({ data: { code: formCode, rateUnit: formRateUnit as "piece" | "m" | "m2" | "minute", rate: formPrice, brand: formBrand || undefined, countryOfOrigin: formCountry || undefined } }); break;
        }
        toast.success("Created");
      }
      setDialogOpen(false);
      loadItems(activeTab);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function archiveItem(id: string) {
    if (!confirm("Archive this item?")) return;
    try {
      switch (activeTab) {
        case "materials": await archiveMaterialFn({ data: { id } }); break;
        case "finishes": await archiveFinishFn({ data: { id } }); break;
        case "veneers": await archiveVeneerFn({ data: { id } }); break;
        case "edge_bands": await archiveEdgeBandFn({ data: { id } }); break;
        case "hardware": await archiveHardwareFn({ data: { id } }); break;
        case "accessories": await archiveAccessoryFn({ data: { id } }); break;
        case "manufacturing": await archiveMfgFn({ data: { id } }); break;
      }
      toast.success("Archived");
      loadItems(activeTab);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    }
  }

  const cfg = KIND_CONFIG[activeTab];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{t("admin.catalog.title", "Catalog Management")}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CatalogKind)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {(Object.keys(KIND_CONFIG) as CatalogKind[]).map((kind) => (
            <TabsTrigger key={kind} value={kind} className="text-xs">
              {KIND_CONFIG[kind].label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge className={cfg.color} variant="outline">{items.length}</Badge>
                {cfg.label}
              </CardTitle>
              <Button size="sm" onClick={openNew} className="gap-1">
                <Plus className="h-3 w-3" /> Add {cfg.label.replace(/s$/, "")}
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items yet. Click "Add" to create one.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">{cfg.priceLabel}</TableHead>
                      {activeTab === "manufacturing" && <TableHead>Rate Unit</TableHead>}
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.code}</TableCell>
                        <TableCell className="text-sm">{(item.brand as string) || "—"}</TableCell>
                        <TableCell className="text-sm">{(item.country_of_origin as string) || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatEGP(Number(item[cfg.priceField] ?? 0))} <span className="text-muted-foreground text-xs">{cfg.unitLabel}</span>
                        </TableCell>
                        {activeTab === "manufacturing" && (
                          <TableCell className="text-sm">{(item as any).rate_unit ?? "—"}</TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => archiveItem(item.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} {cfg.label.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. MDF-18, EB-PVC-22"
              />
            </div>
            <div className="space-y-2">
              <Label>{cfg.priceLabel}</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={formPrice}
                onChange={(e) => setFormPrice(Number(e.target.value))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Brand</Label>
                <Input
                  value={formBrand}
                  onChange={(e) => setFormBrand(e.target.value)}
                  placeholder="e.g. Egger, Hettich"
                />
              </div>
              <div className="space-y-2">
                <Label>Country of Origin</Label>
                <Input
                  value={formCountry}
                  onChange={(e) => setFormCountry(e.target.value)}
                  placeholder="e.g. Egypt, Germany"
                />
              </div>
            </div>
            {activeTab === "manufacturing" && (
              <div className="space-y-2">
                <Label>Rate Unit</Label>
                <Select value={formRateUnit} onValueChange={setFormRateUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece">Piece</SelectItem>
                    <SelectItem value="m">Metre</SelectItem>
                    <SelectItem value="m2">m²</SelectItem>
                    <SelectItem value="minute">Minute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
