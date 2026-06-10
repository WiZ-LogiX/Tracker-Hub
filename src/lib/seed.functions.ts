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

    // --- Categories ---
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
        const { data: inserted } = await supabaseAdmin.from("categories").insert(c).select("id").single();
        if (inserted) {
          categoryMap[c.name_ar] = inserted.id;
          results.push(`✓ تصنيف "${c.name_ar}" تم إنشاؤه`);
        }
      } else {
        // Find the existing category id
        const { data: cat } = await supabaseAdmin.from("categories").select("id").eq("name_ar", c.name_ar).single();
        if (cat) categoryMap[c.name_ar] = cat.id;
        results.push(`- تصنيف "${c.name_ar}" موجود بالفعل`);
      }
    }

    // Wait a moment for category inserts to be available
    if (Object.keys(categoryMap).length === 0) {
      // Re-fetch all categories
      const { data: allCats } = await supabaseAdmin.from("categories").select("id, name_ar");
      if (allCats) {
        for (const cat of allCats) {
          categoryMap[cat.name_ar] = cat.id;
        }
      }
    }

    // --- Suppliers ---
    const suppliers = [
      { name: "شركة الأخشاب المصرية", country: "مصر" },
      { name: "تركية للأخشاب", country: "تركيا" },
      { name: "إيطالية المنيوم", country: "إيطاليا" },
      { name: "خشب بلطيق", country: "السويد" },
      { name: "صينية للخامات", country: "الصين" },
    ];

    const supplierMap: Record<string, string> = {};
    for (const s of suppliers) {
      const { data: existing } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("name", s.name)
        .maybeSingle();
      
      if (!existing) {
        const { data: inserted } = await supabaseAdmin.from("suppliers").insert(s).select("id").single();
        if (inserted) {
          supplierMap[s.name] = inserted.id;
          results.push(`✓ مورد "${s.name}" تم إنشاؤه`);
        }
      } else {
        supplierMap[s.name] = existing.id;
        results.push(`- مورد "${s.name}" موجود بالفعل`);
      }
    }

    // --- Materials (linked to suppliers) ---
    const materials = [
      { name_ar: "خشب MDF محلي", name_en: "Local MDF", type: "wood", unit: "م²", price_per_unit: 280, supplier_id: supplierMap["شركة الأخشاب المصرية"] || null, country_of_origin: "مصر" },
      { name_ar: "خشب MDF إيطالي", name_en: "Italian MDF", type: "wood", unit: "م²", price_per_unit: 450, supplier_id: supplierMap["إيطالية المنيوم"] || null, country_of_origin: "إيطاليا" },
      { name_ar: "خشب زان", name_en: "Beech Wood", type: "wood", unit: "م²", price_per_unit: 850, supplier_id: supplierMap["تركية للأخشاب"] || null, country_of_origin: "تركيا" },
      { name_ar: "خشب سويدي", name_en: "Swedish Pine", type: "wood", unit: "م²", price_per_unit: 1100, supplier_id: supplierMap["خشب بلطيق"] || null, country_of_origin: "السويد" },
      { name_ar: "كونتر 18مم", name_en: "Plywood 18mm", type: "wood", unit: "م²", price_per_unit: 320, supplier_id: supplierMap["شركة الأخشاب المصرية"] || null, country_of_origin: "مصر" },
      { name_ar: "خشب بلوط", name_en: "Oak Wood", type: "wood", unit: "م²", price_per_unit: 1200, supplier_id: supplierMap["خشب بلطيق"] || null, country_of_origin: "السويد" },
      { name_ar: "خشب موكي", name_en: "Mouki Wood", type: "wood", unit: "م²", price_per_unit: 950, supplier_id: supplierMap["إيطالية المنيوم"] || null, country_of_origin: "إيطاليا" },
      { name_ar: "ألمنيوم أبيض", name_en: "White Aluminum", type: "metal", unit: "م", price_per_unit: 180, supplier_id: supplierMap["صينية للخامات"] || null, country_of_origin: "الصين" },
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

    // --- Finishes ---
    const finishes = [
      { name_ar: "لاكيه لامع", name_en: "Gloss Lacquer", price_modifier_pct: 15, price_modifier_fixed: 0 },
      { name_ar: "لاكيه مطفي", name_en: "Matte Lacquer", price_modifier_pct: 12, price_modifier_fixed: 0 },
      { name_ar: "ورنيش طبيعي", name_en: "Natural Varnish", price_modifier_pct: 8, price_modifier_fixed: 0 },
      { name_ar: "دهان زيتي", name_en: "Oil Paint", price_modifier_pct: 10, price_modifier_fixed: 0 },
      { name_ar: "بوليستر", name_en: "Polyester Finish", price_modifier_pct: 20, price_modifier_fixed: 0 },
      { name_ar: "طلاء إسباني", name_en: "Spanish Coating", price_modifier_pct: 18, price_modifier_fixed: 0 },
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
      { name_ar: "قشرة بلوط طبيعي", name_en: "Natural Oak Veneer", price_per_m2: 450 },
      { name_ar: "قشرة جوز", name_en: "Walnut Veneer", price_per_m2: 550 },
      { name_ar: "قشرة ماهوجني", name_en: "Mahogany Veneer", price_per_m2: 700 },
      { name_ar: "قشرة أبيتوس", name_en: "Abetos Veneer", price_per_m2: 380 },
      { name_ar: "قشرة سنديان", name_en: "Oak Veneer", price_per_m2: 500 },
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
      { name_ar: "مفصلات هيدروليك", name_en: "Hydraulic Hinges (set)", unit_price: 35 },
      { name_ar: "سحاب داخلي", name_en: "Inner Drawer Slide", unit_price: 55 },
      { name_ar: "شلف ميتاليك", name_en: "Metallic Shelf", unit_price: 80 },
      { name_ar: "كلاب تعليق", name_en: "Hanger Rod", unit_price: 30 },
      { name_ar: "مسكات كريستال", name_en: "Crystal Handles", unit_price: 65 },
      { name_ar: "إضاءة LED", name_en: "LED Strip Light", unit_price: 150 },
      { name_ar: "مراية كاملة", name_en: "Full Mirror", unit_price: 200 },
      { name_ar: "شواية تهوية", name_en: "Ventilation Grill", unit_price: 40 },
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

    // --- Product Templates (linked to categories) ---
    const kitchenCatId = categoryMap["مطابخ"] || null;
    const wardrobeCatId = categoryMap["دواليب ملابس"] || null;
    const bedroomCatId = categoryMap["غرف نوم"] || null;
    const tableCatId = categoryMap["طاولات"] || null;
    const officeCatId = categoryMap["أثاث مكتبي"] || null;

    const products = [
      { name_ar: "مطبخ كلاسيك", name_en: "Classic Kitchen", code: "KIT-CLS", base_price: 15000, category_id: kitchenCatId, description_ar: "مطبخ خشب بتصميم كلاسيك فاخر مع ديكورات" },
      { name_ar: "مطبخ مودرن هاي جلواس", name_en: "Modern High-Gloss Kitchen", code: "KIT-MOD", base_price: 18000, category_id: kitchenCatId, description_ar: "مطبخ بتصميم عصري مودرن وواجهات لاكيه لامع" },
      { name_ar: "مطبخ بسيط", name_en: "Simple Kitchen", code: "KIT-SMP", base_price: 9000, category_id: kitchenCatId, description_ar: "مطبخ بسيط عملي بأقل التكاليف" },
      { name_ar: "دولاب ملابس 6 ضلف", name_en: "Wardrobe 6 Doors", code: "WRD-6", base_price: 8000, category_id: wardrobeCatId, description_ar: "دولاب ملابس بستة ضلف مع رفوف وكلاب تعليق" },
      { name_ar: "دولاب ملابس 4 ضلف", name_en: "Wardrobe 4 Doors", code: "WRD-4", base_price: 5500, category_id: wardrobeCatId, description_ar: "دولاب ملابس بأربعة ضلف مناسب لغرف النوم المتوسطة" },
      { name_ar: "دولاب ملابس 8 ضلف", name_en: "Wardrobe 8 Doors", code: "WRD-8", base_price: 12000, category_id: wardrobeCatId, description_ar: "دولاب ملابس كبير بثمانية ضلف مع جارنيتة" },
      { name_ar: "غرفة نوم كاملة VIP", name_en: "VIP Bedroom Set", code: "BRD-VIP", base_price: 35000, category_id: bedroomCatId, description_ar: "غرفة نوم كاملة فاخرة (سرير + دولاب + تسريحة + كوماتينو)" },
      { name_ar: "غرفة نوم قياسية", name_en: "Standard Bedroom", code: "BRD-STD", base_price: 18000, category_id: bedroomCatId, description_ar: "غرفة نوم قياسية (سرير عرض 180 + دولاب 4 ضلف + تسريحة)" },
      { name_ar: "سرير خشب", name_en: "Wooden Bed", code: "BED-WD", base_price: 6000, category_id: bedroomCatId, description_ar: "سرير خشب متين مع شنطة" },
      { name_ar: "طاولة طعام 6 كراسي", name_en: "Dining Table 6 Chairs", code: "DIN-6", base_price: 9000, category_id: tableCatId, description_ar: "طاولة طعام مستطيلة بستة كراسي خشب زان" },
      { name_ar: "طاولة طعام 8 كراسي", name_en: "Dining Table 8 Chairs", code: "DIN-8", base_price: 12500, category_id: tableCatId, description_ar: "طاولة طعام كبيرة بثمانية كراسي من خشب البلوط" },
      { name_ar: "مكتب مدير", name_en: "Executive Desk", code: "OFF-ED", base_price: 7500, category_id: officeCatId, description_ar: "مكتب مدير خشب بلوط مع درف" },
      { name_ar: "رفوف مكتبية", name_en: "Office Shelves", code: "OFF-SHL", base_price: 3500, category_id: officeCatId, description_ar: "رفوف مكتبية معلقة 3 طبقات" },
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
          default_config: {},
        });
        results.push(`✓ قالب منتج "${p.name_ar}" تم إنشاؤه`);
      } else {
        results.push(`- قالب منتج "${p.name_ar}" موجود بالفعل`);
      }
    }

    // --- Workers ---
    const workers = [
      { name: "أحمد الجيار", role: "نجار", phone: "01000000001" },
      { name: "محمود عبدالرحمن", role: "دهان", phone: "01000000002" },
      { name: "علي حسن", role: "نجار", phone: "01000000003" },
      { name: "خالد السيد", role: "تجميع", phone: "01000000004" },
      { name: "محمد إبراهيم", role: "دهان", phone: "01000000005" },
      { name: "سامي أحمد", role: "نجار", phone: "01000000006" },
      { name: "أيمن عبدالسلام", role: "تغليف", phone: "01000000007" },
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
      { code: "VIP15", type: "percentage", value: 15, max_uses: 10, active: true },
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