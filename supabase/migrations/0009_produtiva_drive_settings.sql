-- Drive por cliente (pastas automáticas, lixeira de 20 dias), configurações do
-- escritório e recorrência trimestral/prazo no mês seguinte nas obrigações.

create table if not exists public.produtiva_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  office_name text,
  office_document text check (office_document is null or office_document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.produtiva_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid,
  parent_id uuid,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'LIVRE' check (kind in ('PADRAO', 'SISTEMA', 'LIVRE')),
  shared_with_client boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete cascade,
  foreign key (parent_id, user_id)
    references public.produtiva_folders(id, user_id) on delete cascade
);

create table if not exists public.produtiva_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid not null,
  client_id uuid,
  name text not null check (length(trim(name)) > 0),
  storage_path text not null unique,
  size bigint not null default 0 check (size >= 0),
  mime text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (folder_id, user_id)
    references public.produtiva_folders(id, user_id) on delete cascade,
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete cascade
);

alter table public.produtiva_settings enable row level security;
alter table public.produtiva_folders enable row level security;
alter table public.produtiva_files enable row level security;

create policy "produtiva_settings_owner" on public.produtiva_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "produtiva_folders_owner" on public.produtiva_folders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "produtiva_files_owner" on public.produtiva_files for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_produtiva_folders_user_client
  on public.produtiva_folders(user_id, client_id, parent_id);
create index if not exists idx_produtiva_files_folder
  on public.produtiva_files(folder_id);
create index if not exists idx_produtiva_files_user_deleted
  on public.produtiva_files(user_id, deleted_at) where deleted_at is not null;

-- Arquivos ficam em <user_id>/<cliente ou "escritorio">/<arquivo>; o primeiro
-- segmento do caminho é o dono.
insert into storage.buckets (id, name, public)
values ('produtiva-drive', 'produtiva-drive', false)
on conflict (id) do nothing;

create policy "produtiva_drive_owner_select" on storage.objects for select
  using (bucket_id = 'produtiva-drive' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "produtiva_drive_owner_insert" on storage.objects for insert
  with check (bucket_id = 'produtiva-drive' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "produtiva_drive_owner_delete" on storage.objects for delete
  using (bucket_id = 'produtiva-drive' and (storage.foldername(name))[1] = auth.uid()::text);

-- Obrigações: trimestral e deslocamento do prazo (0 = mês da competência,
-- 1 = mês seguinte...). Modelos existentes ficam com 0, sem mudar o prazo.
alter table public.produtiva_task_templates
  drop constraint if exists produtiva_task_templates_cadence_check,
  drop constraint if exists produtiva_task_templates_check;

alter table public.produtiva_task_templates
  add column if not exists due_month_offset smallint not null default 0
    check (due_month_offset between 0 and 3),
  add constraint produtiva_task_templates_cadence_check
    check (cadence in ('MENSAL', 'TRIMESTRAL', 'ANUAL')),
  add constraint produtiva_task_templates_due_month_check
    check ((cadence in ('MENSAL', 'TRIMESTRAL') and due_month is null)
      or (cadence = 'ANUAL' and due_month is not null));
