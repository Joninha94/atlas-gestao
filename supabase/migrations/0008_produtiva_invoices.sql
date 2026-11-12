-- Cadastro de NF-e importadas pelo escritório, vinculadas ao cliente quando identificado.
create table if not exists public.produtiva_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid,
  access_key text not null check (access_key ~ '^[0-9]{44}$'),
  direction text not null check (direction in ('ENTRADA', 'SAIDA', 'NAO_IDENTIFICADA')),
  document_number text,
  series text,
  issued_at timestamptz,
  issuer_document text,
  issuer_name text,
  recipient_document text,
  recipient_name text,
  total numeric(14, 2) not null default 0 check (total >= 0),
  xml_content text not null,
  source text not null default 'UPLOAD_XML' check (source = 'UPLOAD_XML'),
  created_at timestamptz not null default now(),
  unique (user_id, access_key),
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete set null (client_id)
);

alter table public.produtiva_invoices enable row level security;

create policy "produtiva_invoices_owner" on public.produtiva_invoices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_produtiva_invoices_user_issued
  on public.produtiva_invoices(user_id, issued_at desc);
create index if not exists idx_produtiva_invoices_client_issued
  on public.produtiva_invoices(client_id, issued_at desc);
