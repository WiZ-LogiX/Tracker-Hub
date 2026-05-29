
CREATE TABLE public.production_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage order_stage,
  photo_url TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_photos TO authenticated;
GRANT ALL ON public.production_photos TO service_role;

ALTER TABLE public.production_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photos_staff_all" ON public.production_photos
  FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE INDEX idx_production_photos_order ON public.production_photos(order_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('production-photos', 'production-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "production_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'production-photos');

CREATE POLICY "production_photos_staff_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'production-photos' AND is_staff(auth.uid()));

CREATE POLICY "production_photos_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'production-photos' AND is_staff(auth.uid()));

CREATE POLICY "production_photos_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'production-photos' AND is_staff(auth.uid()));
