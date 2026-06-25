# 3 · ARCHITECTURE_REVIEW

<aside>
🏛️

**Phase 3 — Architecture Assessment.** Each finding has Description / Impact / Severity / Recommendation.

</aside>

## 🔴 Critical Findings

<aside>
🔴

**App-layer tenant isolation is missing**
**Description:** Isolation relies on RLS only; there's no tenantDb() middleware, and admin pages + some server fns use supabaseAdmin.
**Impact:** Cross-tenant data leakage.
**Recommendation:** Mandatory middleware + defense-in-depth + cross-tenant tests.

</aside>

<aside>
🔴

**No transactional integrity in quote→order→invoice**
**Description:** The chain isn't wrapped in a single transaction.
**Impact:** Partial orders / orphan invoices on any mid-chain failure.
**Recommendation:** db.transaction() + rollback + snapshot of the rule version.

</aside>

## 🟠 High Findings

<aside>
🟠

**Observability is near-zero**
**Impact:** Impossible to diagnose production issues.
**Recommendation:** structured logging + error tracking + tracing on server fns.

</aside>

<aside>
🟠

**Two parallel pricing engines (coupling/cohesion)**
**Impact:** Risk of divergent results + maintenance difficulty.
**Recommendation:** Make engine.ts the source of truth, and turn pricing.ts into a wrapper or remove it.

</aside>

<aside>
🟠

**Incomplete Drizzle schema (typing debt)**
**Impact:** server fns use raw access → runtime errors.
**Recommendation:** Define all 33 tables.

</aside>

## 🟡 Medium Findings

<aside>
🟡

**No real PDF (window.print)** — inappropriate for SaaS. Recommendation: server-side PDF → R2.

</aside>

<aside>
🟡

**No realtime** — the kanban needs polling. Recommendation: Supabase Realtime/WebSocket.

</aside>

<aside>
🟡

**Incomplete i18n** — ar/fr partial. Recommendation: CI check for missing keys.

</aside>

## 🟢 Low Findings

<aside>
🟢

**drop artefacts (companies/configurations)** — cleanup.

</aside>

<aside>
🟢

**Empty migrations folder** — document the current state.

</aside>

## 📐 Dimension Scorecard

| Dimension | Score | Note |
| --- | --- | --- |
| Modularity | 7/10 | server fns organized but tenancy leaks |
| Coupling | 6/10 | two pricing engines + supabaseAdmin |
| Cohesion | 7/10 | generally good |
| Scalability | 5/10 | untested |
| Security | 4/10 | app-layer leak |
| Maintainability | 6/10 | typing + tests missing |
| Reliability | 4/10 | no transactions/DLQ |
| Observability | 3/10 | weakest point |
| Performance | 6/10 | signed URL caching present |