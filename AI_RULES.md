# AI Rules — PeleCanon

## Tech Stack (bullet points)

- **Framework**: React 19 + TypeScript, built with **TanStack Start** (SSR/SSG) and **TanStack Router** (file-based routing)
- **UI Library**: **shadcn/ui** components (Radix UI primitives) — never build raw Radix components; import from `@/components/ui/*`
- **Styling**: **Tailwind CSS v4** (CSS-first config in `src/styles.css`); use `cn()` utility from `@/lib/utils.ts` for class merging
- **State & Data Fetching**: **TanStack Query v5** (`@tanstack/react-query`) for server state; server functions via `createServerFn` (TanStack Start)
- **Database**: **Drizzle ORM** with **Supabase PostgreSQL** (via `@neondatabase/serverless` HTTP driver for pooled connections); schema in `src/db/schema.ts`
- **Auth**: **Supabase Auth** (email/password + Google OAuth); client in `@/integrations/supabase/client.ts`, server admin client in `client.server.ts`
- **Forms & Validation**: **React Hook Form** + **Zod** schemas; resolvers via `@hookform/resolvers/zod`
- **Internationalization**: **i18next** + `react-i18next`; locales in `src/i18n/locales/*.json`; `useTranslation()` hook
- **Charts**: **Recharts** for analytics dashboards
- **Icons**: **Lucide React** exclusively (`lucide-react`)
- **Notifications**: **Sonner** (`sonner`) for toasts; `toast.success/error/info`
- **Date/Time**: **date-fns** for formatting; `date-fns/locale/ar` for Arabic
- **Deployment**: Cloudflare Workers via `@cloudflare/vite-plugin` + Wrangler (`wrangler.jsonc`)
- **File Storage**: **Cloudflare R2** (S3-compatible) for images, attachments, logos, production photos; accessed via `@aws-sdk/client-s3` + presigned URLs; `src/lib/r2.server.ts`

---

## Library Rules (what to use for what)

### UI & Components
| Need | Use | Don't Use |
|------|-----|-----------|
| Buttons, inputs, dialogs, tables, cards, dropdowns, tabs, etc. | `@/components/ui/*` (shadcn/ui) | Raw Radix, custom HTML, other UI kits |
| Icons | `lucide-react` (e.g. `import { Plus } from "lucide-react"`) | FontAwesome, Heroicons, SVGs inline |
| Toasts/notifications | `sonner` → `import { toast } from "sonner"` | `react-hot-toast`, custom alert divs |
| Charts | `recharts` | Chart.js, Victory, custom Canvas |
| Date picker | `react-day-picker` (already in deps) | Other date libs |

### Routing & Navigation
| Need | Use |
|------|-----|
| All routes | TanStack Router file-based routes in `src/routes/` |
| Links | `Link` from `@tanstack/react-router` |
| Programmatic navigation | `useNavigate()` from `@tanstack/react-router` |
| Route params/search | `Route.useParams()`, `Route.useSearch()` (type-safe) |

### Data Fetching & Server Functions
| Need | Use |
|------|-----|
| Server-side logic (DB, auth, external APIs) | `createServerFn` from `@tanstack/react-start` |
| Client-side consumption of server fns | `useServerFn(fn)` + `useQuery` / `useMutation` from `@tanstack/react-query` |
| Direct Supabase queries (client) | `supabase` from `@/integrations/supabase/client` (RLS enforced) |
| Admin/Service-role queries (server) | `supabaseAdmin` from `@/integrations/supabase/client.server` |
| Drizzle ORM queries (server) | `db` from `@/db/client.server.ts` (typed, provider-agnostic) |

### Database & Schema
| Need | Use |
|------|-----|
| Schema definitions | `src/db/schema.ts` (Drizzle, source of truth for types) |
| Migrations | Supabase CLI (`supabase migration new`) — **not** `drizzle-kit push` |
| Type-safe rows | `typeof table.$inferSelect` / `$inferInsert` from schema |

### Forms
| Need | Use |
|------|-----|
| Form state | `useForm` from `react-hook-form` |
| Validation | Zod schema + `zodResolver` from `@hookform/resolvers/zod` |
| Inputs | shadcn/ui `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`, `Switch` |

### Styling
| Need | Use |
|------|-----|
| Layout, spacing, colors | Tailwind utility classes |
| Class merging | `cn(...)` from `@/lib/utils.ts` |
| Dark mode | `ThemeProvider` + `useTheme()` (class-based on `html.dark`) |
| RTL (Arabic) | `dir="rtl"` on `html` + `rtl-flip` utility class for icons |

### Internationalization
| Need | Use |
|------|-----|
| Translations | `useTranslation()` → `t('key')` |
| Locale switching | `LanguageSwitcher` component (stores in localStorage) |
| Adding strings | Edit `src/i18n/locales/{ar,en,fr}.json` |

### Auth & Permissions
| Need | Use |
|------|-----|
| Current user/session/roles | `useAuth()` from `@/lib/useAuth.tsx` |
| Protected server fns | Middleware `requireSupabaseAuth` (adds `context: { supabase, userId, claims }`) |
| Admin checks | `roles.includes('admin')` or `isStaff` from `useAuth()` |

### File Structure Conventions
```
src/
  components/ui/       # shadcn/ui components (do not edit)
  components/admin/    # Admin-specific composite components
  lib/                 # Utils, hooks, server functions, pricing engine
  db/                  # Drizzle schema + client.server.ts
  integrations/supabase/  # Generated Supabase clients + types
  routes/              # TanStack Router file routes (pages)
  i18n/                # i18n config + locales
  styles.css           # Tailwind v4 config + design tokens
```

