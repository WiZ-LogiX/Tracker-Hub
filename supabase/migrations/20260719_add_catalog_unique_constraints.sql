-- Prevent duplicate catalog items per tenant by adding unique constraints on (tenant_id, code)

ALTER TABLE public.catalog_materials ADD CONSTRAINT uq_catalog_materials_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE public.catalog_finishes ADD CONSTRAINT uq_catalog_finishes_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE public.catalog_veneers ADD CONSTRAINT uq_catalog_veneers_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE public.catalog_edge_bands ADD CONSTRAINT uq_catalog_edge_bands_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE public.catalog_hardware ADD CONSTRAINT uq_catalog_hardware_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE public.catalog_accessories ADD CONSTRAINT uq_catalog_accessories_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE public.catalog_manufacturing_operations ADD CONSTRAINT uq_catalog_manufacturing_ops_tenant_code UNIQUE (tenant_id, code);
