# Project Memory — Index

> Modular project memory. Each section lives in its own file so contributors can update one topic without scrolling past the rest.

## Reading order (new contributors)

1. [Overview](./01-overview.md) — what the product is, lifecycle, where the project is today.
2. [Business Purpose](./02-business-purpose.md) — who it serves, what makes it distinctive.
3. [Architecture](./03-architecture.md) — request lifecycle, layering, where code lives.
4. [Directory Structure](./04-directory-structure.md) — annotated file tree.
5. [Core Components](./05-core-components.md) — pricing engine, order machine, photo pipeline, auth, GenericCrud.
6. [Data Flow](./06-data-flow.md) — quote→order, upload, avatar, notification paths.
7. [Domain Model](./07-domain-model.md) — tables, constraints, triggers.
8. [API Surface](./08-api-surface.md) — server function reference (the API is server fns, not REST).
9. [Authentication & Authorization](./09-auth.md) — synthetic-email pattern, middlewares, role checks.
10. [Configuration](./10-configuration.md) — env vars, build config, design tokens, i18n.
11. [Deployment](./11-deployment.md) — Cloudflare Workers pipeline, diagnostics page.
12. [Operations](./12-operations.md) — testing, migrations, cleanup, observability.
13. [External Services](./13-integrations.md) — Supabase, R2, n8n, Neon (in-progress).
14. [Design Decisions](./14-decisions.md) — why-things-are-the-way-they-are.
15. [Technical Debt](./15-debt.md) — known issues and where they live.
16. [Future Improvements](./16-future.md) — shortlist from `.lovable/STATUS.md` + codebase notes.
17. [Conventions & Quirks](./17-conventions.md) — naming, paths, gotchas.

## Source of truth

The `.lovable/` process docs still carry the **\[]** checklists and in-flight TODOs; this `memory/` set is the *static* narrative description (what the code does today).

- `.lovable/STATUS.md` — phase-by-phase progress.
- `.lovable/plan.md` — Phase 2 multi-tenant plan.
- `.lovable/neon-migration-plan.md` — Neon cutover plan with decision locks.