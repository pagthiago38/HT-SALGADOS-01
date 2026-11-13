-- HT SALGADOS GESTÃO
-- Execute no SQL Editor do Supabase antes de publicar a API.
-- Os módulos existentes são preservados em registros JSONB tipados por coleção.
-- O isolamento por usuário é aplicado por RLS e também pelo backend.

create extension if not exists pgcrypto;

create table if not exists public.app_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in (
    'products','combos','sales','stock_movements','expenses','movements',
    'settings','audit_log','counters','snapshots'
  )),
  record_id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, collection, record_id)
);

create index if not exists app_records_owner_collection_idx
  on public.app_records (owner_id, collection);
create index if not exists app_records_data_gin_idx
  on public.app_records using gin (data jsonb_path_ops);
create index if not exists app_records_created_at_idx
  on public.app_records (owner_id, collection, created_at desc);

create or replace function public.set_app_records_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_records_updated_at on public.app_records;
create trigger app_records_updated_at
before update on public.app_records
for each row execute procedure public.set_app_records_updated_at();

alter table public.app_records enable row level security;
alter table public.app_records force row level security;

drop policy if exists "Users can read their own HT records" on public.app_records;
create policy "Users can read their own HT records"
  on public.app_records for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Users can insert their own HT records" on public.app_records;
create policy "Users can insert their own HT records"
  on public.app_records for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can update their own HT records" on public.app_records;
create policy "Users can update their own HT records"
  on public.app_records for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can delete their own HT records" on public.app_records;
create policy "Users can delete their own HT records"
  on public.app_records for delete to authenticated
  using (owner_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.app_records to authenticated;
