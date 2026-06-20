import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_FORMULA } from "@/lib/pricing/engine";
import type { TenantContext } from "@/lib/tenant-context";

export const ensurePricingSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      throw new Error("Forbidden: only owner or admin can seed data");
    }
    const tenantId = ctx.tenantId;
    const results: string[] = [];

    // --- Pricing Factors ---
    const defaultFactors = [
      { key: "labor", label_ar: "العمالة", kind: "default", value_pct: 15, scope: "global" },
      { key: "wastage", label_ar: "الهدر", kind: "default", value_pct: 8, scope: "global" },
      {
        key: "overhead",
        label_ar: "المصاريف الإدارية",
        kind: "default",
        value_pct: 10,
        scope: "global",
      },
      { key: "margin", label_ar: "هامش الربح", kind: "default", value_pct: 25, scope: "global" },
      { key: "luxury", label_ar: "الفخامة", kind: "custom", value_pct: 0, scope: "item" },
      { key: "complexity", label_ar: "التعقيد", kind: "custom", value_pct: 0, scope: "item" },
      { key: "rush", label_ar: "الاستعجال", kind: "custom", value_pct: 0, scope: "item" },
    ];

    for (const factor of defaultFactors) {
      const { data: existing } = await supabaseAdmin
        .from("pricing_factors")
        .select("id")
        .eq("key", factor.key)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("pricing_factors").insert({
          ...factor,
          tenant_id: tenantId,
        } as any);
        results.push(`✓ عامل التسعير "${factor.label_ar}" تم إضافه`);
      } else {
        results.push(`- عامل التسعير "${factor.label_ar}" موجود بالفعل`);
      }
    }

    // --- Pricing Rules ---
    const { data: existingRule } = await supabaseAdmin
      .from("pricing_rules")
      .select("id")
      .eq("status", "active")
      .maybeSingle();

    if (!existingRule) {
      const { data: anyRule } = await supabaseAdmin
        .from("pricing_rules")
        .select("id, version")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (anyRule?.version ?? 0) + 1;

      await supabaseAdmin.from("pricing_rules").insert({
        name: "القاعدة الافتراضية",
        version: nextVersion,
        status: "active",
        formula: DEFAULT_FORMULA as any,
        effective_from: new Date().toISOString(),
        tenant_id: tenantId,
      } as any);
      results.push(`✓ قاعدة التسعير الافتراضية (v${nextVersion}) تم إنشاؤها وتفعيلها`);
    } else {
      results.push("- قاعدة التسعير الافتراضية موجودة بالفعل");
    }

    return { success: true, results };
  });

