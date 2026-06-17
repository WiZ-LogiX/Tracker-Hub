#!/usr/bin/env bash
# Usage: DATABASE_URL='postgres://postgres:PASSWORD@db.<REF>.supabase.co:5432/postgres' \
#          bash scripts/apply-migration.sh supabase/migrations/20260613_username_avatars_v1.sql
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "  export DATABASE_URL='postgres://postgres:YOUR-PASSWORD@db.<REF>.supabase.co:5432/postgres'"
  exit 1
fi

FILE="${1:-supabase/migrations/20260613_username_avatars_v1.sql}"
if [[ ! -f "$FILE" ]]; then
  echo "ERROR: migration file not found: $FILE"
  exit 1
fi

echo "▶ Applying $FILE to $(echo "$DATABASE_URL" | sed 's#postgres://[^@]*@#postgres://***@#')"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$FILE"
echo "✓ Done."