### Naming & Code Style
- **Components**: PascalCase (`QuoteDetail.tsx`)
- **Hooks**: `useCamelCase` (`useAuth.ts`)
- **Server functions**: `kebab-case.file.ts` (`send-notification.functions.ts`) or grouped in `lib/*.functions.ts`
- **Database columns**: snake_case in schema, camelCase in TypeScript (`nameAr`, `pricePerUnit`)
- **CSS variables**: `--color-*` in `styles.css` (Emerald Prestige palette)
- **No `any`** — use Drizzle/ Supabase generated types
- **No inline styles** — Tailwind only
- **No `console.log` in production code** — use structured logging if needed

### Forbidden / Avoid
- ❌ Direct `fetch` in components — use server fns + TanStack Query
- ❌ `supabase.from()` in components — move to server fns (RLS + security)
- ❌ Creating new UI primitives — compose from shadcn/ui
- ❌ `drizzle-kit push` against production — migrations only via Supabase
- ❌ Hardcoding "PeleCanon" strings — use `useTenant()` (Phase 2) or i18n keys
- ❌ Storing secrets in code — use environment variables (Cloudflare Workers secrets)
- ❌ Direct Supabase Storage uploads in components — use R2 presigned URLs via server fns
- ❌ Hardcoded bucket names — use `R2_BUCKET_NAME` env var

---

## Cloudflare R2 Integration Rules

### Storage Architecture
- **Primary**: Cloudflare R2 (S3-compatible) for all file assets
- **Legacy**: Supabase Storage (being migrated) — read-only fallback during transition
- **Access Pattern**: Client → Server Fn (presigned URL) → Direct R2 Upload → DB stores R2 key + public URL

### R2 Client Library (`src/lib/r2.server.ts`)
| Function | Purpose |
|----------|---------|
| `getUploadUrl(key, contentType, expiresIn?)` | Presigned PUT URL for direct browser→R2 upload |
| `getDownloadUrl(key, expiresIn?)` | Presigned GET URL for private object access |
| `deleteObject(key)` | Delete object from R2 |
| `generateObjectKey(tenantId, entityType, entityId, filename)` | Consistent key structure: `tenantId/entityType/entityId/hash.ext` |
| `getR2PublicUrl(key)` | Public URL for display (requires public bucket or custom domain) |
| `objectExists(key)` | Check if object exists |

### Server Functions (`src/lib/r2.functions.ts`)
- `getR2UploadUrl` — Single file upload URL (authenticated, tenant-scoped)
- `getR2BatchUploadUrls` — Multiple files at once (max 20)
- `getR2DownloadUrl` — Signed download URL for private access
- `deleteR2Object` — Delete from R2 (authenticated)

### Client Upload Flow
```tsx
// 1. Get presigned URLs from server fn
const { uploads } = await getR2BatchUploadUrls({
  data: { files, entityType: 'production-photos', entityId: orderId }
});

// 2. Upload directly to R2 from browser
for (const { uploadUrl, key } of uploads) {
  await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  // 3. Save R2 public URL to DB
  await supabase.from('production_photos').insert({ photo_url: getR2PublicUrl(key), ... });
}
```

### Migration (Supabase → R2)
- Admin page: `/admin/r2-migration`
- Server fns: `migratePhotosToR2`, `getMigrationStatus` in `src/lib/r2-migration.functions.ts`
- Run in batches with dry-run option first
- Updates `production_photos.photo_url` from Supabase URL → R2 public URL

### Environment Variables Required
```
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=pelecanon-assets
R2_PUBLIC_URL=https://your-custom-domain.com  # optional, for custom domain
```

### Database Schema Notes
- `production_photos.photo_url` stores R2 public URL (format: `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`)
- No new columns needed — URL format change is backward compatible
- Extraction helper: `extractR2Key(url)` in `tracking.functions.ts` for signed URL generation

### Quick Reference: R2 Imports
```ts
// Server-only R2 client
import { getUploadUrl, getDownloadUrl, deleteObject, generateObjectKey, getR2PublicUrl } from "@/lib/r2.server";

// Server functions (use in components via useServerFn)
import { getR2UploadUrl, getR2BatchUploadUrls, getR2DownloadUrl, deleteR2Object } from "@/lib/r2.functions";
import { migratePhotosToR2, getMigrationStatus } from "@/lib/r2-migration.functions";
```

---

## Phase 2 (Multi-Tenant) Rules — Active
- All business tables have `tenant_id` (NOT NULL)
- RLS policies use `is_tenant_member(tenant_id, roles[])`
- Admin routes live under `/admin` → will move to `/t/:slug/admin` in Phase 2
- `useTenant()` hook (to be created) provides `{ tenant, role, members }`
- Every server fn must resolve `tenantId` from session → `tenant_members`
- No cross-tenant queries — RLS enforces, but code must not attempt

---

## Quick Reference: Common Imports
```ts
// UI
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// Routing
import { Link, useNavigate } from "@tanstack/react-router";

// Data
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// DB (server only)
import { db } from "@/db/client.server";
import { materials } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Auth
import { useAuth } from "@/lib/useAuth";

// i18n
import { useTranslation } from "react-i18next";

// Utils
import { cn } from "@/lib/utils";
import { formatEGP } from "@/lib/pricing";