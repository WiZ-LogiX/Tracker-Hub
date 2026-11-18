# PeleCanon ERP — Reference Documentation Catalog (`refs/`)

This directory contains the complete archive of technical reports, security audits, architecture reviews, migration runbooks, and project handoff documents produced during the development, stabilization, and production verification of PeleCanon ERP.

---

## 🌟 Primary Transition Document

- [**PELECANON_PROJECT_HANDOFF.md**](./PELECANON_PROJECT_HANDOFF.md)  
  *The primary master handoff document.* Contains the complete architecture baseline, verification matrix, tech stack, 34-table database schema, RBAC 3-state resolution engine, fail-close security policies, canonical `PLC-XXXXX` commercial quotation lifecycles, and operational runbook.

---

## 📑 Categorized Reference Archives

### 1. Source-of-Truth Reconciliation & Verification Reports
- [**pelecanon_source_of_truth_reconciliation_report.md**](./pelecanon_source_of_truth_reconciliation_report.md)  
  Phase 0 reconciliation of repository facts, environment configuration, database isolation, lockfiles, and prior report claims.
- [**pelecanon_phase_1_verification_report.md**](./pelecanon_phase_1_verification_report.md)  
  Phase 1 test execution report, mock bearer token analysis, public tracking investigation, and Docker PG verification.
- [**pelecanon_release_readiness_audit_report.md**](./pelecanon_release_readiness_audit_report.md)  
  Comprehensive release readiness audit against operational requirements.
- [**pelecanon_production_release_readiness_report.md**](./pelecanon_production_release_readiness_report.md)  
  Readiness checklist covering build bundles, SSR routes, and database migrations.
- [**pelecanon_production_release_blocker_resolution_report.md**](./pelecanon_production_release_blocker_resolution_report.md)  
  Detailed analysis and resolution of production deployment blockers.
- [**pelecanon_full_production_release_report.md**](./pelecanon_full_production_release_report.md)  
  Full production release verification across all functional subsystems.
- [**pelecanon_final_merge_acceptance_report.md**](./pelecanon_final_merge_acceptance_report.md)  
  Final acceptance review covering code quality, tests, and merge prerequisites.
- [**pelecanon_final_integration_and_merge_readiness_report.md**](./pelecanon_final_integration_and_merge_readiness_report.md)  
  Integration readiness audit.
- [**pelecanon_post_release_stabilization_report.md**](./pelecanon_post_release_stabilization_report.md)  
  Post-release monitoring and stabilization verification.

### 2. RBAC & Access Management Security Audits
- [**pelecanon_rbac_security_audit_report.md**](./pelecanon_rbac_security_audit_report.md)  
  In-depth audit of user assignments, predefined access profiles, custom roles, and permission catalogs.
- [**pelecanon_rbac_security_integrity_audit_report.md**](./pelecanon_rbac_security_integrity_audit_report.md)  
  Integrity verification of explicitly empty permission sets, hardcoded authorization checks, and worker isolation.
- [**pelecanon_rbac_implementation_acceptance_report.md**](./pelecanon_rbac_implementation_acceptance_report.md)  
  Acceptance report for the unified 3-state RBAC resolution engine and `/admin/team` interface.
- [**pelecanon_user_access_management_simplification_report.md**](./pelecanon_user_access_management_simplification_report.md)  
  Non-technical access management UI redesign report.
- [**pelecanon_final_access_security_acceptance_report.md**](./pelecanon_final_access_security_acceptance_report.md)  
  Final security acceptance of dynamic RBAC and direct URL protections.

### 3. Commercial Quotation & Pricing Engine
- [**commercial_quotation_builder_simplified_report.md**](./commercial_quotation_builder_simplified_report.md)  
  Design and implementation of the simplified commercial quotation builder (`/admin/quotes/new`).
- [**quotation_builder_gap_closure_report.md**](./quotation_builder_gap_closure_report.md)  
  Resolution of commercial quotation requirements and unselected category workflows.
- [**quotation_builder_ux_final_verification_report.md**](./quotation_builder_ux_final_verification_report.md)  
  Verification of draft saving, live modal preview, specs templates, and Shaheen PDF styling.
- [**quotation_configurator_retirement_report.md**](./quotation_configurator_retirement_report.md)  
  Verification of the permanent retirement and redirection of `/admin/quotes/configurator`.
- [**quotation_final_acceptance_audit.md**](./quotation_final_acceptance_audit.md)  
  Final acceptance audit of the commercial quotation workflow.
- [**quotation_restoration_report.md**](./quotation_restoration_report.md)  
  Commercial quotation restoration and backward compatibility review.
