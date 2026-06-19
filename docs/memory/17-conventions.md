# 17. Conventions & Quirks

## 17.1 Naming

- **Components**: PascalCase (`AvatarUploader.tsx`, `PhotoGrid.tsx`).
- **Hooks**: `useCamelCase` (`useIsMobile`, `useAuth`, `useSignedR2Urls`).
- **Server functions**: mixed file-naming — kebab-case (`pricing-factors.functions.ts`, `apply-migration.functions.ts`, `r2-views.functions.ts`) **and** camelCase (`auth.functions.ts`, `seed.functions.ts`). Convention drift — adopt `<entity>.functions.ts` for new ones.
- **Database columns**: snake_case in SQL; camelCase only in the typed Drizzle mirrors (`tenants` table: `logoUrl`, `primaryColor`, `taxRate`, `tenantId` → DB column `tenant_id`).

## 17.2 Stylistic guardrails (inferred)

- **No raw `fetch` in components** (where possible) — server fns + TanStack Query. Direct PUT to R2 in `<PhotoUploader>` is the lone sanctioned exception.
- **Avoid `any`** — Drizzle/Supabase inferred types used. `InternalNotes.tsx` and `orders.tsx` use `any[]` to bypass gaps (see [15-debt.md](./15-debt.md)).
- **No `console.log` in production** — only `console.error` for diagnostics (e.g. attachments cleanup, R2 errors).
- **No drafts/placeholders** — every code path runs end-to-end.
- **`cn()`** from `@/lib/utils.ts` for classing merging (standard shadcn practice).
- **Auth gate pattern** — server fn optional `.middleware([requireSupabaseAuth])`; UI pages check `useAuth().isStaff` before rendering.

## 17.3 File path quirks

- `src/integrations/supabase/icp-charts.tsx` is referenced in `.lovable/STATUS.md` but **not present** in the file tree — probably in `.dyad/` (per `.gitignore:38`).
- `src/integrations/supabase/admin.ts` re-exports `supabaseAdmin` via `default`; `client.server.ts` exports by name. Minor duplication.
- `supabase/migrations/` has multiple `plc_numbering_*.sql` variants (`daily`, `simple`, `fixed`). Which applies depends on tool ordering — verify before applying.
- Public assets: only `index.html` is committed; everything else client-rendered.
- `src/db/migrations/` is empty; Drizzle-Kit is set up but no migrations are written.

## 17.4 React hook one-true-ordering

`GenericCrud` unconditionally calls **every** bypass `useServerFn` to keep hook counts stable across renders. Per source warning: *"conditional hook allocation flips hook order across renders and crashes Dialog mounts."* New consumers should follow this pattern when adding new bypass tables.

## 17.5 CSS variables you can rely on

```
--primary            --color-primary (deep emerald)
--gold               --color-gold
--secondary          --secondary-emerald
--background         --color-background (cream)
--foreground         --color-foreground
--sidebar / --sidebar-foreground / --sidebar-primary / --sidebar-accent / --sidebar-border / --sidebar-ring
```

Dark mode flips some tokens (gold becomes primary accent in dark).

## 17.6 Tenant-prefix contract on R2

```
<tenantId>/<entityType>/<entityId>/<hash>.<ext>
```

`generateObjectKey` in `src/lib/r2.server.ts` enforces the leading `tenantId`. Do not bypass — prefix check in `getR2DownloadUrl`/`deleteR2Object` will refuse mismatches.