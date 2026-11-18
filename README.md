# PeleCanon — Pricing & Production System

نظام تسعير وعروض أسعار وتتبع إنتاج متعدد المستأجرين (Multi-Tenant ERP & Production System) لـ PeleCanon.

---

## 🚀 Overview

**PeleCanon** is a high-performance, multi-tenant SaaS ERP engineered for furniture manufacturers, joineries, and interior fit-out contractors in the Egyptian and regional markets. It features:
- **Arabic-First Luxury UI & LTR/RTL Support**: Cairo / Inter typography, Emerald Prestige brand palette, and dark/light modes.
- **Canonical Unified Commercial Chain (`PLC-XXXXX`)**: Standardized 5-character alphanumeric format binding Quote → Project (`PRJ-XXXXX`) → Order (`PLC-XXXXX`) → Delivery (`DEL-XXXXX`) → Invoice (`PLC-XXXXX`).
- **Commercial Quotation Engine (`/admin/quotes/new`)**: Consolidated quotation workspace supporting multi-category commercial terms, margins, wastage, and cost breakdown with Shaheen PDF generation.
- **Unified Dynamic RBAC**: 3-state permission resolution engine (`owner` super-admin, adjustable predefined profiles, custom roles, zero-permission fallback protection).
- **Cloudflare R2 Storage**: Direct browser-to-bucket presigned PUT uploads and bounded 10-minute customer signed GET URLs.
- **34 Tenant-Scoped Database Tables**: Fully typed Drizzle ORM schema with strict multi-tenant RLS isolation.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 19 + TanStack Start (SSR) + TanStack Router (file-based) |
| **UI Components & Styling** | shadcn/ui + Tailwind CSS v4 + Radix UI + Lucide Icons |
| **Database & ORM** | PostgreSQL 16 + Drizzle ORM (`src/db/schema.ts`, 34 tenant-scoped tables) |
| **Authentication & Tenancy** | Supabase Auth (Username/Password with synthetic `@pelecanon.local` email) |
| **Object Storage** | Cloudflare R2 (S3-compatible, presigned upload/download architecture) |
| **Document Generation** | `@react-pdf/renderer` with Arabic ligature and textkit wrap protection |
| **Internationalization** | `i18next` + `react-i18next` (`ar` / `en` / `fr`) |
| **Deployment Target** | Cloudflare Workers |

---

## 📦 Setup & Local Development

### 1. Prerequisites
- **Node.js**: v20+ or v22+
- **Docker**: For running the isolated PostgreSQL database (`pelecanon_isolated_pg`)
- **Package Manager**: `npm` (active lockfile `package-lock.json`)

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure local variables:
```bash
cp .env.example .env
```

Ensure the test database container is started on port 5433:
```bash
docker start pelecanon_isolated_pg
# Target: postgresql://postgres:postgres@localhost:5433/pelecanon_test
```

### 3. Installation & Run
```bash
npm install
npm run dev
```
Development server starts at `http://localhost:8081` (or configured dev port).

---

## 🧪 Testing & Verification

The project enforces strict verification gates with 100% pass rates:

```bash
# Typecheck (TypeScript compiler)
npm run typecheck

# Full Vitest Unit & Integration Suite (1,073 tests across 62 files)
npm test
# or: npx vitest run

# Playwright End-to-End Suite (165 tests across all user journeys)
npm run test:e2e

# Production Build (Vite client + Cloudflare Workers SSR bundle)
npm run build

# Preview Production Build (starts on port 8082)
npm run preview
```

---

## 📂 Project Architecture

```text
src/
├── components/
│   ├── ui/               # shadcn / Radix UI design primitives
│   └── admin/            # Composite admin widgets, drawers, dialogs
├── routes/               # TanStack Router file-based routes
│   ├── admin/            # Admin workspace routes (/admin/...)
│   │   ├── quotes/       # Commercial quotation builder (/admin/quotes/new)
│   │   ├── projects/     # Project workspaces (/admin/projects)
│   │   ├── team.tsx      # Dynamic RBAC & Access Management (/admin/team)
│   │   └── ...
│   ├── track.tsx         # Public order tracking page (/track)
│   └── auth.tsx          # Login & session initiation
├── lib/                  # Business logic, pricing engine, server functions
│   ├── rbac.ts           # 3-state RBAC resolver & permission checks
│   ├── tenant-context.ts # Tenant resolution and session helpers
│   ├── quote.functions.ts# Commercial quote lifecycles
│   └── ...
├── db/                   # Drizzle ORM schema & client
│   └── schema.ts         # 34 tenant-scoped tables
├── integrations/         # Supabase & Cloudflare R2 integration clients
│   └── supabase/         # Auth, middleware, and fail-close guards
├── i18n/                 # Localization config (ar, en, fr)
└── styles.css            # Tailwind v4 theme tokens
e2e/                      # Playwright E2E test specs & global setup
refs/                     # Comprehensive audit reports, runbooks, and project handoff
```

---

## 🔒 Security Principles

1. **Strict Multi-Tenancy**: Every business table enforces `tenant_id NOT NULL` and RLS isolation.
2. **Fail-Close Mock Auth**: Mock bearer tokens (`mock-...`) are strictly permitted only in development or test environments (`process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"`).
3. **Public Tracking Hardening**: Public lookups require cryptographic `tracking_token` UUIDs; phone lookups are rate-limited and bounded.
4. **Cloudflare R2 TTL**: Customer signed URLs expire in 10 minutes; all uploads use presigned browser-to-bucket URLs.
5. **No Production Database Mutation During Tests**: Verification runs exclusively against `localhost:5433/pelecanon_test`.