- [**pelecanon_quotation_centered_business_integration_report.md**](./pelecanon_quotation_centered_business_integration_report.md)  
  Quotation-to-order and downstream operational integration report.
- [**pelecanon_performance_and_quotation_standardization_report.md**](./pelecanon_performance_and_quotation_standardization_report.md)  
  Canonical `PLC-XXXXX` numbering standardization and database performance optimization.

### 4. Storage, File Access & Cloudflare R2
- [**pelecanon_r2_storage_and_backup_audit.md**](./pelecanon_r2_storage_and_backup_audit.md)  
  Cloudflare R2 architecture, S3 SDK integration, and backup procedures audit.
- [**pelecanon_r2_security_hardening_and_backup_report.md**](./pelecanon_r2_security_hardening_and_backup_report.md)  
  Presigned URL security, tenant scoping, and backup policy review.
- [**pelecanon_customer_readonly_file_access_report.md**](./pelecanon_customer_readonly_file_access_report.md)  
  Customer capability-based file access and 10-minute signed URL expiration verification.

### 5. Production Deployments, Runbooks & Database Migrations
- [**service_cases_final_production_deployment_runbook.md**](./service_cases_final_production_deployment_runbook.md)  
  Step-by-step production migration runbook for service cases and after-sales.
- [**service_cases_production_deployment_execution_report.md**](./service_cases_production_deployment_execution_report.md)  
  Execution report for service cases production deployment.
- [**service_cases_production_migration_safety_review.md**](./service_cases_production_migration_safety_review.md)  
  Pre-flight migration safety review, rollback verification, and data integrity checks.
- [**service_cases_schema_repair_readiness_report.md**](./service_cases_schema_repair_readiness_report.md)  
  Schema repair readiness review for service cases table relationships.

### 6. UI/UX, Design System & Atelier Prestige
- [**pelecanon_premium_homepage_redesign_report.md**](./pelecanon_premium_homepage_redesign_report.md)  
  Implementation report for the luxury Atelier Prestige homepage.
- [**pelecanon_brand_palette_implementation_report.md**](./pelecanon_brand_palette_implementation_report.md)  
  Emerald Prestige design tokens, CSS theme variables, and brand styling report.
- [**pelecanon_complete_ui_ux_and_visual_stabilization_report.md**](./pelecanon_complete_ui_ux_and_visual_stabilization_report.md)  
  Full visual stabilization, contrast compliance, and typography review.
- [**pelecanon_final_ui_ux_acceptance_report.md**](./pelecanon_final_ui_ux_acceptance_report.md)  
  Final acceptance audit across all administrative views and drawers.
- [**pelecanon_application_quality_and_localization_report.md**](./pelecanon_application_quality_and_localization_report.md)  
  Arabic/English/French localization consistency, RTL layout alignment, and quality report.

### 7. Workflows, Operational Tasks, Projects & Inventory
- [**pelecanon_workflow_integration_project_entity_report.md**](./pelecanon_workflow_integration_project_entity_report.md)  
  Implementation and verification of the `projects` table (34th table) and project workspaces.
- [**pelecanon_operational_workflow_and_navigation_integration_report.md**](./pelecanon_operational_workflow_and_navigation_integration_report.md)  
  Operational navigation integration across all 22 administrative sections.
- [**pelecanon_operational_task_workflow_integration_report.md**](./pelecanon_operational_task_workflow_integration_report.md)  
  Task Management 2.0 integration, Kanban views, and worker restrictions.
- [**pelecanon_task_management_unified_workspace_report.md**](./pelecanon_task_management_unified_workspace_report.md)  
  Unified task workspace architecture and stage progression.
- [**pelecanon_inventory_workspace_optimization_report.md**](./pelecanon_inventory_workspace_optimization_report.md)  
  Inventory tracking, stock adjustments, and supplier linkage optimization.
- [**pelecanon_catalog_inventory_and_admin_cleanup_report.md**](./pelecanon_catalog_inventory_and_admin_cleanup_report.md)  
  Catalog cleanup and admin routing consolidation report.
- [**pelecanon_customer_centric_quotation_and_tracking_report.md**](./pelecanon_customer_centric_quotation_and_tracking_report.md)  
  Customer 360 drawer and hardened public tracking page verification.

### 8. System Diagnostics & Error Audits
- [**system_error_audit_and_repair_report.md**](./system_error_audit_and_repair_report.md)  
  Full audit and repair of unhandled promise rejections, Radix accessibility warnings, and SSR error boundaries.
