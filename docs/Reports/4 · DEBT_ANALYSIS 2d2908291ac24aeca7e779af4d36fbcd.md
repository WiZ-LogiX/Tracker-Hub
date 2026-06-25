# 4 · DEBT_ANALYSIS

<aside>
🧾

**Phase 4 — Technical Debt Assessment.** Debt classification + business/engineering impact + remediation effort.

</aside>

| Type | Debt | Business impact | Engineering impact | Risk | Effort |
| --- | --- | --- | --- | --- | --- |
| Architectural | RLS-only tenancy (no app middleware) | High | High | Critical | 1-2 days |
| Architectural | Two parallel pricing engines | High | Medium | High | 2-3 days |
| Architectural | No transactional order chain | High | High | Critical | 2-3 days |
| Code | Incomplete Drizzle typing (3 of 33 tables) | Low | High | High | 3-4 days |
| Code | drop artefacts + dead references | Low | Low | Low | 0.5 day |
| Testing | No test script at all in package.json | High | Very high | Critical | ongoing |
| Infrastructure | Empty migrations folder + no clear IaC | Medium | High | High | 2-3 days |
| Infrastructure | Notifications with no retry/DLQ | Medium | Medium | High | 1-2 days |
| Process | No documented CI/CD + no environments matrix | Medium | High | High | 2-3 days |
| Documentation | Contradictions + gaps (SLA/RBAC/data flows) | Low | Medium | Medium | ongoing |
| Product | auth hack (synthetic emails) + no granular RBAC | Medium | Medium | High | 1 week |

## 🎯 Debt Paydown Priority

1. **Tenant isolation middleware** (Critical, security).
2. **Test harness** (Critical, unlocks any safe fix).
3. **Transactional order chain** (Critical, data safety).
4. **Observability** (prerequisite for production).
5. **Drizzle typing + pricing consolidation** (maintainability).
6. **Notifications retry/DLQ + PDF + i18n** (experience).

<aside>
💡

Note: this order matches the OpenCode prompt sequence (Prompt 0→3) — intentional.

</aside>