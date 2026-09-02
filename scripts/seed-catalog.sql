-- Seed realistic Egyptian furniture catalog data for PeleCanon tenant
-- Run: psql -d <db> -f scripts/seed-catalog.sql

\set tenant_id '2bf7cd99-d567-42d3-b5fc-22cc40654293'

BEGIN;

-- ── Materials ───────────────────────────────────────────────────────────────
INSERT INTO public.catalog_materials (tenant_id, code, label_i18n_key, pricing_unit, price_per_unit, default_wastage_pct, brand, country_of_origin)
VALUES
  (:'tenant_id', 'MDF-18',   'MDF 18mm',          'm2', 180,  8, 'Egger', 'Austria'),
  (:'tenant_id', 'MDF-12',   'MDF 12mm',          'm2', 140,  8, 'Egger', 'Austria'),
  (:'tenant_id', 'PLY-15',   'Plywood 15mm',      'm2', 220, 10, 'Local', 'Egypt'),
  (:'tenant_id', 'PLY-18',   'Plywood 18mm',      'm2', 260, 10, 'Local', 'Egypt'),
  (:'tenant_id', 'HW-30',    'Hardwood Oak',       'm2', 450, 12, 'Kährs', 'Sweden'),
  (:'tenant_id', 'HW-18',    'Hardwood Beech',     'm2', 380, 12, 'Local', 'Egypt'),
  (:'tenant_id', 'ALU-20',   'Aluminium 20mm',     'm2', 320,  5, 'Alucoworld', 'China'),
  (:'tenant_id', 'LAM-18',   'Laminate MDF 18mm',  'm2', 210,  8, 'Egger', 'Austria'),
  (:'tenant_id', 'GLASS-6',  'Glass 6mm',          'm2', 280, 15, 'Local', 'Egypt'),
  (:'tenant_id', 'GLASS-8',  'Glass 8mm',          'm2', 350, 15, 'Local', 'Egypt'),
  (:'tenant_id', 'PARTICLE-18', 'Particle Board 18mm', 'm2', 120, 8, 'Local', 'Egypt'),
  (:'tenant_id', 'ACRYLIC-W', 'Acrylic White',     'm2', 400, 10, 'Local', 'Egypt')
ON CONFLICT DO NOTHING;

-- ── Hardware ────────────────────────────────────────────────────────────────
INSERT INTO public.catalog_hardware (tenant_id, code, price_per_piece, brand, country_of_origin)
VALUES
  (:'tenant_id', 'HNG-35-H',    12, 'Hettich', 'Germany'),
  (:'tenant_id', 'HNG-110-H',   18, 'Hettich', 'Germany'),
  (:'tenant_id', 'SLD-450',     65, 'Hafele', 'Germany'),
  (:'tenant_id', 'SLD-600',     85, 'Hafele', 'Germany'),
  (:'tenant_id', 'SLD-900',    120, 'Hafele', 'Germany'),
  (:'tenant_id', 'HANDLE-A1',   25, 'Local', 'Egypt'),
  (:'tenant_id', 'HANDLE-B3',   35, 'Local', 'Egypt'),
  (:'tenant_id', 'HANDLE-C2',   18, 'Local', 'Egypt'),
  (:'tenant_id', 'LEG-700-W',   45, 'Local', 'Egypt'),
  (:'tenant_id', 'LEG-700-M',   55, 'Hafele', 'Germany'),
  (:'tenant_id', 'FOOT-M6',      3, 'Hettich', 'Germany'),
  (:'tenant_id', 'MAGN-15',      8, 'Hettich', 'Germany'),
  (:'tenant_id', 'STAB-500',    28, 'Local', 'Egypt'),
  (:'tenant_id', 'CAM-15',       5, 'Hettich', 'Germany')
ON CONFLICT DO NOTHING;

-- ── Accessories ─────────────────────────────────────────────────────────────
INSERT INTO public.catalog_accessories (tenant_id, code, price_per_piece, brand, country_of_origin)
VALUES
  (:'tenant_id', 'LED-STRIP-1M',  30, 'Local', 'China'),
  (:'tenant_id', 'LED-STRIP-2M',  55, 'Local', 'China'),
  (:'tenant_id', 'CABLE-GROM',    15, 'Hafele', 'Germany'),
  (:'tenant_id', 'SHELF-PIN',      2, 'Hettich', 'Germany'),
  (:'tenant_id', 'SOFT-CLOSE',    40, 'Hettich', 'Germany'),
  (:'tenant_id', 'DOOR-STOP',      8, 'Hafele', 'Germany'),
  (:'tenant_id', 'CONNECTOR-A',   12, 'Local', 'Egypt'),
  (:'tenant_id', 'EDGE-MASK',      6, 'Local', 'Egypt'),
  (:'tenant_id', 'DUST-SEAL',      4, 'Local', 'Egypt')
ON CONFLICT DO NOTHING;

