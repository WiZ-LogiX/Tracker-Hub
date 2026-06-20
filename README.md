# PeleCanon — Pricing & Production System

نظام تسعير وعروض أسعار وتتبع إنتاج لـ PeleCanon.

## Stack

- **Frontend**: React 19 + TanStack Start (SSR) + TanStack Router (file-based)
- **UI**: shadcn/ui + Tailwind v4 + Lucide icons
- **DB**: Drizzle ORM + Supabase PostgreSQL
- **Auth**: Supabase Auth (email/password)
- **Storage**: Cloudflare R2 (S3-compatible, presigned uploads)
- **i18n**: i18next + react-i18next (ar / en / fr)
- **Deployment**: Cloudflare Workers

## Setup

```bash
bun install
cp .env.example .env   # then fill in the values
bun dev                # http://localhost:5173
```

## Scripts

```bash
bun dev         # dev server
bun build       # production build (Cloudflare Workers)
bun preview     # preview the build
bun lint        # eslint
```

## Architecture

```
src/
  components/ui/      shadcn components
  components/admin/   composite admin widgets
  routes/             TanStack Router file routes
    admin/            admin pages (/admin/...)
    track.tsx         public order tracking (/track)
    auth.tsx          sign in
  lib/                utils, server fns, pricing engine
  db/                 Drizzle schema + client
  integrations/       Supabase clients (auth, admin)
  i18n/               i18n config + locales
  styles.css          Tailwind v4 + design tokens
```

## Notes for contributors

- Use `@/components/ui/*` for UI primitives (never raw Radix).
- Use server functions (`createServerFn` + `useServerFn`) instead of direct `supabase.from()` in components.
- All file uploads go through Cloudflare R2 via `@/lib/r2.functions` — never upload to Supabase Storage.
- Translation keys live under `src/i18n/locales/{ar,en,fr}.json`. Do not hardcode strings in components.
- Add a @/db/schema.ts entry whenever you add a table — the file is the source of truth for Drizzle types.