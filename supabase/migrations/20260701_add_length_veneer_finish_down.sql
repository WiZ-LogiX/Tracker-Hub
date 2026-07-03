-- Down migration: revert length_mm, dimension_unit, veneer/finish component kinds

-- Remove columns
ALTER TABLE units DROP COLUMN IF EXISTS length_mm;
ALTER TABLE units DROP COLUMN IF EXISTS dimension_unit;

-- Drop enum
DROP TYPE IF EXISTS dimension_unit;

-- NOTE: Cannot safely remove 'veneer' or 'finish' from component_kind enum
-- without recreating the enum type and all dependent columns.
-- See: https://www.postgresql.org/docs/current/sql-altertype.html
