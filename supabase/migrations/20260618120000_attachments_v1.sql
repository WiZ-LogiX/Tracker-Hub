-- Attachments table — generic file uploads scoped to a tenant.
-- entity_type accepts order / quote / invoice / customer.
-- is_public: true → render via R2 public CDN URL; false → require signed GET.
-- All policies go through the same is_tenant_member UDF the rest of the
-- schema uses, so we keep one tenant boundary everywhere.

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('order','quote','invoice','customer')),
  entity_id uuid not null,
  file_name text not null,
  storage_key text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  caption text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists attachments_tenant_id_idx on public.attachments(tenant_id);
create index if not exists attachments_entity_idx on public.attachments(entity_type, entity_id);
create index if not exists attachments_tenant_id_created_at_idx
  on public.attachments(tenant_id, created_at desc);

alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select
  using (
    public.is_tenant_member(
      tenant_id,
      array['owner','admin','sales','worker','viewer']::public.tenant_role[]
    )
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert
  with check (
    public.is_tenant_member(
      tenant_id,
      array['owner','admin','sales']::public.tenant_role[]
    )
  );

drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments
  for update
  using (
    public.is_tenant_member(
      tenant_id,
      array['owner','admin','sales']::public.tenant_role[]
    )
  )
  with check (
    public.is_tenant_member(
      tenant_id,
      array['owner','admin','sales']::public.tenant_role[]
    )
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete
  using (
    public.is_tenant_member(
      tenant_id,
      array['owner','admin']::public.tenant_role[]
    )
  );