-- Permissions system: role-based access control for PeleCanon.
-- Adds: permissions table (catalog), role_permissions table (mapping),
-- and seeds default permissions per role.

-- 1. Permissions catalog
CREATE TABLE IF NOT EXISTS public.permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Role-permission mapping
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('owner','admin','sales','worker','viewer')),
  permission_slug text NOT NULL REFERENCES public.permissions(slug) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, permission_slug)
);

-- 3. Roles table (custom role definitions per tenant)
CREATE TABLE IF NOT EXISTS public.tenant_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL CHECK (slug IN ('owner','admin','sales','worker','viewer')),
  label       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS role_permissions_tenant_role_idx
  ON public.role_permissions (tenant_id, role);

CREATE INDEX IF NOT EXISTS tenant_roles_tenant_idx
  ON public.tenant_roles (tenant_id);

-- 5. RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;

-- permissions: readable by any authenticated user in the tenant
DROP POLICY IF EXISTS permissions_select_auth ON public.permissions;
CREATE POLICY permissions_select_auth ON public.permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- role_permissions: owner/admin can manage, everyone in tenant can read
DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = role_permissions.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS role_permissions_write ON public.role_permissions;
CREATE POLICY role_permissions_write ON public.role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = role_permissions.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = role_permissions.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
  );

-- tenant_roles: owner/admin can manage, everyone in tenant can read
DROP POLICY IF EXISTS tenant_roles_select ON public.tenant_roles;
CREATE POLICY tenant_roles_select ON public.tenant_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenant_roles.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_roles_write ON public.tenant_roles;
CREATE POLICY tenant_roles_write ON public.tenant_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenant_roles.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenant_roles.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
  );

-- 6. Seed default permissions
INSERT INTO public.permissions (slug, label, category) VALUES
  -- Quotes
  ('quotes.view',         'عرض العروض',               'quotes'),
  ('quotes.create',       'إنشاء عرض',                'quotes'),
  ('quotes.edit',         'تعديل عرض',                'quotes'),
  ('quotes.delete',       'حذف عرض',                  'quotes'),
  ('quotes.configurator', 'استخدام الم configurator',  'quotes'),
  -- Invoices
  ('invoices.view',       'عرض الفواتير',             'invoices'),
  ('invoices.create',     'إنشاء فاتورة',            'invoices'),
  ('invoices.edit',       'تعديل فاتورة',            'invoices'),
  ('invoices.delete',     'حذف فاتورة',              'invoices'),
  -- Orders
  ('orders.view',         'عرض الطلبات',              'orders'),
  ('orders.create',       'إنشاء طلب',               'orders'),
  ('orders.edit',         'تعديل طلب',               'orders'),
  ('orders.delete',       'حذف طلب',                 'orders'),
  -- Customers
  ('customers.view',      'عرض العملاء',              'customers'),
  ('customers.create',    'إضافة عميل',               'customers'),
  ('customers.edit',      'تعديل بيانات عميل',        'customers'),
  ('customers.delete',    'حذف عميل',                'customers'),
  -- Products
  ('products.view',       'عرض المنتجات',             'products'),
  ('products.create',     'إضافة منتج',               'products'),
  ('products.edit',       'تعديل منتج',              'products'),
  ('products.delete',     'حذف منتج',                'products'),
  -- Materials
  ('materials.view',      'عرض المواد الخام',          'materials'),
  ('materials.create',    'إضافة مادة خام',           'materials'),
  ('materials.edit',      'تعديل مادة خام',           'materials'),
  ('materials.delete',    'حذف مادة خام',             'materials'),
  -- Suppliers
  ('suppliers.view',      'عرض الموردين',             'suppliers'),
  ('suppliers.create',    'إضافة مورد',               'suppliers'),
  ('suppliers.edit',      'تعديل مورد',              'suppliers'),
  ('suppliers.delete',    'حذف مورد',                'suppliers'),
  -- Finishes / Veneers / Accessories
  ('finishes.view',       'عرض التشطيبات',            'finishes'),
  ('finishes.create',     'إضافة تشطيب',             'finishes'),
  ('finishes.edit',       'تعديل تشطيب',             'finishes'),
  ('finishes.delete',     'حذف تشطيب',              'finishes'),
  ('veneers.view',        'عرض التنجيد',              'veneers'),
  ('veneers.create',      'إضافة تنجيد',             'veneers'),
  ('veneers.edit',        'تعديل تنجيد',             'veneers'),
  ('veneers.delete',      'حذف تنجيد',              'veneers'),
  ('accessories.view',    'عرض الإكسسوارات',          'accessories'),
  ('accessories.create',  'إضافة إكسسوار',           'accessories'),
  ('accessories.edit',    'تعديل إكسسوار',           'accessories'),
  ('accessories.delete',  'حذف إكسسوار',            'accessories'),
  -- Pricing
  ('pricing.view',        'عرض عوامل التسعير',        'pricing'),
  ('pricing.edit',        'تعديل عوامل التسعير',      'pricing'),
  -- Cost analysis
  ('cost-analysis.view',  'عرض تحليل التكلفة',        'cost-analysis'),
  ('cost-analysis.edit',  'تعديل تحليل التكلفة',      'cost-analysis'),
  -- Discounts
  ('discounts.view',      'عرض الخصومات',             'discounts'),
  ('discounts.create',    'إضافة خصم',               'discounts'),
  ('discounts.edit',      'تعديل خصم',              'discounts'),
  ('discounts.delete',    'حذف خصم',                'discounts'),
  -- Notifications
  ('notifications.view',  'عرض الإشعارات',            'notifications'),
  ('notifications.send',  'إرسال إشعار',             'notifications'),
  -- Workers
  ('workers.view',        'عرض العمال',              'workers'),
  ('workers.create',      'إضافة عامل',              'workers'),
  ('workers.edit',        'تعديل عامل',              'workers'),
  ('workers.delete',      'حذف عامل',               'workers'),
  -- Remakes
  ('remakes.view',        'عرض إعادة التصنيع',        'remakes'),
  ('remakes.create',      'طلب إعادة تصنيع',          'remakes'),
  ('remakes.edit',        'تعديل إعادة تصنيع',        'remakes'),
  ('remakes.delete',      'حذف إعادة تصنيع',         'remakes'),
  -- Team
  ('team.view',           'عرض الفريق',              'team'),
  ('team.manage',         'إدارة الفريق والأدوار',    'team'),
  -- Seed
  ('seed.view',           'عرض بيانات Seed',          'seed'),
  ('seed.manage',         'إدارة بيانات Seed',        'seed')
