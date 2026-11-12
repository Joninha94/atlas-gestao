-- Produtiva: cadastro inicial de clientes e guias do Monitor Fiscal.
create table if not exists public.produtiva_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document text not null,
  legal_name text not null,
  tax_regime text not null default 'OUTRO'
    check (tax_regime in ('SIMPLES', 'MEI', 'PRESUMIDO', 'REAL', 'OUTRO')),
  uf char(2),
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document),
  unique (id, user_id)
);

create table if not exists public.produtiva_guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  guide_type text not null
    check (guide_type in ('DAS_SIMPLES', 'DAS_MEI', 'DCTFWEB_DARF', 'FGTS_MENSAL', 'PARCELAMENTO', 'OUTRA')),
  competence text not null,
  due_date date not null,
  principal numeric(14, 2) not null default 0 check (principal >= 0),
  fine numeric(14, 2) not null default 0 check (fine >= 0),
  interest numeric(14, 2) not null default 0 check (interest >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'ENVIADA', 'VISUALIZADA', 'PAGA')),
  paid_at date,
  source text not null default 'MANUAL' check (source = 'MANUAL'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete cascade
);

alter table public.produtiva_clients enable row level security;
alter table public.produtiva_guides enable row level security;

create policy "produtiva_clients_owner" on public.produtiva_clients for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "produtiva_guides_owner" on public.produtiva_guides for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_produtiva_guides_user_due
  on public.produtiva_guides(user_id, due_date);
create index if not exists idx_produtiva_guides_client_competence
  on public.produtiva_guides(client_id, competence);