export const seedSampleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const results: string[] = [];

    // ============================================================
    // 1. CATEGORIES
    // ============================================================
    const categories = [
      { name_ar: "مطابخ", name_en: "Kitchens", pricing_unit: "linear_meter" },
      { name_ar: "دواليب ملابس", name_en: "Wardrobes", pricing_unit: "linear_meter" },
      { name_ar: "غرف نوم", name_en: "Bedrooms", pricing_unit: "unit" },
      { name_ar: "طاولات", name_en: "Tables", pricing_unit: "unit" },
      { name_ar: "أثاث مكتبي", name_en: "Office Furniture", pricing_unit: "unit" },
    ];

    const categoryMap: Record<string, string> = {};
    for (const c of categories) {
      const { data: existing } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("name_ar", c.name_ar)
        .maybeSingle();

      if (!existing) {
        const { data: inserted } = await supabaseAdmin
          .from("categories")
          .insert(c as any)
          .select("id")
          .single();
        if (inserted) {
          categoryMap[c.name_ar] = inserted.id;
          results.push(`✓ تصنيف "${c.name_ar}" تم إنشاؤه`);
        }
      } else {
        categoryMap[c.name_ar] = existing.id;
        results.push(`- تصنيف "${c.name_ar}" موجود بالفعل`);
      }
    }

    // ============================================================
    // 2. SUPPLIERS
    // ============================================================
    const suppliers = [
      { name: "شركة الأخشاب المصرية", country: "مصر" },
      { name: "تركية للأخشاب", country: "تركيا" },
      { name: "إيطالية المنيوم", country: "إيطاليا" },
      { name: "خشب بلطيق", country: "السويد" },
      { name: "صينية للخامات", country: "الصين" },
      { name: "أخوات النجار", country: "مصر" },
      { name: "خشب روماني", country: "رومانيا" },
      { name: "دهانات الجزيرة", country: "مصر" },
    ];

    const supplierMap: Record<string, string> = {};
    for (const s of suppliers) {
      const { data: existing } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("name", s.name)
        .maybeSingle();

      if (!existing) {
        const { data: inserted } = await supabaseAdmin
          .from("suppliers")
          .insert(s)
          .select("id")
          .single();
        if (inserted) {
          supplierMap[s.name] = inserted.id;
          results.push(`✓ مورد "${s.name}" تم إنشاؤه`);
        }
      } else {
        supplierMap[s.name] = existing.id;
        results.push(`- مورد "${s.name}" موجود بالفعل`);
      }
    }

    // ============================================================
    // 3. MATERIALS — by category
    // ============================================================
    const materials = [
      {
        name_ar: "خشب MDF محلي 18مم",
        name_en: "Local MDF 18mm",
        type: "wood",
        unit: "م²",
        price_per_unit: 280,
        supplier_id: supplierMap["شركة الأخشاب المصرية"] || null,
        country_of_origin: "مصر",
        wastage_pct: 10,
      },
      {
        name_ar: "خشب MDF إيطالي 18مم",
        name_en: "Italian MDF 18mm",
        type: "wood",
        unit: "م²",
        price_per_unit: 450,
        supplier_id: supplierMap["إيطالية المنيوم"] || null,
        country_of_origin: "إيطاليا",
        wastage_pct: 8,
      },
      {
        name_ar: "كونتر 18مم روسي",
        name_en: "Russian Plywood 18mm",
        type: "wood",
        unit: "م²",
        price_per_unit: 320,
        supplier_id: supplierMap["شركة الأخشاب المصرية"] || null,
        country_of_origin: "مصر",
        wastage_pct: 10,
      },
      {
        name_ar: "ألمنيوم إطار مطابخ",
        name_en: "Kitchen Frame Aluminum",
        type: "metal",
        unit: "م",
        price_per_unit: 180,
        supplier_id: supplierMap["صينية للخامات"] || null,
        country_of_origin: "الصين",
        wastage_pct: 5,
      },
      {
        name_ar: "خشب زان روماني",
        name_en: "Romanian Beech",
        type: "wood",
        unit: "م²",
        price_per_unit: 850,
        supplier_id: supplierMap["تركية للأخشاب"] || null,
        country_of_origin: "تركيا",
        wastage_pct: 12,
      },
      {
        name_ar: "خشب بلوط أمريكي",
        name_en: "American Oak",
        type: "wood",
        unit: "م²",
        price_per_unit: 1200,
        supplier_id: supplierMap["خشب بلطيق"] || null,
        country_of_origin: "السويد",
        wastage_pct: 15,
      },
      {
        name_ar: "خشب موكي إيطالي",
        name_en: "Italian Mouki",
        type: "wood",
        unit: "م²",
        price_per_unit: 950,
        supplier_id: supplierMap["إيطالية المنيوم"] || null,
        country_of_origin: "إيطاليا",
        wastage_pct: 10,
      },
      {
        name_ar: "خشب سويدي",
        name_en: "Swedish Pine",
        type: "wood",
        unit: "م²",
        price_per_unit: 1100,
        supplier_id: supplierMap["خشب بلطيق"] || null,
        country_of_origin: "السويد",
        wastage_pct: 12,
      },
      {
        name_ar: "MDF مقاوم للرطوبة",
        name_en: "Moisture Resistant MDF",
        type: "wood",
        unit: "م²",
        price_per_unit: 380,
        supplier_id: supplierMap["شركة الأخشاب المصرية"] || null,
        country_of_origin: "مصر",
        wastage_pct: 8,
      },
      {
        name_ar: "خشب موسكي",
        name_en: "Musky Wood",
        type: "wood",
        unit: "م²",
        price_per_unit: 780,
        supplier_id: supplierMap["تركية للأخشاب"] || null,
        country_of_origin: "تركيا",
        wastage_pct: 10,
      },
      {
        name_ar: "خشب سنديان",
        name_en: "Oak Wood",
        type: "wood",
        unit: "م²",
        price_per_unit: 1050,
        supplier_id: supplierMap["خشب بلطيق"] || null,
        country_of_origin: "السويد",
        wastage_pct: 12,
      },
      {
        name_ar: "خشب جوز تركي",
        name_en: "Turkish Walnut",
        type: "wood",
        unit: "م²",
        price_per_unit: 1300,
        supplier_id: supplierMap["تركية للأخشاب"] || null,
        country_of_origin: "تركيا",
        wastage_pct: 15,
      },
    ];

    const materialMap: Record<string, string> = {};
    for (const m of materials) {
      const { data: existing } = await supabaseAdmin
        .from("materials")
        .select("id")
        .eq("name_ar", m.name_ar)
        .maybeSingle();

      if (!existing) {
        const { data: inserted, error } = await supabaseAdmin
          .from("materials")
          .insert(m)
          .select("id")
          .single();
        if (inserted) {
          materialMap[m.name_ar] = inserted.id;
          results.push(`✓ خامة "${m.name_ar}" تم إنشاؤها`);
        } else {
          results.push(`✗ خامة "${m.name_ar}" فشل: ${error?.message}`);
        }
      } else {
        materialMap[m.name_ar] = existing.id;
        results.push(`- خامة "${m.name_ar}" موجودة بالفعل`);
      }
    }

    // ============================================================
    // 3b. WASTAGE RULES (based on material wastage_pct)
    // ============================================================
    const wastageRulesData = [
      {
        material_id: materialMap["خشب MDF محلي 18مم"] || null,
        material_type: "wood",
        min_dimension: 0,
        max_dimension: 50,
        wastage_pct: 10,
      },
      {
        material_id: materialMap["خشب MDF محلي 18مم"] || null,
        material_type: "wood",
        min_dimension: 50,
        max_dimension: 100,
        wastage_pct: 8,
      },
      {
        material_id: materialMap["خشب MDF محلي 18مم"] || null,
        material_type: "wood",
        min_dimension: 100,
        max_dimension: null,
        wastage_pct: 6,
      },
      {
        material_id: materialMap["خشب MDF إيطالي 18مم"] || null,
        material_type: "wood",
        min_dimension: 0,
        max_dimension: null,
        wastage_pct: 8,
      },
      {
        material_id: materialMap["كونتر 18مم روسي"] || null,
        material_type: "wood",
        min_dimension: 0,
        max_dimension: null,
        wastage_pct: 10,
      },
      {
        material_id: materialMap["ألمنيوم إطار مطابخ"] || null,
        material_type: "metal",
        min_dimension: 0,
        max_dimension: null,
        wastage_pct: 5,
      },
      {
        material_id: null,
        material_type: "wood",
        min_dimension: 0,
        max_dimension: null,
        wastage_pct: 8,
      },
      {
        material_id: null,
        material_type: "metal",
        min_dimension: 0,
        max_dimension: null,
        wastage_pct: 5,
      },
    ];

    for (const wr of wastageRulesData) {
      // Try to find by material_id first, then by material_type + min_dimension
      let existing = null;
      if (wr.material_id) {
        const { data } = await supabaseAdmin
          .from("wastage_rules")
          .select("id")
          .eq("material_id", wr.material_id)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        let existing2Query = supabaseAdmin
          .from("wastage_rules")
          .select("id")
          .eq("material_type", wr.material_type)
          .eq("min_dimension", wr.min_dimension);
        existing2Query =
          wr.max_dimension == null
            ? existing2Query.is("max_dimension", null)
            : existing2Query.eq("max_dimension", wr.max_dimension);
        const { data } = await existing2Query.maybeSingle();
        existing = data;
      }

      if (!existing) {
        const { error } = await supabaseAdmin.from("wastage_rules").insert({
          material_id: wr.material_id,
          material_type: wr.material_type,
          min_dimension: wr.min_dimension,
          max_dimension: wr.max_dimension,
          wastage_pct: wr.wastage_pct,
          active: true,
        } as any);
        if (!error)
          results.push(
            `✓ قاعدة هدر لـ "${wr.material_type}" (${wr.min_dimension}-${wr.max_dimension ?? "∞"}) بنسبة ${wr.wastage_pct}%`,
          );
        else results.push(`✗ قاعدة هدر: ${error.message}`);
      } else {
        results.push(`- قاعدة هدر لـ "${wr.material_type}" موجودة بالفعل`);
      }
    }

    // ============================================================
    // 4. FINISHES
    // ============================================================
    const finishes = [
      {
        name_ar: "لاكيه لامع",
        name_en: "Gloss Lacquer",
        price_modifier_pct: 15,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "لاكيه مطفي",
        name_en: "Matte Lacquer",
        price_modifier_pct: 12,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "ورنيش طبيعي",
        name_en: "Natural Varnish",
        price_modifier_pct: 8,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "دهان زيتي",
        name_en: "Oil Paint",
        price_modifier_pct: 10,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "بوليستر",
        name_en: "Polyester Finish",
        price_modifier_pct: 20,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "طلاء إسباني",
        name_en: "Spanish Coating",
        price_modifier_pct: 18,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "دهان مائي",
        name_en: "Water-Based Paint",
        price_modifier_pct: 6,
        price_modifier_fixed: 0,
      },
      {
        name_ar: "ورنيش مقاوم للحرارة",
        name_en: "Heat Resistant Varnish",
        price_modifier_pct: 14,
        price_modifier_fixed: 0,
      },
    ];

    for (const f of finishes) {
      const { data: existing } = await supabaseAdmin
        .from("finishes")
        .select("id")
        .eq("name_ar", f.name_ar)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("finishes").insert(f);
        results.push(`✓ تشطيب "${f.name_ar}" تم إنشاؤه`);
      } else {
        results.push(`- تشطيب "${f.name_ar}" موجود بالفعل`);
      }
    }

    // ============================================================
    // 5. VENEERS
    // ============================================================
    const veneers = [
      { name_ar: "قشرة بلوط طبيعي", name_en: "Natural Oak Veneer", price_per_m2: 450 },
      { name_ar: "قشرة جوز", name_en: "Walnut Veneer", price_per_m2: 550 },
      { name_ar: "قشرة ماهوجني", name_en: "Mahogany Veneer", price_per_m2: 700 },
      { name_ar: "قشرة أبيتوس", name_en: "Abetos Veneer", price_per_m2: 380 },
      { name_ar: "قشرة سنديان", name_en: "Oak Veneer", price_per_m2: 500 },
      { name_ar: "قشرة خشب الورد", name_en: "Rosewood Veneer", price_per_m2: 650 },
      { name_ar: "قشرة زان طبيعي", name_en: "Natural Beech Veneer", price_per_m2: 420 },
      { name_ar: "قشرة موكي", name_en: "Mouki Veneer", price_per_m2: 580 },
    ];

    for (const v of veneers) {
      const { data: existing } = await supabaseAdmin
        .from("veneers")
        .select("id")
        .eq("name_ar", v.name_ar)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("veneers").insert(v);
        results.push(`✓ قشرة "${v.name_ar}" تم إنشاؤها`);
      } else {
        results.push(`- قشرة "${v.name_ar}" موجودة بالفعل`);
      }
    }

    // ============================================================
    // 6. ACCESSORIES
    // ============================================================
    const accessories = [
      { name_ar: "قفل عادي", name_en: "Standard Lock", unit_price: 45 },
      { name_ar: "قفل مغناطيسي", name_en: "Magnetic Lock", unit_price: 120 },
      { name_ar: "مفصلات هيدروليك (طقم)", name_en: "Hydraulic Hinges (set)", unit_price: 35 },
      { name_ar: "سحاب درج داخلي", name_en: "Inner Drawer Slide", unit_price: 55 },
      { name_ar: "شلف ميتاليك", name_en: "Metallic Shelf", unit_price: 80 },
      { name_ar: "كلاب تعليق (طقم)", name_en: "Hanger Rod (set)", unit_price: 30 },
      { name_ar: "مسكات كريستال", name_en: "Crystal Handles", unit_price: 65 },
      { name_ar: "إضاءة LED داخلي", name_en: "LED Strip Light", unit_price: 150 },
      { name_ar: "شواية تهوية", name_en: "Ventilation Grill", unit_price: 40 },
      { name_ar: "كارنيز مطابخ", name_en: "Kitchen Cornice", unit_price: 90 },
      { name_ar: "أرجل ألمنيوم", name_en: "Aluminum Legs (set)", unit_price: 60 },
      { name_ar: "بانيو استانلس", name_en: "Stainless Sink", unit_price: 450 },
      { name_ar: "خلاط مطبخ", name_en: "Kitchen Faucet", unit_price: 250 },
      { name_ar: "رف توابل دوار", name_en: "Spice Rack", unit_price: 180 },
      { name_ar: "سلة مهملات", name_en: "Pull-out Trash Bin", unit_price: 220 },
      { name_ar: "سكينة تقطيع + لوح", name_en: "Cutting Board Set", unit_price: 130 },
      { name_ar: "فرن غاز", name_en: "Gas Oven", unit_price: 3500 },
      { name_ar: "بوتاجاز", name_en: "Cooktop", unit_price: 2000 },
      { name_ar: "غطاء فرن", name_en: "Oven Hood", unit_price: 850 },
      { name_ar: "مراية كاملة", name_en: "Full Mirror", unit_price: 200 },
      { name_ar: "درف دوار", name_en: "Lazy Susan", unit_price: 280 },
      { name_ar: "ماسك زجاج (متر)", name_en: "Glass Clip (meter)", unit_price: 15 },
      { name_ar: "ماسورة تعليق ملابس", name_en: "Clothes Rail", unit_price: 45 },
      { name_ar: "رف أحذية", name_en: "Shoe Rack", unit_price: 160 },
      { name_ar: "درج داخلي صغير", name_en: "Small Inner Drawer", unit_price: 110 },
      { name_ar: "مراية باب دولاب", name_en: "Wardrobe Door Mirror", unit_price: 180 },
      { name_ar: "مسكة جلد", name_en: "Leather Handle", unit_price: 50 },
    ];

    for (const a of accessories) {
      const { data: existing } = await supabaseAdmin
        .from("accessories")
        .select("id")
        .eq("name_ar", a.name_ar)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("accessories").insert(a);
        results.push(`✓ إكسسوار "${a.name_ar}" تم إنشاؤه`);
      } else {
        results.push(`- إكسسوار "${a.name_ar}" موجود بالفعل`);
      }
    }

    // ============================================================
    // 7. PRODUCT TEMPLATES + PRODUCTS
    // ============================================================
    const kitchenCatId = categoryMap["مطابخ"] || null;
    const wardrobeCatId = categoryMap["دواليب ملابس"] || null;
    const bedroomCatId = categoryMap["غرف نوم"] || null;
    const tableCatId = categoryMap["طاولات"] || null;
    const officeCatId = categoryMap["أثاث مكتبي"] || null;

    const products = [
      // مطابخ
      {
        code: "KIT-CLS-001",
        name_ar: "مطبخ كلاسيك",
        name_en: "Classic Kitchen",
        base_price: 15000,
        category_id: kitchenCatId,
        description_ar: "مطبخ خشب بتصميم كلاسيك فاخر مع ديكورات ونقوش",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "KIT-MOD-002",
        name_ar: "مطبخ مودرن هاي جلواس",
        name_en: "Modern High-Gloss Kitchen",
        base_price: 18000,
        category_id: kitchenCatId,
        description_ar: "مطبخ بتصميم عصري مودرن وواجهات لاكيه لامع",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "KIT-SMP-003",
        name_ar: "مطبخ بسيط",
        name_en: "Simple Kitchen",
        base_price: 9000,
        category_id: kitchenCatId,
        description_ar: "مطبخ بسيط عملي بأقل التكاليف",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      {
        code: "KIT-LUX-004",
        name_ar: "مطبخ فاخر مع جزيرة",
        name_en: "Luxury Kitchen with Island",
        base_price: 25000,
        category_id: kitchenCatId,
        description_ar: "مطبخ فاخر مع جزيرة وسطية ورخام",
        labor_pct: 18,
        wastage_pct: 10,
        overhead_pct: 12,
        margin_pct: 30,
      },
      {
        code: "KIT-ALM-005",
        name_ar: "مطبخ مودرن ألمنيوم",
        name_en: "Modern Aluminum Kitchen",
        base_price: 22000,
        category_id: kitchenCatId,
        description_ar: "مطبخ ألمنيوم مودرن مع زجاج سكريت",
        labor_pct: 15,
        wastage_pct: 5,
        overhead_pct: 10,
        margin_pct: 25,
      },
      // دواليب ملابس
      {
        code: "WRD-6D-001",
        name_ar: "دولاب ملابس 6 ضلف",
        name_en: "Wardrobe 6 Doors",
        base_price: 8000,
        category_id: wardrobeCatId,
        description_ar: "دولاب ملابس بستة ضلف مع رفوف وكلاب تعليق",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "WRD-4D-002",
        name_ar: "دولاب ملابس 4 ضلف",
        name_en: "Wardrobe 4 Doors",
        base_price: 5500,
        category_id: wardrobeCatId,
        description_ar: "دولاب ملابس بأربعة ضلف مناسب لغرف النوم المتوسطة",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "WRD-8D-003",
        name_ar: "دولاب ملابس 8 ضلف",
        name_en: "Wardrobe 8 Doors",
        base_price: 12000,
        category_id: wardrobeCatId,
        description_ar: "دولاب ملابس كبير بثمانية ضلف مع جارنيتة",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "WRD-3D-004",
        name_ar: "دولاب ملابس 3 ضلف",
        name_en: "Wardrobe 3 Doors",
        base_price: 4000,
        category_id: wardrobeCatId,
        description_ar: "دولاب ملابس صغير بثلاثة ضلف للغرف الصغيرة",
        labor_pct: 12,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "WRD-GL-005",
        name_ar: "دولاب ملابس مودرن زجاج",
        name_en: "Modern Glass Wardrobe",
        base_price: 10000,
        category_id: wardrobeCatId,
        description_ar: "دولاب ملابس مودرن بواجهات زجاج سكريت",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "WRD-GRN-006",
        name_ar: "جارنيتة دولاب",
        name_en: "Wardrobe Garniture",
        base_price: 3000,
        category_id: wardrobeCatId,
        description_ar: "جارنيتة دولاب ملابس إضافية (جزء علوي)",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      // غرف نوم
      {
        code: "BRD-VIP-001",
        name_ar: "غرفة نوم كاملة VIP",
        name_en: "VIP Bedroom Set",
        base_price: 35000,
        category_id: bedroomCatId,
        description_ar: "غرفة نوم كاملة فاخرة (سرير عرض 200 + دولاب 8 ضلف + تسريحة + 2 كومودينو)",
        labor_pct: 18,
        wastage_pct: 10,
        overhead_pct: 12,
        margin_pct: 30,
      },
      {
        code: "BRD-STD-002",
        name_ar: "غرفة نوم قياسية",
        name_en: "Standard Bedroom",
        base_price: 18000,
        category_id: bedroomCatId,
        description_ar: "غرفة نوم قياسية (سرير عرض 180 + دولاب 4 ضلف + تسريحة)",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "BED-WD-003",
        name_ar: "سرير خشب عرض 180",
        name_en: "Wooden Bed 180cm",
        base_price: 6000,
        category_id: bedroomCatId,
        description_ar: "سرير خشب متين مع شنطة",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "BED-W2-004",
        name_ar: "سرير عرض 200",
        name_en: "Bed 200cm",
        base_price: 7500,
        category_id: bedroomCatId,
        description_ar: "سرير عرض 200 فاخر مع شنت كبير",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "BRD-TRS-005",
        name_ar: "تسريحة كاملة بمراية",
        name_en: "Dresser with Mirror",
        base_price: 4500,
        category_id: bedroomCatId,
        description_ar: "تسريحة خشب بمراية كبيرة و3 أدراج",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "BRD-KMD-006",
        name_ar: "كومودينو",
        name_en: "Nightstand",
        base_price: 1500,
        category_id: bedroomCatId,
        description_ar: "كومودينو خشب بدرجين جانبيين للسرير",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      {
        code: "BRD-ECO-007",
        name_ar: "غرفة نوم اقتصادية",
        name_en: "Economy Bedroom",
        base_price: 12000,
        category_id: bedroomCatId,
        description_ar: "غرفة نوم اقتصادية (سرير عرض 160 + دولاب 3 ضلف + تسريحة صغيرة)",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      // طاولات
      {
        code: "DIN-6C-001",
        name_ar: "طاولة طعام 6 كراسي",
        name_en: "Dining Table 6 Chairs",
        base_price: 9000,
        category_id: tableCatId,
        description_ar: "طاولة طعام مستطيلة بستة كراسي خشب زان",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "DIN-8C-002",
        name_ar: "طاولة طعام 8 كراسي",
        name_en: "Dining Table 8 Chairs",
        base_price: 12500,
        category_id: tableCatId,
        description_ar: "طاولة طعام كبيرة بثمانية كراسي من خشب البلوط",
        labor_pct: 18,
        wastage_pct: 10,
        overhead_pct: 12,
        margin_pct: 30,
      },
      {
        code: "DIN-4C-003",
        name_ar: "طاولة طعام 4 كراسي",
        name_en: "Dining Table 4 Chairs",
        base_price: 6000,
        category_id: tableCatId,
        description_ar: "طاولة طعام صغيرة بأربعة كراسي",
        labor_pct: 12,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "TBL-COF-004",
        name_ar: "طاولة قهوة",
        name_en: "Coffee Table",
        base_price: 2500,
        category_id: tableCatId,
        description_ar: "طاولة قهوة خشب زان مع زجاج",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      {
        code: "TBL-SIDE-005",
        name_ar: "طاولة جانبية",
        name_en: "Side Table",
        base_price: 1200,
        category_id: tableCatId,
        description_ar: "طاولة جانبية صغيرة بدرج واحد",
        labor_pct: 10,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      // أثاث مكتبي
      {
        code: "OFF-ED-001",
        name_ar: "مكتب مدير",
        name_en: "Executive Desk",
        base_price: 7500,
        category_id: officeCatId,
        description_ar: "مكتب مدير خشب بلوط مع درف جانبي",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "OFF-CD-002",
        name_ar: "مكتب حاسوب",
        name_en: "Computer Desk",
        base_price: 3000,
        category_id: officeCatId,
        description_ar: "مكتب حاسوب بسيط مع درج لوحة مفاتيح",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      {
        code: "OFF-SHL-003",
        name_ar: "رفوف مكتبية",
        name_en: "Office Shelves",
        base_price: 3500,
        category_id: officeCatId,
        description_ar: "رفوف مكتبية معلقة 3 طبقات",
        labor_pct: 12,
        wastage_pct: 6,
        overhead_pct: 8,
        margin_pct: 20,
      },
      {
        code: "OFF-CAB-004",
        name_ar: "دولاب مكتبي",
        name_en: "Office Cabinet",
        base_price: 5000,
        category_id: officeCatId,
        description_ar: "دولاب حفظ ملفات مكتبي ببابين زجاج",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
      {
        code: "OFF-ECH-005",
        name_ar: "كرسي مدير",
        name_en: "Executive Chair",
        base_price: 2000,
        category_id: officeCatId,
        description_ar: "كرسي مدير دوار بقماش",
        labor_pct: 10,
        wastage_pct: 5,
        overhead_pct: 8,
        margin_pct: 20,
      },
      {
        code: "OFF-MT-006",
        name_ar: "طاولة اجتماعات",
        name_en: "Meeting Table",
        base_price: 6000,
        category_id: officeCatId,
        description_ar: "طاولة اجتماعات 6 أشخاص مع قاعدة خشب",
        labor_pct: 15,
        wastage_pct: 8,
        overhead_pct: 10,
        margin_pct: 25,
      },
    ];

    for (const p of products) {
      // Create product_template
      const { data: existingTemplate } = await supabaseAdmin
        .from("product_templates")
        .select("id")
        .eq("code", p.code)
        .maybeSingle();

      if (!existingTemplate) {
        const { error } = await supabaseAdmin.from("product_templates").insert({
          code: p.code,
          name_ar: p.name_ar,
          name_en: p.name_en,
          base_price: p.base_price,
          category_id: p.category_id,
          description_ar: p.description_ar,
          default_config: {},
          active: true,
        });
        if (!error) results.push(`✓ قالب منتج "${p.name_ar}" تم إنشاؤه`);
        else results.push(`✗ قالب منتج "${p.name_ar}" فشل: ${error.message}`);
      } else {
        results.push(`- قالب منتج "${p.name_ar}" موجود بالفعل`);
      }

      // Also create product in the products table (for the old quote builder)
      const { data: existingProduct } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("code", p.code)
        .maybeSingle();

      if (!existingProduct) {
        const { error } = await supabaseAdmin.from("products").insert({
          code: p.code,
          name_ar: p.name_ar,
          name_en: p.name_en,
          base_price: p.base_price,
          category_id: p.category_id,
          description_ar: p.description_ar,
          labor_pct: p.labor_pct,
          wastage_pct: p.wastage_pct,
          overhead_pct: p.overhead_pct,
          margin_pct: p.margin_pct,
          active: true,
        });
        if (!error) results.push(`✓ منتج "${p.name_ar}" تم إنشاؤه في جدول products`);
      } else {
        // Update existing product with latest values
        await supabaseAdmin
          .from("products")
          .update({
            labor_pct: p.labor_pct,
            wastage_pct: p.wastage_pct,
            overhead_pct: p.overhead_pct,
            margin_pct: p.margin_pct,
            base_price: p.base_price,
          })
          .eq("code", p.code);
        results.push(`- منتج "${p.name_ar}" محدث`);
      }
    }

    // ============================================================
    // 8. WORKERS
    // ============================================================
    const workers = [
      { name: "أحمد الجيار", role: "نجار", phone: "01000000001" },
      { name: "محمود عبدالرحمن", role: "دهان", phone: "01000000002" },
      { name: "علي حسن", role: "نجار", phone: "01000000003" },
      { name: "خالد السيد", role: "تجميع", phone: "01000000004" },
      { name: "محمد إبراهيم", role: "دهان", phone: "01000000005" },
      { name: "سامي أحمد", role: "نجار", phone: "01000000006" },
      { name: "أيمن عبدالسلام", role: "تغليف", phone: "01000000007" },
      { name: "كريم صبري", role: "نجار متخصص", phone: "01000000008" },
      { name: "مصطفى حسن", role: "تشطيب", phone: "01000000009" },
      { name: "هاني شريف", role: "تجميع", phone: "01000000010" },
    ];

    for (const w of workers) {
      const { data: existing } = await supabaseAdmin
        .from("workers")
        .select("id")
        .eq("name", w.name)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("workers").insert(w);
        results.push(`✓ عامل "${w.name}" تم إنشاؤه`);
      } else {
        results.push(`- عامل "${w.name}" موجود بالفعل`);
      }
    }

    // ============================================================
    // 9. DISCOUNTS
    // ============================================================
    const discounts = [
      { code: "WELCOME10", type: "percentage", value: 10, max_uses: 50, active: true },
      { code: "FLAT500", type: "fixed", value: 500, max_uses: 20, active: true },
      { code: "VIP15", type: "percentage", value: 15, max_uses: 10, active: true },
      { code: "NEWYEAR", type: "percentage", value: 20, max_uses: 30, active: true },
      { code: "BULK5", type: "percentage", value: 5, max_uses: 100, active: true },
    ];

    for (const d of discounts) {
      const { data: existing } = await supabaseAdmin
        .from("discounts")
        .select("id")
        .eq("code", d.code)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("discounts").insert(d as any);
        results.push(`✓ خصم "${d.code}" تم إنشاؤه`);
      } else {
        results.push(`- خصم "${d.code}" موجود بالفعل`);
      }
    }

    return { success: true, results };
  });