-- ── Manufacturing Operations ────────────────────────────────────────────────
INSERT INTO public.catalog_manufacturing_operations (tenant_id, code, rate_unit, rate, brand, country_of_origin)
VALUES
  (:'tenant_id', 'CUT-CNC',    'minute', 8,  'Biesse', 'Italy'),
  (:'tenant_id', 'CUT-SAW',    'minute', 5,  'Altendorf', 'Germany'),
  (:'tenant_id', 'DRILL-P32',  'piece',  15, 'Hettich', 'Germany'),
  (:'tenant_id', 'EDGE-BND',   'minute', 6,  'Brandt', 'Germany'),
  (:'tenant_id', 'ASSEMBLY',   'minute', 10, 'Local', 'Egypt'),
  (:'tenant_id', 'FINISH-S',   'm2',     25, 'Local', 'Egypt'),
  (:'tenant_id', 'QC',         'piece',   5, 'Local', 'Egypt'),
  (:'tenant_id', 'DELIVERY',   'piece',  50, 'Local', 'Egypt')
ON CONFLICT DO NOTHING;

-- ── Finishes ────────────────────────────────────────────────────────────────
INSERT INTO public.catalog_finishes (tenant_id, code, price_per_unit, brand, country_of_origin)
VALUES
  (:'tenant_id', 'MELAMINE-W',   0, 'Local', 'Egypt'),
  (:'tenant_id', 'MELAMINE-B',   0, 'Local', 'Egypt'),
  (:'tenant_id', 'MELAMINE-O',   5, 'Local', 'Egypt'),
  (:'tenant_id', 'LACQUER-M',    25, 'Local', 'Egypt'),
  (:'tenant_id', 'LACQUER-G',    30, 'Local', 'Egypt'),
  (:'tenant_id', 'VENEER-OK',    35, 'Local', 'Egypt'),
  (:'tenant_id', 'VENEER-WN',    40, 'Local', 'Egypt'),
  (:'tenant_id', 'PAINT-W',      20, 'Jotun', 'Norway'),
  (:'tenant_id', 'PAINT-C',      22, 'Jotun', 'Norway'),
  (:'tenant_id', 'LAMINATE-HL',  15, 'Formica', 'UK')
ON CONFLICT DO NOTHING;

-- ── Veneers ─────────────────────────────────────────────────────────────────
INSERT INTO public.catalog_veneers (tenant_id, code, price_per_m2, brand, country_of_origin)
VALUES
  (:'tenant_id', 'VN-OK-W',    180, 'Local', 'Egypt'),
  (:'tenant_id', 'VN-OK-N',    200, 'Local', 'Egypt'),
  (:'tenant_id', 'VN-WN-M',    150, 'Local', 'Egypt'),
  (:'tenant_id', 'VN-WN-D',    170, 'Local', 'Egypt'),
  (:'tenant_id', 'VN-CH-N',    220, 'Local', 'Egypt'),
  (:'tenant_id', 'VN-BEECH',   130, 'Local', 'Egypt'),
  (:'tenant_id', 'VN-EBONY',   350, 'Local', 'Africa'),
  (:'tenant_id', 'VN-MAPLE',   190, 'Local', 'USA')
ON CONFLICT DO NOTHING;

-- ── Edge Bands ──────────────────────────────────────────────────────────────
INSERT INTO public.catalog_edge_bands (tenant_id, code, price_per_unit, brand, country_of_origin)
VALUES
  (:'tenant_id', 'EB-PVC-22',   8, 'Local', 'Egypt'),
  (:'tenant_id', 'EB-PVC-35',  12, 'Local', 'Egypt'),
  (:'tenant_id', 'EB-ABS-22',  15, 'Rehau', 'Germany'),
  (:'tenant_id', 'EB-ABS-35',  20, 'Rehau', 'Germany'),
  (:'tenant_id', 'EB-VN-OK',   25, 'Local', 'Egypt'),
  (:'tenant_id', 'EB-MEL-W',   10, 'Local', 'Egypt'),
  (:'tenant_id', 'EB-MEL-B',   10, 'Local', 'Egypt')
ON CONFLICT DO NOTHING;

-- ── Pricing factors (tenant-level) ──────────────────────────────────────────
INSERT INTO public.tenant_pricing_factors (tenant_id, factor_key, percent)
VALUES
  (:'tenant_id', 'labor',     15),
  (:'tenant_id', 'overhead',  10),
  (:'tenant_id', 'margin',    20),
  (:'tenant_id', 'rush',       0),
  (:'tenant_id', 'complexity', 0),
  (:'tenant_id', 'luxury',     0),
  (:'tenant_id', 'packaging',  5)
ON CONFLICT DO NOTHING;

-- ── Wastage rules (tenant-level) ───────────────────────────────────────────
INSERT INTO public.tenant_wastage_rules (tenant_id, scope, ref, pct)
VALUES
  (:'tenant_id', 'material', 'cabinet_side',   8),
  (:'tenant_id', 'material', 'cabinet_top',    8),
  (:'tenant_id', 'material', 'cabinet_bottom', 8),
  (:'tenant_id', 'material', 'back_panel',    12),
  (:'tenant_id', 'material', 'shelf',         10),
  (:'tenant_id', 'material', 'door_panel',     8),
  (:'tenant_id', 'material', 'drawer_front',   8),
  (:'tenant_id', 'material', 'edge_band',      5)
ON CONFLICT DO NOTHING;

COMMIT;
