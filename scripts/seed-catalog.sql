-- Seed realistic Egyptian furniture catalog data for PeleCanon tenant
-- Run: psql -d <db> -f scripts/seed-catalog.sql

\set tenant_id '2bf7cd99-d567-42d3-b5fc-22cc40654293'

BEGIN;

-- ── Materials ───────────────────────────────────────────────────────────────
INSERT INTO public.catalog_materials (tenant_id, code, label_i18n_key, pricing_unit, price_per_unit, default_wastage_pct)
VALUES
  (:'tenant_id', 'MDF-18',   'MDF 18mm',          'm2', 180,  8),
  (:'tenant_id', 'MDF-12',   'MDF 12mm',          'm2', 140,  8),
  (:'tenant_id', 'PLY-15',   'Plywood 15mm',      'm2', 220, 10),
  (:'tenant_id', 'PLY-18',   'Plywood 18mm',      'm2', 260, 10),
  (:'tenant_id', 'HW-30',    'Hardwood Oak',       'm2', 450, 12),
  (:'tenant_id', 'HW-18',    'Hardwood Beech',     'm2', 380, 12),
  (:'tenant_id', 'ALU-20',   'Aluminium 20mm',     'm2', 320,  5),
  (:'tenant_id', 'LAM-18',   'Laminate MDF 18mm',  'm2', 210,  8),
  (:'tenant_id', 'GLASS-6',  'Glass 6mm',          'm2', 280, 15),
  (:'tenant_id', 'GLASS-8',  'Glass 8mm',          'm2', 350, 15),
  (:'tenant_id', 'PARTICLE-18', 'Particle Board 18mm', 'm2', 120, 8),
  (:'tenant_id', 'ACRYLIC-W', 'Acrylic White',     'm2', 400, 10)
ON CONFLICT DO NOTHING;

-- ── Hardware ────────────────────────────────────────────────────────────────
INSERT INTO public.catalog_hardware (tenant_id, code, price_per_piece)
VALUES
  (:'tenant_id', 'HNG-35-H',    12),   -- 35mm concealed hinge
  (:'tenant_id', 'HNG-110-H',   18),   -- 110° hinge
  (:'tenant_id', 'SLD-450',     65),   -- 450mm drawer slide
  (:'tenant_id', 'SLD-600',     85),   -- 600mm drawer slide
  (:'tenant_id', 'SLD-900',    120),   -- 900mm drawer slide
  (:'tenant_id', 'HANDLE-A1',   25),   -- handle type A1
  (:'tenant_id', 'HANDLE-B3',   35),   -- handle type B3
  (:'tenant_id', 'HANDLE-C2',   18),   -- handle type C2 (aluminium)
  (:'tenant_id', 'LEG-700-W',   45),   -- 700mm wooden leg
  (:'tenant_id', 'LEG-700-M',   55),   -- 700mm metal leg
  (:'tenant_id', 'FOOT-M6',      3),   -- M6 adjustable foot
  (:'tenant_id', 'MAGN-15',      8),   -- 15mm magnetic catch
  (:'tenant_id', 'STAB-500',    28),   -- 500mm stretcher bar
  (:'tenant_id', 'CAM-15',       5)    -- cam lock 15mm
ON CONFLICT DO NOTHING;

-- ── Accessories ─────────────────────────────────────────────────────────────
INSERT INTO public.catalog_accessories (tenant_id, code, price_per_piece)
VALUES
  (:'tenant_id', 'LED-STRIP-1M',  30),  -- LED strip 1m
  (:'tenant_id', 'LED-STRIP-2M',  55),  -- LED strip 2m
  (:'tenant_id', 'CABLE-GROM',    15),  -- cable grommet
  (:'tenant_id', 'SHELF-PIN',      2),  -- shelf pin
  (:'tenant_id', 'SOFT-CLOSE',    40),  -- soft close damper
  (:'tenant_id', 'DOOR-STOP',      8),  -- door stop
  (:'tenant_id', 'CONNECTOR-A',   12),  -- connector type A
  (:'tenant_id', 'EDGE-MASK',      6),  -- edge masking tape
  (:'tenant_id', 'DUST-SEAL',      4)   -- dust seal strip
ON CONFLICT DO NOTHING;

-- ── Manufacturing Operations ────────────────────────────────────────────────
INSERT INTO public.catalog_manufacturing_operations (tenant_id, code, rate_unit, rate)
VALUES
  (:'tenant_id', 'CUT-CNC',    'minute', 8),    -- CNC cutting per min
  (:'tenant_id', 'CUT-SAW',    'minute', 5),    -- panel saw per min
  (:'tenant_id', 'DRILL-P32',  'piece',  15),   -- System 32 drilling per hole
  (:'tenant_id', 'EDGE-BND',   'minute', 6),    -- edge banding per min
  (:'tenant_id', 'ASSEMBLY',   'minute', 10),   -- assembly per min
  (:'tenant_id', 'FINISH-S',   'm2',     25),   -- surface finishing per m2
  (:'tenant_id', 'QC',         'piece',   5),   -- quality check per unit
  (:'tenant_id', 'DELIVERY',   'piece',  50)    -- delivery per unit
ON CONFLICT DO NOTHING;

-- ── Finishes ────────────────────────────────────────────────────────────────
INSERT INTO public.catalog_finishes (tenant_id, code, modifier_type, modifier_value)
VALUES
  (:'tenant_id', 'MELAMINE-W',   'percent', 0),
  (:'tenant_id', 'MELAMINE-B',   'percent', 0),
  (:'tenant_id', 'MELAMINE-O',   'percent', 5),
  (:'tenant_id', 'LACQUER-M',    'percent', 25),
  (:'tenant_id', 'LACQUER-G',    'percent', 30),
  (:'tenant_id', 'VENEER-OK',    'percent', 35),
  (:'tenant_id', 'VENEER-WN',    'percent', 40),
  (:'tenant_id', 'PAINT-W',      'percent', 20),
  (:'tenant_id', 'PAINT-C',      'percent', 22),
  (:'tenant_id', 'LAMINATE-HL',  'percent', 15)
ON CONFLICT DO NOTHING;

-- ── Veneers ─────────────────────────────────────────────────────────────────
INSERT INTO public.catalog_veneers (tenant_id, code, price_per_m2)
VALUES
  (:'tenant_id', 'VN-OK-W',    180),  -- Oak White
  (:'tenant_id', 'VN-OK-N',    200),  -- Oak Natural
  (:'tenant_id', 'VN-WN-M',    150),  -- Walnut Medium
  (:'tenant_id', 'VN-WN-D',    170),  -- Walnut Dark
  (:'tenant_id', 'VN-CH-N',    220),  -- Cherry Natural
  (:'tenant_id', 'VN-BEECH',   130),  -- Beech
  (:'tenant_id', 'VN-EBONY',   350),  -- Ebony
  (:'tenant_id', 'VN-MAPLE',   190)   -- Maple
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