ON CONFLICT (slug) DO NOTHING;

-- 7. Seed default tenant roles (labels/descriptions)
-- Will be inserted per-tenant on bootstrap; this seeds global defaults.
-- Actual data is inserted by ensureBootstrapAdmin or new migration trigger.

-- 8. Seed default role_permissions for the 'pelecanon' tenant.
DO $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'pelecanon' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'pelecanon tenant not found — role_permissions will be seeded on first bootstrap';
    RETURN;
  END IF;

  -- Insert default roles
  INSERT INTO public.tenant_roles (tenant_id, slug, label, description) VALUES
    (v_tenant, 'owner',  'المالك',          'صلاحية كاملة على جميع الإعدادات والبيانات'),
    (v_tenant, 'admin',  'المدير',          'إدارة الفريق والمنتجات والعروض'),
    (v_tenant, 'sales',  'المبيعات',        'إنشاء وتعديل العروض والفواتير'),
    (v_tenant, 'worker', 'العامل',          'عرض الطلبات وتحديث الحالة فقط'),
    (v_tenant, 'viewer', 'مشاهد',           'عرض فقط بدون تعديل')
  ON CONFLICT (tenant_id, slug) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description, updated_at = now();

  -- owner: all permissions
  INSERT INTO public.role_permissions (tenant_id, role, permission_slug)
  SELECT v_tenant, 'owner', slug FROM public.permissions
  ON CONFLICT DO NOTHING;

  -- admin: everything except team.manage and seed.manage
  INSERT INTO public.role_permissions (tenant_id, role, permission_slug)
  SELECT v_tenant, 'admin', slug FROM public.permissions
  WHERE slug NOT IN ('team.manage', 'seed.manage')
  ON CONFLICT DO NOTHING;

  -- sales: quotes, invoices, orders, customers, products, remakes, notifications, cost-analysis
  INSERT INTO public.role_permissions (tenant_id, role, permission_slug)
  SELECT v_tenant, 'sales', slug FROM public.permissions
  WHERE slug IN (
    'quotes.view','quotes.create','quotes.edit','quotes.configurator',
    'invoices.view','invoices.create','invoices.edit',
    'orders.view','orders.create','orders.edit',
    'customers.view','customers.create','customers.edit',
    'products.view',
    'remakes.view','remakes.create','remakes.edit',
    'notifications.view','notifications.send',
    'cost-analysis.view',
    'discounts.view','discounts.create','discounts.edit'
  )
  ON CONFLICT DO NOTHING;

  -- worker: read orders, view customers/products, update order status via remakes
  INSERT INTO public.role_permissions (tenant_id, role, permission_slug)
  SELECT v_tenant, 'worker', slug FROM public.permissions
  WHERE slug IN (
    'orders.view',
    'customers.view',
    'products.view',
    'materials.view',
    'remakes.view','remakes.create',
    'notifications.view'
  )
  ON CONFLICT DO NOTHING;

  -- viewer: read-only across the board
  INSERT INTO public.role_permissions (tenant_id, role, permission_slug)
  SELECT v_tenant, 'viewer', slug FROM public.permissions
  WHERE slug LIKE '%.view'
  ON CONFLICT DO NOTHING;

END $$;
