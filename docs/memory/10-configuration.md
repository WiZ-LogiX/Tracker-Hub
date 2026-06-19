# 10. Configuration

## 10.1 Environment variables

### Client-visible (Vite `VITE_*` prefix)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Server-only (`process.env.*` / Cloudflare Workers Secrets)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(RLS bypass)*
- `DATABASE_URL` *(Neon, preferred)*
- `SUPABASE_DB_URL` *(legacy fallback)*
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` *(preferred) or `R2_BUCKET_NAME`* (default `pelecanon-assets`)
- `R2_PUBLIC_URL` *(optional; only when bucket is public-read)*
- `N8N_NOTIFY_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN` *(sent as `X-Lovable-Token`)*
- `SITE_URL` *(used by `sendNotification` to build the tracking link)*

### Defaults
- Bucket: `R2_BUCKET_NAME || R2_BUCKET || 'pelecanon-assets'`.
- Public URL: `${R2_PUBLIC_URL}/${key}` if set, else `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key}`.

## 10.2 Build-time

- **`vite.config.ts`** uses `@lovable.dev/vite-tanstack-config` and only redirects the bundled server entry to `src/server.ts` (`tanstackStart.server.entry = "server"`). Comment warns: *"wrangler.jsonc main alone is insufficient."*
- **`wrangler.jsonc`** — Cloudflare Workers target. Known to point at `src/server.ts` and the `pelecanon` R2 bucket.
- **`tsconfig.json`** — uses "@/*" path alias.
- **`drizzle.config.ts`** — `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "./drizzle"`, fallback `DATABASE_URL || SUPABASE_DB_URL`.

## 10.3 Design tokens (`src/styles.css`)

Tailwind v4 CSS-first config, tokens under `@theme inline`:

| Token | Value (oklch) | Hex |
|---|---|---|
| `--primary` | `0.33 0.085 165` | `#064e3b` (deep emerald) |
| `--gold` | `0.74 0.12 85` | `#c9a84c` |
| `--background` | `0.985 0.012 95` | warm cream |
| `--foreground` | `0.22 0.05 165` | near-black emerald |

Fonts via `@fontsource` (self-hosted, no CDN): **Cairo** (sans), **Playfair Display** (serif), **Inter** (fallback).

Utilities:
- `.gradient-emerald` — linear gradient emerald-deep → emerald-lighter.
- `.rtl-flip` — `transform: scaleX(-1)` for LTR icons inside `[dir="rtl"]`.
- Dark mode class-based on `html.dark` (separate `--primary` and `--gold` tokens).

## 10.4 shadcn config (`components.json`)

Tailwind v4 + neutral base color, RSC disabled, jsx runtime "automatic", typescript. All `src/components/ui/*` are committed and read-only.

## 10.5 i18n (`src/i18n/index.ts`)

- `fallbackLng = 'en'` — any missing key resolves to its English string (so the page never gets stuck on Arabic because the user picked English).
- Supported: `ar`, `en`, `fr`. Defined as `SUPPORTED_LANGS` + `LANG_META`.
- localStorage key: `pelecanon-lang`.
- `parseMissingKeyHandler`: returns last dotted segment when a key is missing.

## 10.6 Supabase config (`supabase/config.toml`)

- Edge function `migrate-helper` deploys with `ACCESS_KEY` env, `BUILD_ID = "2026-03-04"`. Uses CORS allowlist and no-cache headers.