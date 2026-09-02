-- Add material, finish, veneer columns to sections table.
-- Sections now carry their own material/finish/veneer properties
-- that apply to all units within the section.

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES catalog_materials(id),
  ADD COLUMN IF NOT EXISTS finish_id uuid REFERENCES catalog_finishes(id),
  ADD COLUMN IF NOT EXISTS veneer_id uuid REFERENCES catalog_veneers(id);

COMMENT ON COLUMN sections.material_id IS 'Primary material for this section (e.g. MDF 18mm). Applied to all units in section.';
COMMENT ON COLUMN sections.finish_id IS 'Primary finish for this section (e.g. Melamine White). Applied to all units.';
COMMENT ON COLUMN sections.veneer_id IS 'Primary veneer for this section (e.g. Oak Natural). Applied to all units.';
