-- Migration: Add edge_band to component_kind enum
-- Date: 2026-06-28
-- Purpose: Support edge banding as a separate cost line (linear metres × rate)
--          Fixes domain audit gap: "edge banding not modeled as separate cost line"
-- Safe: additive-only, no data changes

BEGIN;

-- Add edge_band to the component_kind enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'edge_band'
    AND enumtypid = 'public.component_kind'::regtype
  ) THEN
    ALTER TYPE public.component_kind ADD VALUE 'edge_band';
  END IF;
END
$$;

COMMIT;
