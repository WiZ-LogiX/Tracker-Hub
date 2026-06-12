# PeleCanon Codebase Audit — Final Report

## Issues Discovered & Fixed

### 🔴 Critical (Build-breaking)

1. **Orphaned route files** (`-plc.get.tsx`, `-plc.post.tsx` at project root)
   - **Root cause**: TanStack Router only picks up files under `src/routes/`
   - **Fix**: Deleted both files; consolidated logic into a proper server function

2. **Broken server function export pattern**
   - **Root cause**: `src/lib/plc.functions.ts` exported `const POST` from `createServerFn` — invalid pattern that doesn't match route handler expectations
   - **Fix**: Refactored to export `generatePLCNumber` as a proper server function with Zod validation

3. **Database client not aligned with migration plan**
   - **Root cause**: `client.server.ts` used `postgres` (TCP) but Cloudflare Workers need HTTP
   - **Fix**: Swapped to `drizzle-orm/neon-http` with `@neondatabase/serverless`

### 🟡 High Priority

4. **Locale file inconsistencies (FIXED in previous turn)**
   - Mixed languages, missing keys
   - **Fix**: Cleaned ar/en/fr.json with consistent structure

5. **`src/routes/__root.tsx` adds AuthProvider at root but admin.tsx has its own auth gate**
   - Not a bug, but ordering of context providers matters — currently OK

6. **`STAGE_LABEL_AR[stage]` runtime safety**
   - Could return `undefined` for unknown stages
   - **Fix**: Added `getStageLabelAr()` type-safe accessor

### 🟢 Improvements

7. **GenericCrud used `(supabase as any)` everywhere**
   - **Fix**: Removed `as any` casts; typed rows and form state

8. **Materials page had untyped rows and `any` casts**
   - **Fix**: Added proper interfaces for `MaterialRow` and `Supplier`

9. **i18n fallback was set to Arabic**
   - Works correctly but documented the behavior; added `load: "languageOnly"` and `returnEmptyString: false`

10. **French locale had only `admin` section**
    - **Fix**: Added `common`, `errors`, `dashboard`, `customers`, `quotes` translations

11. **No README or .env.example**
    - **Fix**: Added both with setup instructions

## Files Modified

| File | Change |
|------|--------|
| `-plc.get.tsx` | Deleted |
| `-plc.post.tsx` | Deleted |
| `src/lib/plc.functions.ts` | Rewrote with proper createServerFn + Zod |
| `src/db/client.server.ts` | Switched to neon-http Drizzle adapter |
| `src/lib/stages.ts` | Added `getStageLabelAr()` type-safe accessor |
| `src/components/admin/GenericCrud.tsx` | Removed `any` casts, improved types |
| `src/routes/admin/materials.tsx` | Proper MaterialRow/Supplier interfaces |
| `src/i18n/index.ts` | Added `load: "languageOnly"`, `returnEmptyString: false` |
| `src/i18n/locales/fr.json` | Expanded with common/errors/dashboard/customers/quotes |
| `README.md` | Created |
| `.env.example` | Created |

## Validation

### Build (pending user verification)
- Server fn fix should resolve the `export const POST` patterns
- Orphaned route files removed
- Drizzle adapter aligned with Neon

### Type safety
- Materials: removed all `any` from local state
- GenericCrud: removed `(supabase as any)` casts
- Stages: added runtime guard for unknown enum values

### Runtime
- All locale keys now exist in ar/en/fr
- No dangling references to deleted files

## Remaining Technical Debt

1. **Phase 1 migration (Neon + R2)** not complete — see `.lovable/neon-migration-plan.md`. Status: Drizzle adapter swapped, schema drafted, but data not yet replayed into Neon.

2. **Phase 2 (multi-tenant)** — schema additions (`tenants`, `tenant_members`) not yet wired into RLS policies.

3. **`supabaseAdmin` direct usage in components** — some pages still do `supabase.from()` on the client. These should be moved to server fns for proper RLS isolation. Recommend a follow-up sweep.

4. **No test runner configured** — vitest was deferred per the Phase 2 plan. Recommended for follow-up.

5. **No `useAuth` for French locale** — many admin pages still have Arabic hardcoded inside JSX (e.g. "الخامات"). Should be moved to `t()` keys.

6. **README of components/admin/GenericCrud** — it's used widely but still bypasses RLS by going through the client. Admin-only tables are fine for now but worth auditing.

## Recommended Next Steps

1. User-side verification: click **Rebuild** above the chat input → confirm no build errors.
2. Deploy & smoke-test `GET /` and `/admin` after rebuild.
3. Address remaining 5-item debt list in a follow-up sweep.
4. Consider adding `vitest` + a basic auth/session-redirect test before Phase 2 cutover.