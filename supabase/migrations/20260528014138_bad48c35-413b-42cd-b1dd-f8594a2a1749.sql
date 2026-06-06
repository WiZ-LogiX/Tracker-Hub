
CREATE TABLE public.wastage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id(),
  material_type text NOT NULL,
  min_dimension numeric NOT NULL DEFAULT 0,
  max_dimension numeric,
  wastage_pct numeric NOT NULL DEFAULT 8,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wastage_rules TO authenticated;
GRANT ALL ON public.wastage_rules TO service_role;

ALTER TABLE public.wastage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY wastage_rules_staff_read ON public.wastage_rules
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY wastage_rules_admin_write ON public.wastage_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_wastage_rules_lookup ON public.wastage_rules(material_type, min_dimension);

INSERT INTO public.wastage_rules (material_type, min_dimension, max_dimension, wastage_pct) VALUES
  ('wood',     0, 2,    6),
  ('wood',     2, 6,    8),
  ('wood',     6, NULL, 10),
  ('mdf',      0, 4,    5),
  ('mdf',      4, NULL, 7),
  ('plywood',  0, 4,    6),
  ('plywood',  4, NULL, 9);
