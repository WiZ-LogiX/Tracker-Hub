
-- Drop and recreate write policies, scoped to authenticated only
DROP POLICY IF EXISTS user_roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_delete ON public.user_roles;

CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Re-assert grants
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Prevent removing the last admin
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_admins INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin'::app_role THEN
      SELECT COUNT(*) INTO remaining_admins
      FROM public.user_roles
      WHERE role = 'admin'::app_role AND user_id <> OLD.user_id;
      IF remaining_admins = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last admin';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin'::app_role AND NEW.role <> 'admin'::app_role THEN
      SELECT COUNT(*) INTO remaining_admins
      FROM public.user_roles
      WHERE role = 'admin'::app_role AND user_id <> OLD.user_id;
      IF remaining_admins = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin_removal
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- Part B: Configurable PLC reference
CREATE OR REPLACE FUNCTION public.gen_reference(entity text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  SELECT COALESCE(settings->>'reference_prefix', 'PLC')
  INTO v_prefix
  FROM public.companies
  WHERE id = public.default_company_id();
  IF v_prefix IS NULL OR length(btrim(v_prefix)) = 0 THEN
    v_prefix := 'PLC';
  END IF;
  RETURN v_prefix || '-' || entity || '-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
END;
$$;

-- Backfill default company prefix
UPDATE public.companies
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('reference_prefix', 'PLC')
WHERE id = public.default_company_id()
  AND (settings->>'reference_prefix') IS NULL;

-- Update column defaults
ALTER TABLE public.quote_requests ALTER COLUMN reference_number SET DEFAULT public.gen_reference('RFQ');
ALTER TABLE public.quotes ALTER COLUMN quote_number SET DEFAULT public.gen_reference('Q');
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT public.gen_reference('ORD');
ALTER TABLE public.invoices ALTER COLUMN invoice_number SET DEFAULT public.gen_reference('INV');

-- Part C: Notification schema
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id(),
  event text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  language text NOT NULL DEFAULT 'en',
  subject text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, event, channel, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_templates_staff_all ON public.notification_templates
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id(),
  entity_type text NOT NULL,
  entity_id uuid,
  reference text,
  event text NOT NULL,
  channel text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_log_staff_all ON public.notification_log
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_notification_log_entity ON public.notification_log(entity_type, entity_id);
CREATE INDEX idx_notification_log_created ON public.notification_log(created_at DESC);

-- Seed default WhatsApp templates (EN)
INSERT INTO public.notification_templates (company_id, event, channel, language, subject, body) VALUES
(public.default_company_id(), 'quote_sent', 'whatsapp', 'en', 'Your quote is ready', 'Hi {{customer_name}}, your quote {{reference}} is ready. View it here: {{link}}'),
(public.default_company_id(), 'quote_sent', 'whatsapp', 'fr', 'Votre devis est prêt', 'Bonjour {{customer_name}}, votre devis {{reference}} est prêt. Consultez-le ici: {{link}}'),
(public.default_company_id(), 'order_opened', 'whatsapp', 'en', 'Order confirmed', 'Hi {{customer_name}}, your order {{reference}} is confirmed and entering production. Track it: {{link}}'),
(public.default_company_id(), 'order_opened', 'whatsapp', 'fr', 'Commande confirmée', 'Bonjour {{customer_name}}, votre commande {{reference}} est confirmée et entre en production. Suivez-la: {{link}}'),
(public.default_company_id(), 'stage_changed', 'whatsapp', 'en', 'Production update', 'Hi {{customer_name}}, your order {{reference}} moved to stage: {{stage}}. {{link}}'),
(public.default_company_id(), 'stage_changed', 'whatsapp', 'fr', 'Mise à jour de production', 'Bonjour {{customer_name}}, votre commande {{reference}} est passée à l''étape: {{stage}}. {{link}}'),
(public.default_company_id(), 'delivery_scheduled', 'whatsapp', 'en', 'Delivery scheduled', 'Hi {{customer_name}}, delivery for {{reference}} is scheduled for {{date}}. {{link}}'),
(public.default_company_id(), 'delivered', 'whatsapp', 'en', 'Delivered', 'Hi {{customer_name}}, your order {{reference}} has been delivered. Thank you!');
