
-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'production');
CREATE TYPE public.pricing_unit AS ENUM ('linear_meter', 'square_meter', 'unit');
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
CREATE TYPE public.request_status AS ENUM ('new', 'in_review', 'quoted', 'closed');
CREATE TYPE public.order_stage AS ENUM (
  'deposit_received','design_approved','cutting','assembly',
  'finishing','quality_check','ready_for_pickup','delivered','completed'
);
CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================
-- USER ROLES + has_role function
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- Auto-create profile + assign 'admin' to the FIRST signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- CATALOG: categories, materials, finishes, accessories, products, pricing_formulas
-- ============================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  pricing_unit public.pricing_unit NOT NULL DEFAULT 'linear_meter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'wood',
  price_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'm²',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.materials TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_public_read" ON public.materials FOR SELECT USING (true);
CREATE POLICY "materials_admin_write" ON public.materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.finishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price_modifier_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  price_modifier_fixed NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finishes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.finishes TO authenticated;
GRANT ALL ON public.finishes TO service_role;
ALTER TABLE public.finishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finishes_public_read" ON public.finishes FOR SELECT USING (true);
CREATE POLICY "finishes_admin_write" ON public.finishes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.accessories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.accessories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.accessories TO authenticated;
GRANT ALL ON public.accessories TO service_role;
ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accessories_public_read" ON public.accessories FOR SELECT USING (true);
CREATE POLICY "accessories_admin_write" ON public.accessories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  labor_pct NUMERIC(6,2) NOT NULL DEFAULT 15,
  wastage_pct NUMERIC(6,2) NOT NULL DEFAULT 8,
  overhead_pct NUMERIC(6,2) NOT NULL DEFAULT 10,
  margin_pct NUMERIC(6,2) NOT NULL DEFAULT 25,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_admin_write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- CUSTOMERS + RFQs + QUOTES + INVOICES
-- ============================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  governorate TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT INSERT ON public.customers TO anon; -- via RFQ submission
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_staff_read" ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "customers_staff_write" ON public.customers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "customers_anon_insert" ON public.customers FOR INSERT TO anon WITH CHECK (true);

CREATE TABLE public.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT NOT NULL UNIQUE DEFAULT ('RFQ-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  governorate TEXT,
  product_category TEXT NOT NULL,
  specs JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  budget_range TEXT,
  status public.request_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_requests TO authenticated;
GRANT INSERT ON public.quote_requests TO anon;
GRANT ALL ON public.quote_requests TO service_role;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfq_staff_all" ON public.quote_requests FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "rfq_anon_insert" ON public.quote_requests FOR INSERT TO anon WITH CHECK (true);

CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE DEFAULT ('Q-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  request_id UUID REFERENCES public.quote_requests(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status public.quote_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_code TEXT,
  vat_pct NUMERIC(5,2) NOT NULL DEFAULT 14,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  deposit_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days')::date,
  notes TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_staff_all" ON public.quotes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  material_name TEXT,
  finish_id UUID REFERENCES public.finishes(id) ON DELETE SET NULL,
  finish_name TEXT,
  dimension_value NUMERIC(10,3) NOT NULL DEFAULT 1,
  qty INT NOT NULL DEFAULT 1,
  accessories JSONB NOT NULL DEFAULT '[]',
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_items_staff_all" ON public.quote_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE DEFAULT ('INV-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  total NUMERIC(14,2) NOT NULL,
  deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  snapshot JSONB NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_staff_all" ON public.invoices FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============================================
-- DISCOUNTS
-- ============================================
CREATE TABLE public.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type public.discount_type NOT NULL DEFAULT 'percentage',
  value NUMERIC(10,2) NOT NULL,
  max_value NUMERIC(12,2),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  usage_count INT NOT NULL DEFAULT 0,
  max_uses INT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discounts TO authenticated;
GRANT ALL ON public.discounts TO service_role;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discounts_staff_read" ON public.discounts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "discounts_admin_write" ON public.discounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- ORDERS + PRODUCTION LOGS
-- ============================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  current_stage public.order_stage NOT NULL DEFAULT 'deposit_received',
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  deposit NUMERIC(14,2) NOT NULL DEFAULT 0,
  contract_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_staff_all" ON public.orders FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage_from public.order_stage,
  stage_to public.order_stage NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  transitioned_by UUID REFERENCES auth.users(id),
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_logs TO authenticated;
GRANT ALL ON public.production_logs TO service_role;
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_staff_all" ON public.production_logs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_staff_read" ON public.audit_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "audit_staff_insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============================================
-- SEED DATA
-- ============================================
INSERT INTO public.categories (name_ar, name_en, pricing_unit) VALUES
  ('مطابخ', 'Kitchens', 'linear_meter'),
  ('دواليب', 'Wardrobes', 'square_meter'),
  ('غرف نوم', 'Bedrooms', 'unit'),
  ('طاولات', 'Tables', 'unit');

INSERT INTO public.materials (name_ar, name_en, type, price_per_unit, unit) VALUES
  ('MDF 18mm', 'MDF 18mm', 'mdf', 850, 'm²'),
  ('خشب زان', 'Beech Wood', 'wood', 2400, 'm²'),
  ('HPL', 'HPL Laminate', 'laminate', 1200, 'm²'),
  ('بولي لاك', 'Polylac', 'finish', 600, 'm²'),
  ('كونتر استيل', 'Steel Counter', 'metal', 1800, 'm');

INSERT INTO public.finishes (name_ar, name_en, price_modifier_pct) VALUES
  ('مطفي', 'Matte', 0),
  ('لامع', 'Glossy', 12),
  ('شبه لامع', 'Semi-gloss', 6),
  ('خشن خاص', 'Textured', 18);

INSERT INTO public.accessories (name_ar, name_en, unit_price) VALUES
  ('مفصلات بلوم', 'Blum Hinges', 95),
  ('سكك جر', 'Drawer Slides', 180),
  ('مقابض', 'Handles', 45),
  ('إضاءة LED', 'LED Lighting', 320),
  ('سلة منزلقة', 'Sliding Basket', 650),
  ('قواعد ركن', 'Corner Base', 420);

INSERT INTO public.products (code, name_ar, name_en, description_ar, base_price, category_id) VALUES
  ('KIT-001', 'مطبخ كلاسيكي', 'Classic Kitchen', 'مطبخ بتصميم كلاسيكي بأبواب فريم', 2500, (SELECT id FROM public.categories WHERE name_en='Kitchens')),
  ('KIT-002', 'مطبخ مودرن', 'Modern Kitchen', 'مطبخ بخطوط مستقيمة وأبواب سادة', 2200, (SELECT id FROM public.categories WHERE name_en='Kitchens')),
  ('WAR-001', 'دولاب 3 ضلف', 'Wardrobe 3-Door', 'دولاب بثلاث ضلف وأدراج داخلية', 1800, (SELECT id FROM public.categories WHERE name_en='Wardrobes')),
  ('WAR-002', 'دولاب سحاب', 'Sliding Wardrobe', 'دولاب بأبواب منزلقة', 2100, (SELECT id FROM public.categories WHERE name_en='Wardrobes')),
  ('BED-001', 'سرير مزدوج', 'Double Bed', 'سرير مزدوج بظهر مرتفع', 6500, (SELECT id FROM public.categories WHERE name_en='Bedrooms')),
  ('TBL-001', 'طاولة طعام 6 أشخاص', 'Dining Table 6P', 'طاولة طعام لـ 6 أشخاص', 4500, (SELECT id FROM public.categories WHERE name_en='Tables'));
