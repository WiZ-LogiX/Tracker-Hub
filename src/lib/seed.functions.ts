import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_FORMULA } from "@/lib/pricing/engine";

export const ensurePricingSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const results: string[] = [];

    // --- Pricing Factors ---
    const defaultFactors = [
      { key: "labor", label_ar: "العمالة", kind: "default", value_pct: 15, scope: "global" },
      { key: "wastage", label_ar: "الهدر", kind: "default", value_pct: 8, scope: "global" },
      { key: "overhead", label_ar: "المصاريف الإدارية", kind: "default", value_pct: 10, scope: "global" },
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
        await supabaseAdmin.from("pricing_factors").insert(factor);
        results.push(`✓ عامل التسعير "${factor.label_ar}" تم إضافته`);
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
        formula: DEFAULT_FORMULA,
        effective_from: new Date().toISOString(),
      });
      results.push(`✓ قاعدة التسعير الافتراضية (v${nextVersion}) تم إنشاؤها وتفعيلها`);
    } else {
      results.push("- قاعدة التسعير الافتراضية موجودة بالفعل");
    }

    return { success: true, results };
  });

export const seedSampleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const results: string[] = [];

    // --- Product Templates ---
    const products = [
      { name_ar: "مطبخ كلاسيك", name_en: "Classic Kitchen", code: "KIT-CLASSIC", base_price: 15000, description_ar: "مطبخ بتصميم كلاسيك فاخر" },
      { name_ar: "مطبخ مودرن", name_en: "Modern Kitchen", code: "KIT-MODERN", base_price: 18000, description_ar: "مطبخ بتصميم عصري مودرن" },
      { name_ar: "دولاب ملابس 6 ضلف", name_en: "Wardrobe 6 Doors", code: "WRD-6", base_price: 8000, description_ar: "دولاب ملابس بستة ضلف" },
      { name_ar: "دولاب ملابس 4 ضلف", name_en: "Wardrobe 4 Doors", code: "WRD-4", base_price: 5500, description_ar: "دولاب ملابس بأربعة ضلف" },
      { name_ar: "غرفة نوم كاملة", name_en: "Bedroom Set", code: "BRD-FULL", base_price: 25000, description_ar: "غرفة نوم كاملة (سرير + دولاب + تسريحة)" },
      { name_ar: "سرير VIP", name_en: "VIP Bed", code: "BED-VIP", base_price: 12000, description_ar: "سرير فاخر مع شنطة" },
      { name_ar: "طاولة طعام 6 كراسي", name_en: "Dining Table 6 Chairs", code: "DIN-6", base_price: 9000, description_ar: "طاولة طعام بستة كراسي" },
      { name_ar: "دريسنج كوماتينو", name_en: "Dressing Comodino", code: "DRS-COM", base_price: 4000, description_ar: "دريسنج مع كوماتينو" },
    ];

    for (const p of products) {
      const { data: existing } = await supabaseAdmin
        .from("product_templates")
        .select("id")
        .eq("code", p.code)
        .maybeSingle();
      
      if (!existing) {
        await supabaseAdmin.from("product_templates").insert({
          ...p,
          category_id: null,
          default_config: {},
        });
        results.push(`✓ قالب منتج "${p.name_ar}" تم إنشاؤه`);
      } else {
        results.push(`- قالب منتج "${p.name_ar}" موجود بالفعل`);
      }
    }

    // --- Materials ---
    const materials = [
      { name_ar: "خشب MDF", name_en: "MDF Board", type: "wood", unit: "م²", price_per_unit: 350, country_of_origin: "مصر" },
      { name_ar: "خشب زان", name_en: "Beech Wood", type: "wood", unit: "م²", price_per_unit: 850, country_of_origin: "تركيا" },
      { name_ar: "خشب سويدي", name_en: "Swedish Wood", type: "wood", unit: "م²", price_per_unit: 1200, country_of_origin: "السويد" },
      { name_ar: "خشب بلوط", name_en: "Oak Wood", type: "wood", unit: "م²", price_per_unit: 950, country_of_origin: "أمريكا" },
      { name_ar: "كونتر", name_en: "Plywood", type: "wood", unit: "م²", price_per_unit: 280, country_of_origin: "مصر" },
      { name_ar: "خشب موسكي", name_en: "Mousky Wood", type: "wood", unit: "م²", price_per_unit: 1100, country_of_origin: "إيطاليا" },
    ];

    for (const m of materials) {
      const { data: existing } = await supabaseAdmin
        .from("materials")
        .select("id")
        .eq("name_ar", m.name_ar)
        .maybeSingle();
      
      if (!existing) {
        await supabaseAdmin.from("materials").insert(m);
        results.push(`✓ خامة "${m.name_ar}" تم إنشاؤها`);
      } else {
        results.push(`- خامة "${m.name_ar}" موجودة بالفعل`);
      }
    }

    // --- Suppliers ---
    const suppliers = [
      { name: "شركة الأخشاب المصرية", country: "مصر" },
      { name: "تركية للاستيراد", country: "تركيا" },
      { name: "إيطالية المونيوم", country: "إيطاليا" },
      { name: "خشب بلطيق", country: "السويد" },
    ];

    for (const s of suppliers) {
      const { data: existing } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("name", s.name)
        .maybeSingle();
      
      if (!existing) {
        await supabaseAdmin.from("suppliers").insert(s);
        results.push(`✓ مورد "${s.name}" تم إنشاؤه`);
      } else {
        results.push(`- مورد "${s.name}" موجود بالفعل`);
      }
    }

    // --- Finishes ---
    const finishes = [
      { name_ar: "لاكيه لامع", name_en: "Gloss Lacquer", price_modifier_pct: 15, price_modifier_fixed: 0 },
      { name_ar: "لاكيه مطفي", name_en: "Matte Lacquer", price_modifier_pct: 12, price_modifier_fixed: 0 },
      { name_ar: "ورنيش طبيعي", name_en: "Natural Varnish", price_modifier_pct: 8, price_modifier_fixed: 0 },
      { name_ar: "دهان زيتي", name_en: "Oil Paint", price_modifier_pct: 10, price_modifier_fixed: 0 },
      { name_ar: "بوليستر", name_en: "Polyester", price_modifier_pct: 20, price_modifier_fixed: 0 },
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

    // --- Veneers ---
    const veneers = [
      { name_ar: "قشرة بلوط طبيعي", name_en: "Natural Oak", price_per_m2: 450 },
      { name_ar: "قشرة جوز", name_en: "Walnut", price_per_m2: 550 },
      { name_ar: "قشرة ماهوجني", name_en: "Mahogany", price_per_m2: 700 },
      { name_ar: "قشرة أبيتوس", name_en: "Abetos", price_per_m2: 380 },
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

    // --- Accessories ---
    const accessories = [
      { name_ar: "قفل عادي", name_en: "Standard Lock", unit_price: 45 },
      { name_ar: "قفل مغناطيسي", name_en: "Magnetic Lock", unit_price: 120 },
      { name_ar: "مفصلات هيدروليك", name_en: "Hydraulic Hinges", unit_price: 35 },
      { name_ar: "سحاب داخلي", name_en: "Inner Drawer Slide", unit_price: 55 },
      { name_ar: "شلف ميتاليك", name_en: "Metallic Shelf", unit_price: 80 },
      { name_ar: "كلاب تعليق", name_en: "Hanger Rod", unit_price: 30 },
      { name_ar: "مسكات كريستال", name_en: "Crystal Handles", unit_price: 65 },
      { name_ar: "إضاءة LED", name_en: "LED Strip Light", unit_price: 150 },
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

    // --- Workers ---
    const workers = [
      { name: "أحمد الجيار", role: "نجار", phone: "01000000001" },
      { name: "محمود عبدالرحمن", role: "دهان", phone: "01000000002" },
      { name: "علي حسن", role: "نجار", phone: "01000000003" },
      { name: "خالد السيد", role: "تجميع", phone: "01000000004" },
      { name: "محمد إبراهيم", role: "دهان", phone: "01000000005" },
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

    // --- Discounts ---
    const discounts = [
      { code: "WELCOME10", type: "percentage", value: 10, max_uses: 50, active: true },
      { code: "FLAT500", type: "fixed", value: 500, max_uses: 20, active: true },
    ];

    for (const d of discounts) {
      const { data: existing } = await supabaseAdmin
        .from("discounts")
        .select("id")
        .eq("code", d.code)
        .maybeSingle();
      
      if (!existing) {
        await supabaseAdmin.from("discounts").insert(d);
        results.push(`✓ خصم "${d.code}" تم إنشاؤه`);
      } else {
        results.push(`- خصم "${d.code}" موجود بالفعل`);
      }
    }

    return { success: true, results };
  });